import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldDescriptor, HistoryEntry, InsertResult } from '../types';
import { readClipboardText, writeClipboardContent } from '../clipboard/read';
import {
  CLIPBOARD_SEEN_KEY,
  CURRENT_KEY,
  HISTORY_KEY,
  MAX_HISTORY,
  addHistory,
  clearHistory,
  deleteHistoryEntry,
  getClipboardSeen,
  getCurrentSnippet,
  getHistory,
  getSettings,
  markClipboardSeen,
  patchSettings,
  setCurrentSnippet,
} from '../storage';
import { describeField, getActiveField, insertTextIntoField, type InsertMode } from '../insertion';
import { isRichHtml } from '../insertion/sanitise';
import { containsTable } from '../lib/html-text';
import { formatNumber } from '../lib/format';
import { cn } from '../lib/cn';
import { ActionButton } from '../components/ActionButton';
import { ClipboardPreview } from '../components/ClipboardPreview';
import { HistoryList } from '../components/HistoryList';
import { StatusMessage, type Status } from '../components/StatusMessage';
import {
  ClipboardIcon,
  CloseIcon,
  CopyIcon,
  GripIcon,
  InsertIcon,
  MinusIcon,
  RefreshIcon,
  TrashIcon,
} from '../components/icons';
import { onFlashStatus, onOpenPanel, onTogglePanel } from './bus';

type Mode = 'closed' | 'open' | 'minimised';
type Busy = 'idle' | 'reading' | 'inserting';

const PANEL_WIDTH = 372;
const MARGIN = 16;

function panelWidth(): number {
  return Math.min(PANEL_WIDTH, Math.max(240, window.innerWidth - MARGIN * 2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

interface FloatingPanelProps {
  origin: string;
}

export function FloatingPanel({ origin }: FloatingPanelProps) {
  const [mode, setMode] = useState<Mode>('closed');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [preview, setPreview] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [field, setField] = useState<FieldDescriptor | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [clipboardVia, setClipboardVia] = useState<string | null>(null);
  const [lastInsert, setLastInsert] = useState<InsertResult | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const autoReadDone = useRef(false);
  const seenClipboard = useRef<string | null>(null);
  const pollFailures = useRef(0);

  const adoptClipboard = useCallback(async (text: string, html: string | null, expected: string | null) => {
    seenClipboard.current = text;
    await markClipboardSeen(text);
    // Another surface (capture shortcut, history selection) may have written a newer snippet
    // while this clipboard read was in flight. Never overwrite it.
    const latest = await getCurrentSnippet();
    if ((latest?.text ?? null) !== expected) return;
    setClipboardVia((via) => via ?? 'auto');
    setSelectedId(null);
    setPreview(text);
    setPreviewHtml(html);
    setHistory(await addHistory(text, 'refresh', html));
    await setCurrentSnippet(text, 'refresh', html);
    setStatus({
      kind: 'info',
      text: `Clipboard updated · ${formatNumber(text.length)} characters`,
      detail: 'Picked up automatically. No refresh needed.',
    });
  }, []);

  const refreshClipboard = useCallback(async (silent = false) => {
    setBusy('reading');
    try {
      const result = await readClipboardText();
      setClipboardVia(result.via);
      setSelectedId(null);
      seenClipboard.current = result.text;
      pollFailures.current = 0;
      void markClipboardSeen(result.text);
      setPreviewHtml(result.html);
      if (result.text.trim()) {
        setHistory(await addHistory(result.text, 'refresh', result.html));
        await setCurrentSnippet(result.text, 'refresh', result.html);
      }
      setPreview(result.text);
      if (!silent) {
        setStatus(
          result.text.trim()
            ? {
                kind: 'info',
                text: `Clipboard read · ${formatNumber(result.text.length)} characters`,
                detail: `Source: ${result.via}`,
              }
            : {
                kind: 'info',
                text: 'The clipboard is empty.',
                detail: 'Copy some text in any application, then press Refresh again.',
              },
        );
      }
    } catch (error) {
      setStatus({ kind: 'error', text: 'Clipboard could not be read.', detail: errorMessage(error) });
    } finally {
      setBusy('idle');
    }
  }, []);

  // Restore history, saved position and the panel's previous open state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedHistory, settings, current] = await Promise.all([
        getHistory(),
        getSettings(),
        getCurrentSnippet(),
      ]);
      if (cancelled) return;
      setHistory(storedHistory);
      if (current) {
        setPreview(current.text);
        setPreviewHtml(current.html);
      }
      setPosition(
        settings.panelPosition ?? {
          x: Math.max(MARGIN, window.innerWidth - panelWidth() - MARGIN),
          y: 88,
        },
      );
      setMode(settings.panelOpen ? 'open' : 'closed');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the panel in sync with history/current text written elsewhere (copy capture, popup).
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;

      if (changes[CLIPBOARD_SEEN_KEY]) {
        const seen = changes[CLIPBOARD_SEEN_KEY].newValue as { text?: string } | undefined;
        if (typeof seen?.text === 'string') seenClipboard.current = seen.text;
      }

      if (changes[CURRENT_KEY]) {
        const current = changes[CURRENT_KEY].newValue as { text?: string; html?: string | null } | undefined;
        if (typeof current?.text === 'string') {
          setPreview(current.text);
          setPreviewHtml(typeof current.html === 'string' ? current.html : null);
          setSelectedId(null);
        }
      }

      if (!changes[HISTORY_KEY]) return;
      const next = changes[HISTORY_KEY].newValue;
      if (!Array.isArray(next)) return;
      const entries = next as HistoryEntry[];
      setHistory(entries);
      const newest = entries[0];
      if (newest && newest.source === 'copy' && Date.now() - newest.createdAt < 3000) {
        setPreview(newest.text);
        setPreviewHtml(newest.html);
        setSelectedId(newest.id);
        setClipboardVia('copy event');
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Track the field the user is working in.
  useEffect(() => {
    if (mode === 'closed') return;
    const update = () => {
      const element = getActiveField();
      setField(element ? describeField(element) : null);
    };
    update();
    document.addEventListener('focusin', update, true);
    document.addEventListener('pointerdown', update, true);
    return () => {
      document.removeEventListener('focusin', update, true);
      document.removeEventListener('pointerdown', update, true);
    };
  }, [mode]);

  // Automatic refresh: sync when the panel opens and keep watching while it stays open.
  // A capture shortcut opens the panel too, but its text is not in the system clipboard, so
  // that path only seeds the fingerprint instead of replacing the captured snippet.
  useEffect(() => {
    if (mode !== 'open') return;
    let cancelled = false;
    let initialised = false;

    const sync = async (initial: boolean) => {
      const before = await getCurrentSnippet();
      try {
        const result = await readClipboardText();
        if (cancelled) return;
        pollFailures.current = 0;
        const text = result.text;

        if (initial) {
          if (!text.trim()) {
            seenClipboard.current = '';
            const current = await getCurrentSnippet();
            if (!cancelled && current) {
              setPreview(current.text);
              setPreviewHtml(current.html);
            }
            return;
          }
          seenClipboard.current = text;
          const seen = await getClipboardSeen();
          if (cancelled) return;
          const latest = await getCurrentSnippet();
          if (latest?.text !== before?.text) {
            // A shortcut capture landed while this read was in flight; it wins.
            if (!cancelled && latest) {
              setPreview(latest.text);
              setPreviewHtml(latest.html);
            }
            return;
          }
          if (text !== (seen ?? '')) {
            await adoptClipboard(text, result.html, before?.text ?? null);
            return;
          }
          if (latest) {
            setPreview(latest.text);
            setPreviewHtml(latest.html);
          } else {
            await adoptClipboard(text, result.html, before?.text ?? null);
          }
          return;
        }

        if (!text.trim()) return;
        if (text === seenClipboard.current) return;
        const latest = await getCurrentSnippet();
        if (latest?.text !== before?.text) return; // the user selected a snippet while this read ran
        await adoptClipboard(text, result.html, before?.text ?? null);
      } catch {
        pollFailures.current += 1;
      }
    };

    if (autoReadDone.current) {
      // Capture-opened panel: remember what the clipboard currently holds without using it.
      void (async () => {
        try {
          const result = await readClipboardText();
          if (!cancelled) seenClipboard.current = result.text;
        } catch {
          /* the poll will retry */
        } finally {
          initialised = true;
        }
      })();
    } else {
      autoReadDone.current = true;
      void sync(true).finally(() => {
        initialised = true;
      });
    }

    const timer = window.setInterval(() => {
      if (!initialised || cancelled) return;
      void sync(false);
    }, 1600);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mode, adoptClipboard]);

  useEffect(() => onTogglePanel(() => setMode((current) => (current === 'closed' ? 'open' : 'closed'))), []);

  // Keep the panel inside the viewport when the window is resized (e.g. rotation,
  // responsive breakpoints) or when a saved position is off-screen.
  useEffect(() => {
    const keepInView = () => {
      setPosition((current) => ({
        x: clamp(current.x, 8, Math.max(8, window.innerWidth - panelWidth() - 8)),
        y: clamp(current.y, 8, Math.max(8, window.innerHeight - 120)),
      }));
    };
    keepInView();
    window.addEventListener('resize', keepInView);
    return () => window.removeEventListener('resize', keepInView);
  }, []);

  useEffect(
    () =>
      onOpenPanel(() => {
        setMode('open');
        void patchSettings({ panelOpen: true });
      }),
    [],
  );

  // Keyboard-shortcut feedback (capture / insert) opens the panel with a status line.
  useEffect(
    () =>
      onFlashStatus((next) => {
        // Never auto-read the clipboard here: a capture has already stored the text and
        // the system clipboard may still hold older content.
        autoReadDone.current = true;
        setMode('open');
        setStatus(next);
      }),
    [],
  );

  useEffect(() => {
    if (mode === 'closed') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('closed');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mode]);

  const openPanel = useCallback(() => {
    setMode('open');
    void patchSettings({ panelOpen: true });
  }, []);

  const minimisePanel = useCallback(() => {
    setMode('minimised');
    void patchSettings({ panelOpen: true });
  }, []);

  const closePanel = useCallback(() => {
    setMode('closed');
    void patchSettings({ panelOpen: false });
  }, []);

  const pasteIntoField = useCallback(async (mode: InsertMode = 'auto') => {
    let text = preview;
    let html = previewHtml;
    if (!text.trim()) {
      try {
        const result = await readClipboardText();
        text = result.text;
        html = result.html;
        setPreview(text);
        setPreviewHtml(html);
        setClipboardVia(result.via);
      } catch (error) {
        setStatus({ kind: 'error', text: 'Clipboard could not be read.', detail: errorMessage(error) });
        return;
      }
    }

    if (!text.trim()) {
      setStatus({
        kind: 'error',
        text: 'There is nothing to insert.',
        detail: 'Copy some text, then press Refresh to load it into the panel.',
      });
      return;
    }

    const target = getActiveField();
    if (!target) {
      setStatus({
        kind: 'error',
        text: 'No active field.',
        detail: 'Click into a text area on the page first. The panel remembers the last field you focused.',
      });
      return;
    }

    setBusy('inserting');
    try {
      const result = await insertTextIntoField(target, text, mode, html);
      setLastInsert(result);
      if (result.verified) {
        const typed = result.strategy === 'typing';
        setStatus({
          kind: 'success',
          text: `${typed ? 'Typed' : 'Inserted'} and verified · ${formatNumber(result.expectedChars)} characters`,
          detail: `${result.field?.label ?? 'Field'} · ${result.strategy} · ${result.elapsedMs} ms`,
        });
      } else {
        setStatus({
          kind: 'error',
          text: 'Insertion could not be verified.',
          detail: `${result.detail} Target: ${result.field?.label ?? 'unknown field'}.`,
        });
      }
    } catch (error) {
      setStatus({ kind: 'error', text: 'Insertion failed.', detail: errorMessage(error) });
    } finally {
      setBusy('idle');
    }
  }, [preview, previewHtml]);

  const clearClipboard = useCallback(async () => {
    try {
      await writeClipboardContent('');
      setPreview('');
      setPreviewHtml(null);
      setSelectedId(null);
      setClipboardVia(null);
      setStatus({ kind: 'success', text: 'Clipboard cleared.' });
    } catch (error) {
      setStatus({ kind: 'error', text: 'Clipboard could not be cleared.', detail: errorMessage(error) });
    }
  }, []);

  const copySnippet = useCallback(async () => {
    if (!preview.trim()) {
      setStatus({ kind: 'error', text: 'There is nothing to copy.' });
      return;
    }
    try {
      await writeClipboardContent(preview, previewHtml);
      await setCurrentSnippet(preview, 'selection', previewHtml);
      setClipboardVia('panel copy');
      setStatus({
        kind: 'success',
        text: 'Copied to clipboard.',
        detail: `${formatNumber(preview.length)} characters ready to paste elsewhere.`,
      });
    } catch (error) {
      setStatus({ kind: 'error', text: 'Clipboard could not be updated.', detail: errorMessage(error) });
    }
  }, [preview, previewHtml]);

  const selectEntry = useCallback((entry: HistoryEntry) => {
    setPreview(entry.text);
    setPreviewHtml(entry.html);
    setSelectedId(entry.id);
    setClipboardVia('history');
    void setCurrentSnippet(entry.text, 'selection', entry.html);
    setStatus({ kind: 'info', text: 'Snippet selected.', detail: 'Press Paste to insert it into the active field.' });
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    const next = await deleteHistoryEntry(id);
    setHistory(next);
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const clearAllHistory = useCallback(async () => {
    await clearHistory();
    setHistory([]);
    setSelectedId(null);
  }, []);

  const onHeaderPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onHeaderPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const width = panelRef.current?.getBoundingClientRect().width ?? panelWidth();
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - 90);
    setPosition({
      x: clamp(event.clientX - dragRef.current.dx, 8, maxX),
      y: clamp(event.clientY - dragRef.current.dy, 8, maxY),
    });
  }, []);

  const onHeaderPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer capture may already be released */
      }
      void patchSettings({ panelPosition: position });
    },
    [position],
  );

  if (mode === 'closed') {
    return (
      <button
        type="button"
        onClick={openPanel}
        aria-label="Open Clipboard Assistant"
        title="Clipboard Assistant (Alt+Shift+V)"
        data-testid="ca-launcher"
        className="fixed bottom-6 right-6 z-[2147483646] flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white shadow-ca-panel ring-1 ring-black/10 transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      >
        <ClipboardIcon className="h-5 w-5" />
        {history.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-semibold text-teal-800 ring-1 ring-black/5">
            {history.length}
          </span>
        ) : null}
      </button>
    );
  }

  if (mode === 'minimised') {
    return (
      <div
        style={{ left: position.x, top: position.y }}
        className="fixed z-[2147483647] flex items-center gap-1 rounded-full bg-slate-900 py-1 pl-2.5 pr-1 text-white shadow-ca-panel"
        data-testid="ca-panel-minimised"
      >
        <ClipboardIcon className="h-4 w-4 text-teal-300" />
        <button type="button" onClick={openPanel} className="px-1 text-[12px] font-medium">
          Clipboard Assistant
        </button>
        <button
          type="button"
          aria-label="Close Clipboard Assistant"
          onClick={closePanel}
          className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Clipboard Assistant"
      data-testid="ca-panel"
      style={{ left: position.x, top: position.y }}
      className="fixed z-[2147483647] w-[min(372px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-ca-panel"
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        className="flex cursor-grab touch-none items-center gap-2 bg-slate-900 px-2.5 py-2.5 text-white active:cursor-grabbing"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10">
          <ClipboardIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">Clipboard Assistant</p>
          <p className="truncate text-[10px] leading-tight text-white/45">{origin || 'current page'}</p>
        </div>
        <GripIcon className="h-4 w-4 shrink-0 text-white/25" />
        <button
          type="button"
          aria-label="Minimise"
          title="Minimise"
          onClick={minimisePanel}
          data-testid="ca-minimise"
          className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={closePanel}
          data-testid="ca-close"
          className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="ca-scroll max-h-[calc(100vh-190px)] space-y-3 overflow-y-auto p-3">
        <div className="rounded-xl border border-slate-200 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Active field</span>
            <span className="text-[10px] font-medium text-slate-400">{field ? 'ready' : 'waiting'}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] font-medium text-slate-700" data-testid="ca-active-field">
            {field ? field.label : 'No field focused'}
          </p>
          <p className="truncate text-[10.5px] text-slate-400">
            {field
              ? `${field.tag}${field.richText ? ' · rich text' : ''}${field.maxLength ? ` · max ${field.maxLength}` : ''}`
              : 'Click a text area on the page, then press Paste.'}
          </p>
        </div>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Clipboard</h2>
            <span className="text-[10px] text-slate-400">
              {preview ? `${formatNumber(preview.length)} characters` : 'empty'}
              {previewHtml && containsTable(previewHtml)
                ? ' · table'
                : previewHtml && isRichHtml(previewHtml)
                  ? ' · formatted'
                  : ''}
              {clipboardVia ? ` · ${clipboardVia}` : ''}
            </span>
          </div>

          <ClipboardPreview text={preview} />

          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton
              variant="primary"
              onClick={() => void pasteIntoField('auto')}
              disabled={busy !== 'idle'}
              icon={<InsertIcon className="h-3.5 w-3.5" />}
              data-testid="ca-paste"
            >
              {busy === 'inserting' ? 'Inserting…' : 'Paste'}
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => void copySnippet()}
              disabled={!preview.trim()}
              icon={<CopyIcon className="h-3.5 w-3.5" />}
              data-testid="ca-copy"
            >
              Copy
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => void refreshClipboard()}
              disabled={busy === 'reading'}
              icon={<RefreshIcon className={cn('h-3.5 w-3.5', busy === 'reading' && 'animate-spin')} />}
              data-testid="ca-refresh"
            >
              Refresh
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => void clearClipboard()}
              icon={<TrashIcon className="h-3.5 w-3.5" />}
              data-testid="ca-clear-clipboard"
            >
              Clear
            </ActionButton>
            <ActionButton
              variant="secondary"
              className="col-span-2"
              onClick={() => void pasteIntoField('type')}
              disabled={busy !== 'idle' || !preview.trim()}
              data-testid="ca-type"
            >
              {busy === 'inserting' ? 'Typing…' : '⌨ Type it'}
            </ActionButton>
          </div>
        </section>

        {status ? <StatusMessage status={status} onDismiss={() => setStatus(null)} /> : null}

        {lastInsert && !lastInsert.verified ? (
          <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-rose-700" data-testid="ca-insert-failure">
            {lastInsert.detail}
          </p>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              History <span className="text-slate-400">({history.length}/{MAX_HISTORY})</span>
            </h2>
            {history.length > 0 ? (
              <button
                type="button"
                onClick={() => void clearAllHistory()}
                className="text-[10px] font-medium text-slate-400 hover:text-rose-600"
                data-testid="ca-clear-history"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <HistoryList
            entries={history}
            selectedId={selectedId}
            onSelect={selectEntry}
            onDelete={(id) => void removeEntry(id)}
            className="max-h-[196px] overflow-y-auto ca-scroll pr-0.5"
          />
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[9.5px] text-slate-400">
        <span>Stored locally · chrome.storage.local</span>
        <span className="font-medium">Alt+Shift+V</span>
      </div>
    </div>
  );
}
