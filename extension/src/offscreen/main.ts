/**
 * Offscreen document.
 *
 * Service workers have no DOM, so clipboard access happens here. The document is
 * created on demand with the CLIPBOARD reason and is torn down by the browser when
 * it becomes idle.
 */
interface OffscreenRequest {
  target?: string;
  type?: string;
  text?: string;
}

async function readClipboard(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      return text;
    }
  } catch {
    /* fall through to the execCommand fallback */
  }

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

  let pasted = false;
  try {
    pasted = document.execCommand('paste');
  } catch {
    pasted = false;
  }
  const value = textarea.value;
  textarea.remove();

  if (!pasted && !value) throw new Error('The browser refused to release the clipboard contents.');
  return value;
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (error) {
    // An empty execCommand copy is a no-op that would leave the clipboard unchanged,
    // so surface the failure instead of pretending the clipboard was cleared.
    if (!text) throw error;
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
      .then((text) => sendResponse({ ok: true, text }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  }

  if (message.type === 'offscreen:write') {
    writeClipboard(message.text ?? '')
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  }

  return undefined;
});
