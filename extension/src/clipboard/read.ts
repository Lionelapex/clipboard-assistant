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
  error?: string;
}

async function readViaBackground(): Promise<string> {
  const response = (await chrome.runtime.sendMessage({
    target: 'background',
    type: 'clipboard:read',
  })) as BackgroundClipboardResponse | undefined;

  if (!response) throw new Error('No response from the extension service worker.');
  if (!response.ok) throw new Error(response.error || 'Clipboard read failed.');
  return response.text ?? '';
}

async function readViaNavigator(): Promise<string> {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    throw new Error('The Clipboard API is not available in this context.');
  }
  return navigator.clipboard.readText();
}

/**
 * Reads plain text from the system clipboard.
 *
 * Primary path: the extension's offscreen document, which has clipboardRead
 * permission and therefore does not trigger a per-site permission prompt.
 * Fallback: navigator.clipboard.readText() in the current page (requires a user
 * gesture, which is always the case because reads are button-triggered).
 */
export async function readClipboardText(): Promise<ClipboardReadResult> {
  let lastError: unknown = null;

  // Two attempts: offscreen first (no per-site prompt), then the page Clipboard API.
  // A short retry covers the offscreen document being created for the first time.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { text: await readViaBackground(), via: 'offscreen' };
    } catch (error) {
      lastError = error;
    }

    try {
      return { text: await readViaNavigator(), via: 'navigator.clipboard' };
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

async function writeViaBackground(text: string): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    target: 'background',
    type: 'clipboard:write',
    text,
  })) as BackgroundWriteResponse | undefined;

  if (!response) throw new Error('No response from the extension service worker.');
  if (!response.ok) throw new Error(response.error || 'Clipboard write failed.');
}

export async function writeClipboardText(text: string): Promise<void> {
  // Writing from the page/popup is the most reliable path (a click supplies the user
  // gesture, and empty strings clear the clipboard). The offscreen document is the
  // fallback for contexts without clipboard access.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through to the offscreen worker */
  }

  try {
    await writeViaBackground(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    throw new ClipboardAccessError('unavailable', `Clipboard could not be updated. ${detail}`);
  }
}
