/**
 * Offscreen document.
 *
 * Service workers have no DOM, so clipboard access happens here. The document is
 * created on demand with the CLIPBOARD reason and is torn down by the browser when
 * it becomes idle.
 *
 * Both flavours are captured: plain text from a textarea paste, and rich HTML from a
 * contenteditable paste, so headings, bold text and lists survive the round trip.
 */
import { htmlToPlainText } from '../lib/html-text';

interface OffscreenRequest {
  target?: string;
  type?: string;
  text?: string;
  html?: string | null;
}

interface ClipboardPayload {
  text: string;
  html: string | null;
}

function pasteIntoTextarea(): string {
  const textarea = document.createElement('textarea');
  textarea.value = '';
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand('paste');
  } catch {
    /* the value stays empty */
  }
  const value = textarea.value;
  textarea.remove();
  return value;
}

function pasteIntoEditor(): string | null {
  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.style.position = 'fixed';
  editor.style.top = '0';
  editor.style.left = '0';
  editor.style.width = '1px';
  editor.style.height = '1px';
  editor.style.opacity = '0';
  editor.style.overflow = 'hidden';
  document.body.appendChild(editor);
  editor.focus();

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  let pasted = false;
  try {
    pasted = document.execCommand('paste');
  } catch {
    pasted = false;
  }
  const html = editor.innerHTML.trim();
  editor.remove();

  if (!pasted || !html) return null;
  return html;
}

async function readViaClipboardApi(): Promise<ClipboardPayload | null> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return null;
  try {
    const items = await navigator.clipboard.read();
    let text = '';
    let html: string | null = null;
    for (const item of items) {
      if (item.types.includes('text/html')) {
        html = await (await item.getType('text/html')).text();
      }
      if (item.types.includes('text/plain')) {
        text = await (await item.getType('text/plain')).text();
      }
    }
    if (!text && html) text = htmlToPlainText(html);
    if (!text && !html) return null;
    return { text, html };
  } catch {
    return null;
  }
}

/** Resolves with null instead of hanging when the clipboard API never settles. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function readClipboard(): Promise<ClipboardPayload> {
  // execCommand paste is synchronous and works even when the offscreen document has no
  // focus. navigator.clipboard.read() can wait forever in that state, so it is only a
  // last resort and is raced against a short timeout.
  const text = pasteIntoTextarea();
  const html = pasteIntoEditor();
  if (text || html) {
    return { text: text || (html ? htmlToPlainText(html) : ''), html };
  }

  const api = await withTimeout(readViaClipboardApi(), 1200);
  if (api) return api;

  // An empty clipboard is a normal state, not an error: the panel shows its placeholder
  // and keeps polling for the next copy.
  return { text: '', html: null };
}

async function writeClipboard(text: string, html: string | null): Promise<void> {
  if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return;
    } catch {
      /* fall through to the plain text path */
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (error) {
    // An empty execCommand copy is a no-op that would leave the clipboard unchanged,
    // so surface the failure instead of pretending the clipboard was cleared.
    if (!text) throw error;
  }

  if (html) {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.style.position = 'fixed';
    editor.style.top = '0';
    editor.style.left = '0';
    editor.style.opacity = '0';
    editor.innerHTML = html;
    document.body.appendChild(editor);
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const copied = document.execCommand('copy');
    editor.remove();
    if (copied) return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('The browser refused to update the clipboard.');
}

chrome.runtime.onMessage.addListener((message: OffscreenRequest, _sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return undefined;

  if (message.type === 'offscreen:read') {
    readClipboard()
      .then((payload) => sendResponse({ ok: true, text: payload.text, html: payload.html }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  }

  if (message.type === 'offscreen:write') {
    writeClipboard(message.text ?? '', message.html ?? null)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  }

  return undefined;
});
