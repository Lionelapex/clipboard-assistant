import type { ClipboardReadResult } from '../types';

export class ClipboardAccessError extends Error {
  readonly reason: 'empty' | 'denied' | 'unavailable' | 'unknown';

  constructor(reason: ClipboardAccessError['reason'], message: string) {
    super(message);
    this.name = 'ClipboardAccessError';
    this.reason = reason;
  }
}

interface BackgroundClipboardResponse {
  ok: boolean;
  text?: string;
  html?: string | null;
  error?: string;
}

async function readViaBackground(): Promise<ClipboardReadResult> {
  const response = (await chrome.runtime.sendMessage({
    target: 'background',
    type: 'clipboard:read',
  })) as BackgroundClipboardResponse | undefined;

  if (!response) throw new Error('No response from the extension service worker.');
  if (!response.ok) throw new Error(response.error || 'Clipboard read failed.');
  return {
    text: response.text ?? '',
    html: response.html ?? null,
    via: 'offscreen',
  };
}

function htmlToText(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>/gi, '\n');
  return (container.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

async function readViaNavigator(): Promise<ClipboardReadResult> {
  if (!navigator.clipboard) {
    throw new Error('The Clipboard API is not available in this context.');
  }

  if (typeof navigator.clipboard.read === 'function') {
    try {
      // A page clipboard read can sit behind a permission prompt; never let it stall a refresh.
      const items = await Promise.race([
        navigator.clipboard.read(),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
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
      if (!text && html) text = htmlToText(html);
      if (text || html) return { text, html, via: 'navigator.clipboard' };
    } catch {
      /* fall back to readText below */
    }
  }

  if (typeof navigator.clipboard.readText !== 'function') {
    throw new Error('The Clipboard API is not available in this context.');
  }
  return { text: await navigator.clipboard.readText(), html: null, via: 'navigator.clipboard' };
}

/**
 * Reads the clipboard, including its rich-text flavour when the source provides one.
 *
 * Primary path: the extension's offscreen document, which has clipboardRead permission
 * and therefore does not trigger a per-site permission prompt.
 * Fallback: the Clipboard API in the current page (the read is button-triggered, so a
 * user gesture is always present).
 */
export async function readClipboardText(): Promise<ClipboardReadResult> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // The offscreen document returns both flavours when the clipboard has HTML.
      // Never probe the page API here: on a plain-text clipboard that read can wait on a
      // permission prompt and stall every refresh.
      return await readViaBackground();
    } catch (error) {
      lastError = error;
    }

    try {
      return await readViaNavigator();
    } catch (error) {
      lastError = error;
    }

    if (attempt === 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }

  const name = lastError instanceof DOMException ? lastError.name : '';
  if (name === 'NotAllowedError') {
    throw new ClipboardAccessError(
      'denied',
      'Clipboard permission was denied. Click the page once, then press Refresh again.',
    );
  }
  const detail = lastError instanceof Error && lastError.message ? lastError.message : 'The clipboard is unavailable.';
  throw new ClipboardAccessError('unavailable', `Clipboard could not be read. ${detail}`);
}

interface BackgroundWriteResponse {
  ok: boolean;
  error?: string;
}

async function writeViaBackground(text: string, html: string | null): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    target: 'background',
    type: 'clipboard:write',
    text,
    html,
  })) as BackgroundWriteResponse | undefined;

  if (!response) throw new Error('No response from the extension service worker.');
  if (!response.ok) throw new Error(response.error || 'Clipboard write failed.');
}

/**
 * Writes text back to the clipboard. When HTML is available it is offered alongside the
 * plain text, so pasting into a rich editor keeps the original structure.
 */
export async function writeClipboardContent(text: string, html: string | null = null): Promise<void> {
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
      /* fall through to plain text */
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through to the offscreen worker */
  }

  try {
    await writeViaBackground(text, html);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    throw new ClipboardAccessError('unavailable', `Clipboard could not be updated. ${detail}`);
  }
}

/** Backwards-compatible alias for plain text writes. */
export async function writeClipboardText(text: string): Promise<void> {
  await writeClipboardContent(text, null);
}
