import type { AssistantSettings, HistoryEntry, HistorySource } from '../types';

export const HISTORY_KEY = 'clipboardHistory';
export const SETTINGS_KEY = 'assistantSettings';
export const CURRENT_KEY = 'clipboardCurrent';
export const MAX_HISTORY = 10;

const DEFAULT_SETTINGS: AssistantSettings = {
  panelPosition: null,
  panelOpen: false,
};

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the timestamp-based id */
  }
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitiseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is HistoryEntry => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<HistoryEntry>;
      return typeof candidate.text === 'string' && typeof candidate.createdAt === 'number';
    })
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : newId(),
      text: item.text,
      html: typeof item.html === 'string' ? item.html : null,
      createdAt: item.createdAt,
      source: (item.source ?? 'copy') as HistorySource,
      chars: typeof item.chars === 'number' ? item.chars : item.text.length,
    }))
    .slice(0, MAX_HISTORY);
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  return sanitiseHistory(stored[HISTORY_KEY]);
}

/**
 * Adds a snippet to the front of the history list. Identical text is de-duplicated
 * (the existing entry is moved to the top and re-stamped) and the list is capped
 * at MAX_HISTORY entries.
 */
export async function addHistory(
  text: string,
  source: HistorySource,
  html: string | null = null,
): Promise<HistoryEntry[]> {
  const normalised = text.replace(/\r\n/g, '\n');
  if (!normalised.trim()) return getHistory();

  const history = await getHistory();
  const existing = history.find((entry) => entry.text === normalised);
  const entry: HistoryEntry = {
    id: existing?.id ?? newId(),
    text: normalised,
    html: html && html.trim() ? html : null,
    createdAt: Date.now(),
    source,
    chars: normalised.length,
  };
  const next = [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}

export async function deleteHistoryEntry(id: string): Promise<HistoryEntry[]> {
  const history = await getHistory();
  const next = history.filter((entry) => entry.id !== id);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

export async function getSettings(): Promise<AssistantSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY];
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  const parsed = value as Partial<AssistantSettings>;
  return {
    panelPosition:
      parsed.panelPosition && typeof parsed.panelPosition.x === 'number' && typeof parsed.panelPosition.y === 'number'
        ? { x: parsed.panelPosition.x, y: parsed.panelPosition.y }
        : null,
    panelOpen: typeof parsed.panelOpen === 'boolean' ? parsed.panelOpen : false,
  };
}

export async function patchSettings(patch: Partial<AssistantSettings>): Promise<AssistantSettings> {
  const current = await getSettings();
  const next: AssistantSettings = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function ensureStorageReady(): Promise<void> {
  const stored = await chrome.storage.local.get([HISTORY_KEY, SETTINGS_KEY]);
  const patch: Record<string, unknown> = {};
  if (!Array.isArray(stored[HISTORY_KEY])) patch[HISTORY_KEY] = [];
  if (!stored[SETTINGS_KEY] || typeof stored[SETTINGS_KEY] !== 'object') {
    patch[SETTINGS_KEY] = { ...DEFAULT_SETTINGS };
  }
  if (Object.keys(patch).length > 0) await chrome.storage.local.set(patch);
}

/**
 * The snippet the assistant will insert when the keyboard shortcut (or the floating
 * panel) inserts without re-reading the clipboard. Kept separate from the history so
 * "Clear" really clears the pending content.
 */
export async function setCurrentSnippet(
  text: string,
  source: HistorySource,
  html: string | null = null,
): Promise<void> {
  const normalised = text.replace(/\r\n/g, '\n');
  await chrome.storage.local.set({
    [CURRENT_KEY]: {
      text: normalised,
      html: html && html.trim() ? html : null,
      at: Date.now(),
      source,
    },
  });
}

export async function getCurrentSnippet(): Promise<{ text: string; html: string | null } | null> {
  const stored = await chrome.storage.local.get(CURRENT_KEY);
  const value = stored[CURRENT_KEY];
  if (!value || typeof value !== 'object') return null;
  const record = value as { text?: unknown; html?: unknown };
  if (typeof record.text !== 'string' || !record.text.trim()) return null;
  return {
    text: record.text,
    html: typeof record.html === 'string' && record.html.trim() ? record.html : null,
  };
}

export async function clearCurrentSnippet(): Promise<void> {
  await chrome.storage.local.remove(CURRENT_KEY);
}

/**
 * The last clipboard value any surface has already seen. Used by automatic refresh to
 * distinguish "the user copied something new" from "this is the value we already know",
 * so a captured selection is never clobbered by a stale clipboard read.
 */
export const CLIPBOARD_SEEN_KEY = 'clipboardSeen';

export async function getClipboardSeen(): Promise<string | null> {
  const stored = await chrome.storage.local.get(CLIPBOARD_SEEN_KEY);
  const value = stored[CLIPBOARD_SEEN_KEY];
  if (!value || typeof value !== 'object') return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}

export async function markClipboardSeen(text: string): Promise<void> {
  const normalised = text.replace(/\r\n/g, '\n');
  await chrome.storage.local.set({
    [CLIPBOARD_SEEN_KEY]: { text: normalised, at: Date.now() },
  });
}
