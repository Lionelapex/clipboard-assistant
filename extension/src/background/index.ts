import { ensureStorageReady } from '../storage';

const OFFSCREEN_DOCUMENT = 'offscreen.html';

let creatingOffscreen: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });
    return contexts.length > 0;
  } catch {
    try {
      return await chrome.offscreen.hasDocument();
    } catch {
      return false;
    }
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT,
        reasons: [chrome.offscreen.Reason.CLIPBOARD],
        justification: 'Read and write clipboard text when the user explicitly requests it.',
      })
      .catch((error: unknown) => {
        throw error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }

  return creatingOffscreen;
}

interface OffscreenResponse {
  ok: boolean;
  text?: string;
  html?: string | null;
  error?: string;
}

async function runOffscreenOperation(
  message: Record<string, unknown>,
): Promise<OffscreenResponse> {
  await ensureOffscreenDocument();
  const response = (await chrome.runtime.sendMessage({
    target: 'offscreen',
    ...message,
  })) as OffscreenResponse | undefined;

  if (!response) throw new Error('The offscreen clipboard worker did not respond.');
  return response;
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureStorageReady();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureStorageReady();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || message.target !== 'background') {
    return undefined;
  }

  if (message.type === 'clipboard:read' || message.type === 'clipboard:write') {
    runOffscreenOperation(
      message.type === 'clipboard:read'
        ? { type: 'offscreen:read' }
        : { type: 'offscreen:write', text: message.text, html: message.html },
    )
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  if (message.type === 'panel:toggle-active-tab') {
    void togglePanelInActiveTab().then(
      () => sendResponse({ ok: true }),
      (error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true;
  }

  return undefined;
});

async function sendToActiveTab(message: Record<string, unknown>): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');

  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // The content script may not be running yet (tab opened before install).
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, message);
  }
}

async function togglePanelInActiveTab(): Promise<void> {
  await sendToActiveTab({ type: 'ca:toggle-panel' });
}

async function runCommandInActiveTab(message: Record<string, unknown>): Promise<void> {
  try {
    await sendToActiveTab(message);
  } catch {
    // Protected pages cannot be scripted; the popup reports this. Commands stay silent.
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-panel') void runCommandInActiveTab({ type: 'ca:toggle-panel' });
  else if (command === 'capture-selection') void runCommandInActiveTab({ type: 'ca:capture-selection' });
  else if (command === 'insert-current') void runCommandInActiveTab({ type: 'ca:insert-current' });
});
