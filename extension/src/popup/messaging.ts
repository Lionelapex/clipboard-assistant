import type { ContentContext, ContentInsertResponse } from '../types';

/**
 * Resolves the tab the popup should act on.
 *
 * A real toolbar popup is opened over the active tab, so `active/currentWindow` is right.
 * Opening popup.html in a tab (as the tests and the Chrome docs' testing guidance do) would
 * otherwise resolve to the popup's own tab, so an explicit `?tab=<id>` override is supported.
 */
export function tabIdOverride(): number | null {
  const value = new URLSearchParams(window.location.search).get('tab');
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  const override = tabIdOverride();
  if (override !== null) {
    try {
      return await chrome.tabs.get(override);
    } catch {
      return null;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function sendToTab<T>(tab: chrome.tabs.Tab | null, message: unknown): Promise<T | null> {
  if (!tab?.id) return null;
  try {
    return (await chrome.tabs.sendMessage(tab.id, message)) as T;
  } catch {
    return null;
  }
}

export function fetchContext(tab: chrome.tabs.Tab | null): Promise<ContentContext | null> {
  return sendToTab<ContentContext>(tab, { type: 'ca:get-context' });
}

/**
 * Returns the page context, injecting the content script first if it is not running
 * (for example on a tab that was already open when the extension was installed).
 * Works on any page the extension has browser access to; there is no site allowlist.
 */
export async function ensurePageBridge(tab: chrome.tabs.Tab | null): Promise<ContentContext | null> {
  if (!tab?.id) return null;

  const existing = await fetchContext(tab);
  if (existing) return existing;

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {
    return null;
  }

  return fetchContext(tab);
}

export function requestInsert(
  tab: chrome.tabs.Tab | null,
  text: string,
  mode: 'auto' | 'paste' | 'type' = 'auto',
  html: string | null = null,
): Promise<ContentInsertResponse | null> {
  return sendToTab<ContentInsertResponse>(tab, { type: 'ca:insert-text', text, mode, html });
}

export async function openPanel(tab: chrome.tabs.Tab | null): Promise<boolean> {
  const response = await sendToTab<{ ok: boolean }>(tab, { type: 'ca:open-panel' });
  return Boolean(response?.ok);
}
