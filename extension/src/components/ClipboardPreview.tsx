import { cn } from '../lib/cn';

interface ClipboardPreviewProps {
  text: string;
  emptyLabel?: string;
  className?: string;
  testId?: string;
}

export function ClipboardPreview({
  text,
  emptyLabel = 'Clipboard is empty. Copy some text, then press Refresh.',
  className,
  testId = 'ca-preview',
}: ClipboardPreviewProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'ca-scroll max-h-[170px] min-h-[92px] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700',
        className,
      )}
    >
      {text ? text : <span className="text-slate-400">{emptyLabel}</span>}
    </div>
  );
}
