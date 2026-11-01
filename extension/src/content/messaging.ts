import {
  deepActiveElement,
  describeField,
  getActiveField,
  insertTextIntoField,
  lastTrackedFieldState,
  resolveEditable,
  type InsertMode,
} from '../insertion';
import { isHTMLElement, isInputElement, isTextAreaElement, isTextControl } from '../insertion/dom';
import { addHistory, getCurrentSnippet, markClipboardSeen, setCurrentSnippet } from '../storage';
import { readClipboardText } from '../clipboard/read';
import type { ContentContext, ContentInsertResponse, InsertFailureReason } from '../types';
import { emitFlashStatus, emitOpenPanel, emitTogglePanel } from './bus';

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

function unsupportedReason(el: HTMLElement): string | null {
  if (isInputElement(el)) {
    const type = (el.type || 'text').toLowerCase();
    return TEXT_INPUT_TYPES.has(type) ? null : `Input type "${type}" cannot contain text.`;
  }
  if (isTextAreaElement(el)) return null;
  if (el.isContentEditable) return null;
  return 'This element does not accept text.';
}

function failure(reason: InsertFailureReason, detail: string): ContentInsertResponse {
  return { ok: false, verified: false, reason, detail, field: null };
}

/** What the popup needs before offering Paste: the origin and the last focused field. */
export function currentContext(): ContentContext {
  const tracked = lastTrackedFieldState();
  const element =
    resolveEditable(deepActiveElement()) ??
    (tracked.element && tracked.element.isConnected ? tracked.element : null);
  return {
    origin: window.location.origin,
    field: element ? describeField(element) : null,
  };
}

function normalizeMode(value: unknown): InsertMode {
  return value === 'type' || value === 'paste' ? value : 'auto';
}

export async function insertFromRequest(text: unknown, mode: InsertMode = 'auto'): Promise<ContentInsertResponse> {
  if (typeof text !== 'string' || !text.trim()) {
    return failure('empty', 'There is nothing to paste.');
  }

  // The user may have selected a field that the page has since removed.
  const tracked = lastTrackedFieldState();
  if (tracked.removed) {
    return failure('removed', 'The field you selected was removed from the page. Click another field and try again.');
  }

  // Inspect the raw element first so disabled/read-only/unsupported states are reported
  // precisely instead of collapsing into a generic "no field".
  const active = deepActiveElement();
  const raw = isHTMLElement(active) ? active : tracked.element;

  if (
    raw &&
    !isTextControl(raw) &&
    !raw.isContentEditable &&
    raw.getAttribute('role') === 'textbox'
  ) {
    return failure(
      'unsupported',
      'This element only draws text: it has no editable value, so nothing can be inserted into it.',
    );
  }

  if (raw && isTextControl(raw)) {
    if (raw.disabled) return failure('disabled', 'That field is disabled and cannot be edited.');
    if (raw.readOnly) return failure('read-only', 'That field is read-only.');
    const unsupported = unsupportedReason(raw);
    if (unsupported) return failure('unsupported', unsupported);
    if (isInputElement(raw) && raw.type === 'number' && !Number.isFinite(Number(text.trim()))) {
      return failure('unsupported', 'That field only accepts numbers.');
    }
  }

  const target = getActiveField();
  if (!target) {
    return failure('no-field', 'Click into a text field on the page, then open the assistant and press Paste.');
  }

  if (isTextControl(target)) {
    if (target.disabled) return failure('disabled', 'That field is disabled and cannot be edited.');
    if (target.readOnly) return failure('read-only', 'That field is read-only.');
  }

  const unsupported = unsupportedReason(target);
  if (unsupported) return failure('unsupported', unsupported);
  if (isInputElement(target) && target.type === 'number' && !Number.isFinite(Number(text.trim()))) {
    return failure('unsupported', 'That field only accepts numbers.');
  }

  const result = await insertTextIntoField(target, text, mode);

  if (result.ok) {
    return {
      ok: true,
      verified: true,
      detail: result.detail,
      field: result.field,
      strategy: result.strategy,
      elapsedMs: result.elapsedMs,
      chars: result.expectedChars,
    };
  }

  return {
    ok: false,
    verified: false,
    reason: 'failed',
    detail: result.detail,
    field: result.field,
    strategy: result.strategy,
    elapsedMs: result.elapsedMs,
    chars: result.expectedChars,
  };
}

/** Selected text from the focused field or the page selection (frames included). */
function selectedText(): string {
  const active = deepActiveElement();
  if (isTextControl(active)) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    if (end > start) return active.value.slice(start, end);
  }
  const doc = active?.ownerDocument ?? document;
  return doc.getSelection?.()?.toString() ?? '';
}

/** Bridges popup/background messages into the content script's page-side state. */
export function installMessageBridge(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return undefined;
    if (sender.id && sender.id !== chrome.runtime.id) return undefined;

    switch (message.type) {
      case 'ca:toggle-panel':
        emitTogglePanel();
        sendResponse({ ok: true });
        return undefined;
      case 'ca:open-panel':
        emitOpenPanel();
        sendResponse({ ok: true });
        return undefined;
      case 'ca:get-context':
        sendResponse(currentContext());
        return undefined;
      case 'ca:insert-text': {
        void insertFromRequest(message.text, normalizeMode(message.mode)).then(sendResponse);
        return true;
      }
      case 'ca:capture-selection': {
        const text = selectedText();
        if (!text.trim()) {
          emitFlashStatus({
            kind: 'error',
            text: 'Nothing selected.',
            detail: 'Select some text on the page or in a field, then use the shortcut again.',
          });
          sendResponse({ ok: false, reason: 'empty' });
          return undefined;
        }
        void (async () => {
          await addHistory(text, 'copy');
          await setCurrentSnippet(text, 'copy');
          // Snapshot what the system clipboard holds at capture time. Automatic refresh must
          // not treat that older value as a new copy and overwrite this capture.
          try {
            const clipboard = await readClipboardText();
            if (clipboard.text) await markClipboardSeen(clipboard.text);
          } catch {
            /* the clipboard may be unreadable; refresh will try again */
          }
          emitFlashStatus({
            kind: 'success',
            text: `Captured ${text.length} characters`,
            detail: 'Ready to paste into any text field.',
          });
          sendResponse({ ok: true, chars: text.length });
        })();
        return true;
      }
      case 'ca:insert-current': {
        void (async () => {
          const text = await getCurrentSnippet();
          if (!text) {
            emitFlashStatus({
              kind: 'error',
              text: 'No stored text yet.',
              detail: 'Use Refresh in the panel, or the capture shortcut, first.',
            });
            sendResponse({ ok: false, reason: 'empty' });
            return;
          }
          const response = await insertFromRequest(text, normalizeMode(message.mode));
          const verb = response.strategy === 'typing' ? 'Typed and verified' : 'Pasted and verified';
          emitFlashStatus(
            response.ok
              ? {
                  kind: 'success',
                  text: `${verb} · ${text.length} characters`,
                  detail: response.field?.label,
                }
              : { kind: 'error', text: 'Paste could not be completed.', detail: response.detail },
          );
          sendResponse(response);
        })();
        return true;
      }
      default:
        return undefined;
    }
  });
}
