import type { HistoryEntry } from '../types';
import { cn } from '../lib/cn';
import { formatNumber, formatTime, truncate } from '../lib/format';
import { TrashIcon } from './icons';

interface HistoryListProps {
  entries: HistoryEntry[];
  selectedId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  emptyText?: string;
  className?: string;
}

export function HistoryList({
  entries,
  selectedId,
  onSelect,
  onDelete,
  emptyText = 'Copied snippets appear here. Copy text on a page, then press Refresh.',
  className,
}: HistoryListProps) {
  if (entries.length === 0) {
    return (
      <p
        className={cn(
          'rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] leading-relaxed text-slate-400',
          className,
        )}
      >
        {emptyText}
      </p>
    );
  }

  return (
    <ul className={cn('space-y-1.5', className)}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <div
            className={cn(
              'flex items-start gap-1.5 rounded-lg border px-2 py-1.5 transition-colors',
              entry.id === selectedId
                ? 'border-teal-300 bg-teal-50/70'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(entry)}
              className="min-w-0 flex-1 text-left"
              data-testid="ca-history-item"
              title="Use this snippet"
            >
              <span className="line-clamp-2 block text-[12px] leading-snug text-slate-700">
                {truncate(entry.text, 140)}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-400">
                {formatTime(entry.createdAt)} · {formatNumber(entry.chars)} chars · {entry.source}
              </span>
            </button>
            <button
              type="button"
              aria-label="Delete snippet"
              title="Delete snippet"
              onClick={() => onDelete(entry.id)}
              data-testid="ca-history-delete"
              className="mt-0.5 rounded p-1 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
