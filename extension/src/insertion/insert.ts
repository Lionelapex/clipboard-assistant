import type { InsertResult, InsertStrategy } from '../types';
import { getTrackedRange } from './focusTracker';
import {
  isContentEditableElement,
  isInputElement,
  isTextControl,
  ownerDocument,
} from './dom';
import { buildResult, normalizeText, readFieldValue, verifyText } from './verify';
import { typeTextIntoField } from './typing';
import { isRichHtml, sanitiseHtml } from './sanitise';
import { containsTable, htmlToPlainText } from '../lib/html-text';

export { normalizeText, readFieldValue, verifyText } from './verify';

export type InsertMode = 'auto' | 'paste' | 'type';

const CONTENTEDITABLE_SELECTOR =
  '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';

function controlPrototype(el: HTMLInputElement | HTMLTextAreaElement): object {
  const view = el.ownerDocument.defaultView ?? window;
  return isInputElement(el) ? view.HTMLInputElement.prototype : view.HTMLTextAreaElement.prototype;
}

function insertIntoInput(el: HTMLInputElement | HTMLTextAreaElement, text: string, note = ''): InsertResult {
  const startedAt = performance.now();
  const nativeSetter = Object.getOwnPropertyDescriptor(controlPrototype(el), 'value')?.set;

  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;

  let payload = text;
  let truncationNote = '';
  if (isInputElement(el)) {
    // Single-line inputs cannot hold line breaks; browsers silently strip them, which
    // would glue words together. Join lines with a space instead.
    payload = payload.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').trim();
    if (!payload) {
      return buildResult(el, 'none', text, el.value, startedAt, 'The text contained no insertable characters.');
    }
  }
  if (el.maxLength > 0) {
    const room = el.maxLength - (el.value.length - (end - start));
    if (room <= 0) {
      return buildResult(el, 'none', text, el.value, startedAt, 'The field has reached its character limit.');
    }
    if (payload.length > room) {
      payload = payload.slice(0, room);
      truncationNote = `Trimmed to the field's ${el.maxLength}-character limit.`;
    }
  }

  const nextValue = el.value.slice(0, start) + payload + el.value.slice(end);

  el.focus({ preventScroll: true });
  if (nativeSetter) {
    // Bypasses React's patched instance setter so its value tracker notices the
    // change and the application's onChange handler runs on the dispatched input event.
    nativeSetter.call(el, nextValue);
  } else {
    el.value = nextValue;
  }

  const caret = start + payload.length;
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* some input types do not support selection ranges */
  }

  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertText',
      data: payload,
    }),
  );

  return buildResult(
    el,
    'native-value-setter',
    payload,
    readFieldValue(el),
    startedAt,
    [note, truncationNote].filter(Boolean).join(' '),
  );
}

function placeCaretAtEnd(el: HTMLElement): void {
  const doc = ownerDocument(el);
  const range = doc.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = doc.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertViaRange(el: HTMLElement, text: string): void {
  const doc = ownerDocument(el);
  let range = getTrackedRange();
  const selection = doc.getSelection();

  if (!range || !el.contains(range.commonAncestorContainer)) {
    el.focus({ preventScroll: true });
    placeCaretAtEnd(el);
    range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  }

  if (!range) return;

  range.deleteContents();
  const fragment = doc.createDocumentFragment();
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(doc.createElement('br'));
    if (line) fragment.appendChild(doc.createTextNode(line));
  });
  range.insertNode(fragment);
  range.collapse(false);

  selection?.removeAllRanges();
  selection?.addRange(range);

  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertText',
      data: text,
    }),
  );
}

function insertIntoContentEditable(
  el: HTMLElement,
  text: string,
  html: string | null,
  plainFallback: string = text,
): InsertResult {
  const startedAt = performance.now();
  const doc = ownerDocument(el);
  el.focus({ preventScroll: true });

  const savedRange = getTrackedRange();
  if (savedRange && el.contains(savedRange.commonAncestorContainer)) {
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange);
  } else {
    placeCaretAtEnd(el);
  }

  if (html) {
    const clean = sanitiseHtml(html);
    if (isRichHtml(clean)) {
      let htmlOk = false;
      try {
        htmlOk = doc.execCommand('insertHTML', false, clean);
      } catch {
        htmlOk = false;
      }
      const richActual = readFieldValue(el);
      if (htmlOk && verifyText(text, richActual).verified) {
        return buildResult(el, 'insert-html', text, richActual, startedAt, 'Pasted with its original formatting.');
      }
      if (htmlOk && richActual.trim()) {
        return buildResult(
          el,
          'insert-html',
          text,
          richActual,
          startedAt,
          'The rich-text editor changed the pasted markup.',
        );
      }
    }
  }

  let strategy: InsertStrategy = 'exec-command';
  let ok = false;

  try {
    ok = doc.execCommand('insertText', false, plainFallback);
  } catch {
    ok = false;
  }

  if (!ok || normalizeText(readFieldValue(el)).indexOf(normalizeText(plainFallback).slice(0, 12)) === -1) {
    strategy = 'range-insert';
    insertViaRange(el, plainFallback);
  }

  const actual = readFieldValue(el);
  const verification = verifyText(plainFallback, actual);

  if (!ok && !verification.verified) {
    return buildResult(el, 'none', plainFallback, actual, startedAt, 'The rich-text editor rejected the insertion.');
  }

  return buildResult(el, strategy, plainFallback, actual, startedAt);
}

/**
 * Inserts `text` into `el`.
 *
 * - `paste`  : one programmatic value change (fast; what a normal paste does)
 * - `type`   : character-by-character typing (for fields that reject bulk changes)
 * - `auto`   : paste first, then retype only if the field reverted the value unchanged
 */
export async function insertTextIntoField(
  el: HTMLElement,
  text: string,
  mode: InsertMode = 'auto',
  html: string | null = null,
): Promise<InsertResult> {
  if (!el.isConnected) {
    const startedAt = performance.now();
    return {
      ok: false,
      verified: false,
      strategy: 'none',
      detail: 'The previously focused field is no longer on the page.',
      field: null,
      expectedChars: text.length,
      actualChars: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const canPaste = isTextControl(el) || el.matches(CONTENTEDITABLE_SELECTOR) || isContentEditableElement(el);
  if (!canPaste) {
    const startedAt = performance.now();
    return {
      ok: false,
      verified: false,
      strategy: 'none',
      detail: 'This element is not a supported text-entry field: it draws text without holding an editable value.',
      field: null,
      expectedChars: text.length,
      actualChars: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const tableText = html && containsTable(html) ? htmlToPlainText(html) : '';
  const tableAsText = Boolean(tableText && tableText.includes('\t'));
  const fieldText = tableAsText ? tableText : text;
  const tableNote = tableAsText
    ? 'The field cannot display a table, so its rows and columns were pasted as tab-separated text.'
    : '';

  if (mode === 'type') {
    return typeTextIntoField(el, fieldText);
  }

  const before = readFieldValue(el);
  const pasted = isTextControl(el)
    ? insertIntoInput(el, fieldText, tableNote)
    : insertIntoContentEditable(el, text, html, fieldText);

  if (mode === 'paste' || pasted.verified) return pasted;

  // A field that silently reverts a bulk change is the signature of "typing only" input.
  // Retrying character by character is the only method that can satisfy it.
  const after = readFieldValue(el);
  if (after !== before) return pasted;

  const typed = await typeTextIntoField(el, fieldText);
  if (typed.verified) {
    return {
      ...typed,
      detail: `The field reverted the paste, so the text was typed character by character. ${typed.detail}`,
    };
  }
  return { ...typed, detail: `Paste and typing both failed. ${typed.detail}` };
}
