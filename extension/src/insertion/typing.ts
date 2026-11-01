import type { InsertResult } from '../types';
import { isContentEditableElement, isInputElement, isTextControl, ownerDocument } from './dom';
import { buildResult, readFieldValue } from './verify';

/** How many characters are typed before yielding to the page's event loop. */
const YIELD_EVERY = 16;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function execInsert(doc: Document, command: string, value: string | null): boolean {
  try {
    return doc.execCommand(command, false, value ?? undefined);
  } catch {
    return false;
  }
}

/** Inserts one character without the browser's editing pipeline (fallback path). */
function insertRawChar(el: HTMLElement, ch: string): void {
  if (isTextControl(el)) {
    const view = el.ownerDocument.defaultView ?? window;
    const proto = isInputElement(el) ? view.HTMLInputElement.prototype : view.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + ch + el.value.slice(end);
    if (setter) setter.call(el, next);
    else el.value = next;
    try {
      el.setSelectionRange(start + ch.length, start + ch.length);
    } catch {
      /* some input types cannot hold a caret */
    }
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch }),
    );
    return;
  }

  if (!isContentEditableElement(el)) return;
  const doc = ownerDocument(el);
  const selection = doc.getSelection();
  let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (!range || !el.contains(range.commonAncestorContainer)) {
    range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  const node = doc.createTextNode(ch);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  el.dispatchEvent(
    new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch }),
  );
}

/**
 * Types the text into the field one character at a time.
 *
 * Sites that reject programmatic value changes usually detect them by looking at the size
 * of a single input event (or by trusting only key events). Typing keeps every event small
 * and gives a cancelable `keydown` first, so:
 *   - a page that calls preventDefault() and maintains its own state (masked inputs) wins,
 *     and the extension leaves that character to it;
 *   - a page that only counts characters sees a stream of one-character edits, like a human.
 */
export async function typeTextIntoField(el: HTMLElement, text: string): Promise<InsertResult> {
  const startedAt = performance.now();
  const doc = ownerDocument(el);

  let payload = text.replace(/\r\n/g, '\n');
  if (isInputElement(el)) {
    // Single-line inputs cannot hold line breaks; join lines with a space.
    payload = payload.replace(/\n+/g, ' ');
  }

  let note = '';
  if (isTextControl(el) && el.maxLength > 0) {
    const room = el.maxLength - el.value.length;
    if (room <= 0) {
      return buildResult(el, 'none', text, el.value, startedAt, 'The field has reached its character limit.');
    }
    if (payload.length > room) {
      payload = payload.slice(0, room);
      note = `Trimmed to the field's ${el.maxLength}-character limit.`;
    }
  }

  el.focus({ preventScroll: true });

  const chars = Array.from(payload);
  let pageHandled = 0;
  let typed = 0;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];

    if (char === '\n' && isContentEditableElement(el)) {
      const down = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true });
      if (!el.dispatchEvent(down)) {
        pageHandled += 1;
      } else if (!execInsert(doc, 'insertParagraph', null)) {
        insertRawChar(el, '\n');
      }
    } else {
      const down = new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true, composed: true });
      const handledByPage = !el.dispatchEvent(down);
      if (handledByPage) {
        pageHandled += 1;
      } else if (!execInsert(doc, 'insertText', char)) {
        insertRawChar(el, char);
      }
      typed += 1;
    }

    if (index % YIELD_EVERY === YIELD_EVERY - 1) await tick();
  }

  await tick();

  const actual = readFieldValue(el);
  const detail = pageHandled
    ? `${note} Typed ${chars.length} characters; ${pageHandled} were handled by the page's own key handler.`.trim()
    : `${note} Typed character by character.`.trim();
  return buildResult(el, 'typing', payload, actual, startedAt, detail);
}
