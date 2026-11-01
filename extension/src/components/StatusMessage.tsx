import { cn } from '../lib/cn';
import { AlertIcon, CheckCircleIcon, CloseIcon, InfoIcon } from './icons';

export type StatusKind = 'success' | 'error' | 'info';

export interface Status {
  kind: StatusKind;
  text: string;
  detail?: string;
}

const STYLES: Record<StatusKind, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

export function StatusMessage({
  status,
  onDismiss,
  testId = 'ca-status',
}: {
  status: Status;
  onDismiss?: () => void;
  testId?: string;
}) {
  const Icon = status.kind === 'success' ? CheckCircleIcon : status.kind === 'error' ? AlertIcon : InfoIcon;

  return (
    <div
      data-testid={testId}
      data-status-kind={status.kind}
      role="status"
      className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-snug', STYLES[status.kind])}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{status.text}</p>
        {status.detail ? <p className="mt-0.5 break-words text-[10.5px] opacity-80">{status.detail}</p> : null}
      </div>
      {onDismiss ? (
        <button type="button" aria-label="Dismiss message" onClick={onDismiss} className="opacity-50 hover:opacity-100">
          <CloseIcon className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
