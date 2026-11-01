import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentContext, ContentInsertResponse, HistoryEntry } from '../types';
import { readClipboardText, writeClipboardText } from '../clipboard/read';
import {
  addHistory,
  CLIPBOARD_SEEN_KEY,
  clearCurrentSnippet,
  clearHistory,
  CURRENT_KEY,
  deleteHistoryEntry,
  getClipboardSeen,
  getHistory,
  getCurrentSnippet,
  HISTORY_KEY,
  markClipboardSeen,
  MAX_HISTORY,
  setCurrentSnippet,
} from '../storage';
import { formatNumber } from '../lib/format';
import { cn } from '../lib/cn';
import { ActionButton } from '../components/ActionButton';
import { ClipboardPreview } from '../components/ClipboardPreview';
import { HistoryList } from '../components/HistoryList';
import { StatusMessage, type Status } from '../components/StatusMessage';
import { ClipboardIcon, CopyIcon, ExpandIcon, InsertIcon, RefreshIcon, TrashIcon } from '../components/icons';
import { ensurePageBridge, getTargetTab, openPanel, requestInsert } from './messaging';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

/** Maps a technical insertion failure to a specific, actionable message. */
function failureStatus(reason: ContentInsertResponse['reason'], detail: string): Status {
  switch (reason) {
    case 'no-field':
      return {
        kind: 'error',
        text: 'No field selected.',
        detail: 'Click into a text field on the page, then open the assistant and press Paste.',
      };
    case 'read-only':
      return { kind: 'error', text: 'That field is read-only.', detail: detail || 'The page does not allow edits here.' };
    case 'disabled':
      return { kind: 'error', text: 'That field is disabled.', detail: detail || 'Enable the field, then try again.' };
    case 'removed':
      return {
        kind: 'error',
        text: 'The field was removed.',
        detail: detail || 'Click another field on the page, then try again.',
      };
    case 'unsupported':
      return {
        kind: 'error',
        text: 'That field is not supported.',
        detail: detail || 'Use a text input, a textarea or an editable region.',
      };
    case 'empty':
      return {
        kind: 'error',
        text: 'There is nothing to paste.',
        detail: 'Copy some text first, or select a snippet from the history.',
      };
    case 'restricted':
      return {
        kind: 'error',
        text: 'The browser blocked access to this page.',
        detail: detail || 'Grant this site access in Chrome, then reload the page.',
      };
    default:
      return { kind: 'error', text: 'Paste could not be verified.', detail };
  }
}

export function PopupApp() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [preview, setPreview] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<'idle' | 'reading' | 'pasting'>('idle');
  const [via, setVia] = useState<string | null>(null);
  const [context, setContext] = useState<ContentContext | null>(null);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const seenClipboard = useRef<string | null>(null);
  const pollFailures = useRef(0);

  const adoptClipboard = useCallback(async (text: string, expected: string | null) => {
    seenClipboard.current = text;
    await markClipboardSeen(text);
    // A capture shortcut or history selection may have written a newer snippet meanwhile.
    const latest = await getCurrentSnippet();
    if (latest !== expected) return;
    setPreview(text);
    setSelectedId(null);
    setVia('auto');
    setHistory(await addHistory(text, 'refresh'));
    await setCurrentSnippet(text, 'refresh');
    setStatus({
      kind: 'info',
      text: `Clipboard updated · ${formatNumber(text.length)} characters`,
      detail: 'Picked up automatically — no refresh needed.',
    });
  }, []);

  const refresh = useCallback(async (silent = false) => {
    setBusy('reading');
    try {
      const result = await readClipboardText();
      setVia(result.via);
      setSelectedId(null);
      seenClipboard.current = result.text;
      pollFailures.current = 0;
      void markClipboardSeen(result.text);
      // Persist before updating the preview: once the UI shows the text, storage is settled
      // and a shortcut used immediately afterwards cannot be overwritten by this refresh.
      if (result.text.trim()) {
        setHistory(await addHistory(result.text, 'refresh'));
        await setCurrentSnippet(result.text, 'refresh');
      }
      setPreview(result.text);
      if (!silent) {
        setStatus(
          result.text.trim()
            ? { kind: 'info', text: `Clipboard read · ${formatNumber(result.text.length)} characters` }
            : { kind: 'info', text: 'The clipboard is empty.' },
        );
      }
    } catch (error) {
      setStatus({ kind: 'error', text: 'Clipboard could not be read.', detail: errorMessage(error) });
    } finally {
      setBusy('idle');
    }
  }, []);

  /**
   * The page is not focused while the popup is open, so ask the content script which field
   * the user last clicked. It keeps a reference to that element.
   */
  const loadTarget = useCallback(async () => {
    const target = await getTargetTab();
    setTab(target);
    setContext(await ensurePageBridge(target));
    setContextLoaded(true);
  }, []);

  useEffect(() => {
    void (async () => {
      const [stored, current, seen] = await Promise.all([
        getHistory(),
        getCurrentSnippet(),
        getClipboardSeen(),
      ]);
      setHistory(stored);

      // Automatic refresh on open: a clipboard value we have never seen is a new copy, so it
      // wins. A value we have already seen must not replace a snippet captured by shortcut.
      try {
        const result = await readClipboardText();
        const text = result.text;
        if (text.trim()) {
          seenClipboard.current = text;
          const latest = await getCurrentSnippet();
          const captureLanded = latest !== current;
          if (captureLanded) {
            // A shortcut capture finished while this read was in flight; it is newer than
            // whatever the clipboard holds, so it wins.
            setPreview(latest ?? '');
            setSelectedId(null);
          } else if (text !== (seen ?? '')) {
            await adoptClipboard(text, current);
          } else if (current) {
            setPreview(current);
            setSelectedId(null);
          } else {
            await adoptClipboard(text, current);
          }
        } else if (current) {
          setPreview(current);
          setSelectedId(null);
        }
      } catch {
        if (current) setPreview(current);
      }

      await loadTarget();
    })();
  }, [adoptClipboard, loadTarget]);

  // Keep watching while the popup is open, so copying elsewhere updates it without Refresh.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const before = await getCurrentSnippet();
        try {
          const result = await readClipboardText();
          if (cancelled || !result.text.trim()) return;
          pollFailures.current = 0;
          if (result.text === seenClipboard.current) return;
          const latest = await getCurrentSnippet();
          if (latest !== before) return; // a capture or history selection happened meanwhile
          await adoptClipboard(result.text, before);
        } catch {
          pollFailures.current += 1;
        }
      })();
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [adoptClipboard]);

  // Stay in sync while the popup is open: a capture shortcut or another surface can
  // write a new snippet without this page having to be reopened.
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes[CLIPBOARD_SEEN_KEY]) {
        const seen = changes[CLIPBOARD_SEEN_KEY].newValue as { text?: string } | undefined;
        if (typeof seen?.text === 'string') seenClipboard.current = seen.text;
      }
      if (changes[HISTORY_KEY]) {
        setHistory((changes[HISTORY_KEY].newValue as HistoryEntry[] | undefined) ?? []);
      }
      if (changes[CURRENT_KEY]) {
        const next = changes[CURRENT_KEY].newValue as { text?: string } | undefined;
        setPreview(next?.text ?? '');
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const paste = useCallback(async (mode: 'auto' | 'type' = 'auto') => {
    setBusy('pasting');
    try {
      let text = preview;
      if (!text.trim()) {
        try {
          const result = await readClipboardText();
          text = result.text;
          setPreview(text);
          setVia(result.via);
        } catch (error) {
          setStatus({ kind: 'error', text: 'Clipboard could not be read.', detail: errorMessage(error) });
          return;
        }
      }

      if (!text.trim()) {
        setStatus({
          kind: 'error',
          text: 'There is nothing to paste.',
          detail: 'Copy some text first, or select a snippet from the history.',
        });
        return;
      }

      const target = tab ?? (await getTargetTab());
      const response = await requestInsert(target, text, mode);

      if (!response) {
        setStatus({
          kind: 'error',
          text: 'This page is not available to the assistant.',
          detail: 'Reload the page after installing the extension, then try again.',
        });
        return;
      }

      if (response.ok && response.verified) {
        const typed = response.strategy === 'typing';
        setStatus({
          kind: 'success',
          text: `${typed ? 'Typed' : 'Pasted'} and verified · ${formatNumber(response.chars ?? text.length)} characters`,
          detail: `${response.field?.label ?? 'Field'}${response.strategy ? ` · ${response.strategy}` : ''}`,
        });
      } else {
        setStatus(
          failureStatus(
            response.reason,
            `${response.detail}${response.field ? ` (${response.field.label})` : ''}`,
          ),
        );
      }

      await loadTarget();
    } finally {
      setBusy('idle');
    }
  }, [preview, tab, loadTarget]);

  const copy = useCallback(async () => {
    if (!preview.trim()) {
      setStatus({ kind: 'error', text: 'There is nothing to copy.' });
      return;
    }
    try {
      await writeClipboardText(preview);
      setStatus({
        kind: 'success',
        text: 'Copied to clipboard.',
        detail: `${formatNumber(preview.length)} characters ready to paste elsewhere.`,
      });
    } catch (error) {
      setStatus({ kind: 'error', text: 'Clipboard could not be updated.', detail: errorMessage(error) });
    }
  }, [preview]);

  const clearContent = useCallback(async () => {
    setPreview('');
    setSelectedId(null);
    setVia(null);
    await clearCurrentSnippet();
    try {
      await writeClipboardText('');
      setStatus({ kind: 'success', text: 'Content cleared.' });
    } catch {
      setStatus({
        kind: 'info',
        text: 'Assistant content cleared.',
        detail: 'The system clipboard itself could not be cleared.',
      });
    }
  }, []);

  const openFloatingPanel = useCallback(async () => {
    const target = tab ?? (await getTargetTab());
    const opened = await openPanel(target);
    if (opened) {
      window.close();
      return;
    }
    setStatus({
      kind: 'error',
      text: 'The panel cannot open on this page.',
      detail: 'Browser-internal pages block content scripts. Open an http(s) page instead.',
    });
  }, [tab]);

  const useEntry = useCallback(async (entry: HistoryEntry) => {
    setPreview(entry.text);
    setSelectedId(entry.id);
    setVia('history');
    try {
      await writeClipboardText(entry.text);
      await setCurrentSnippet(entry.text, 'selection');
      setStatus({
        kind: 'success',
        text: 'Snippet loaded and copied.',
        detail: 'Press Paste to insert it into the last field you selected.',
      });
    } catch {
      setStatus({
        kind: 'info',
        text: 'Snippet loaded.',
        detail: 'It could not be copied to the system clipboard.',
      });
    }
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    setHistory(await deleteHistoryEntry(id));
  }, []);

  const clearAll = useCallback(async () => {
    await clearHistory();
    setHistory([]);
    setSelectedId(null);
  }, []);

  const targetLabel = context?.field?.label ?? (contextLoaded ? 'No field selected' : 'Checking page…');
  const targetDetail = context
    ? context.field
      ? `${context.field.tag}${context.field.richText ? ' · rich text' : ''}${context.field.maxLength ? ` · max ${context.field.maxLength}` : ''}`
      : 'Click a text field on the page, then open this popup.'
    : 'The assistant cannot access this page. Reload it, or open an http(s) page.';
  const pageLabel = !contextLoaded ? 'checking…' : context ? 'page ready' : 'no access';

  return (
    <div className="w-[384px] bg-white text-slate-900">
      <header className="flex items-center gap-2.5 bg-slate-900 px-3.5 py-3 text-white">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">
          <ClipboardIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13.5px] font-semibold leading-tight">Clipboard Assistant</h1>
          <p className="truncate text-[10.5px] text-white/50">Local clipboard · verified insertion</p>
        </div>
        <button
          type="button"
          onClick={() => void openFloatingPanel()}
          title="Open floating panel"
          aria-label="Open floating panel"
          className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ExpandIcon className="h-4 w-4" />
        </button>
      </header>

      <div className="max-h-[460px] space-y-3 overflow-y-auto p-3">
        <section className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Target field</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold',
                context ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', context ? 'bg-emerald-500' : 'bg-amber-500')} />
              {pageLabel}
            </span>
          </div>
          <p data-testid="popup-target-field" className="mt-0.5 truncate text-[12px] font-medium text-slate-700">
            {targetLabel}
          </p>
          <p className="truncate text-[10.5px] text-slate-400">{targetDetail}</p>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Clipboard</h2>
            <span className="text-[10px] text-slate-400">
              {preview ? `${formatNumber(preview.length)} characters` : 'empty'}
              {via ? ` · ${via}` : ''}
            </span>
          </div>

          <ClipboardPreview text={preview} className="max-h-[92px] min-h-[64px]" testId="popup-preview" />
        </section>

        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton
            variant="primary"
            onClick={() => void paste('auto')}
            disabled={busy !== 'idle'}
            icon={<InsertIcon className="h-3.5 w-3.5" />}
            data-testid="popup-paste"
          >
            {busy === 'pasting' ? 'Pasting…' : 'Paste'}
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void copy()}
            disabled={!preview.trim()}
            icon={<CopyIcon className="h-3.5 w-3.5" />}
            data-testid="popup-copy"
          >
            Copy
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void refresh()}
            disabled={busy !== 'idle'}
            icon={<RefreshIcon className={cn('h-3.5 w-3.5', busy === 'reading' && 'animate-spin')} />}
            data-testid="popup-refresh"
          >
            Refresh
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void clearContent()}
            icon={<TrashIcon className="h-3.5 w-3.5" />}
            data-testid="popup-clear"
          >
            Clear
          </ActionButton>
          <ActionButton
            variant="secondary"
            className="col-span-2"
            onClick={() => void paste('type')}
            disabled={busy !== 'idle' || !preview.trim()}
            data-testid="popup-type"
          >
            {busy === 'pasting' ? 'Typing…' : '⌨ Type it (fields that reject paste)'}
          </ActionButton>
        </div>

        {status ? <StatusMessage status={status} onDismiss={() => setStatus(null)} testId="popup-status" /> : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              History <span className="text-slate-400">({history.length}/{MAX_HISTORY})</span>
            </h2>
            {history.length > 0 ? (
              <button
                type="button"
                onClick={() => void clearAll()}
                className="text-[10px] font-medium text-slate-400 hover:text-rose-600"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <HistoryList
            entries={history}
            selectedId={selectedId}
            onSelect={(entry) => void useEntry(entry)}
            onDelete={(id) => void removeEntry(id)}
            emptyText="Copied text appears here. Copy something, then press Refresh."
            className="max-h-[132px] overflow-y-auto pr-0.5"
          />
        </section>
      </div>

      <footer className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
        Paste inserts into the field you last clicked — on any page the extension can access. Clipboard data never
        leaves this browser.
      </footer>
    </div>
  );
}
