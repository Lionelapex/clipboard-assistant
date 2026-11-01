import type { CompletionStatus, FormField } from '../forms/sections';
import { completionStatus } from '../forms/sections';
import { cn, formatNumber } from '../lib/format';

const BADGE: Record<CompletionStatus, { label: string; className: string }> = {
  'not-started': { label: 'Not started', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
  'in-progress': { label: 'In progress', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  complete: { label: 'Complete', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

interface FormFieldBlockProps {
  field: FormField;
  index: number;
  value: string;
  onChange: (value: string) => void;
}

export function FormFieldBlock({ field, index, value, onChange }: FormFieldBlockProps) {
  const status = completionStatus(field, value);
  const length = value.length;
  const remaining = field.minLength - length;
  const badge = BADGE[status];

  return (
    <section
      id={field.id}
      data-field-section
      data-testid={`section-${field.id}`}
      className="scroll-mt-28 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-50 font-serif text-[12px] font-semibold text-brand-700 ring-1 ring-brand-100">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0">
          <h3 data-field-heading className="font-serif text-[17px] font-semibold leading-snug text-brand-700">
            {field.heading}
            <span className="ml-1 align-top text-[12px] text-rose-500" aria-hidden="true">
              *
            </span>
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{field.description}</p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">{field.heading}</span>
        <textarea
          data-answer-field
          data-testid={`field-${field.id}`}
          aria-label={field.heading}
          rows={field.rows}
          maxLength={field.maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="field-shadow w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
        <p className="text-slate-500">
          {field.guidance}
          {status !== 'complete' && length > 0 ? ` · ${formatNumber(remaining)} characters to go` : ''}
        </p>
        <div className="flex items-center gap-2">
          <span data-testid={`counter-${field.id}`} className="tabular-nums text-slate-500">
            {formatNumber(length)} / {formatNumber(field.maxLength)} characters
          </span>
          <span
            data-testid={`completion-${field.id}`}
            data-status={status}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1',
              badge.className,
            )}
          >
            {status === 'complete' ? <CheckIcon /> : null}
            {badge.label}
          </span>
        </div>
      </div>
    </section>
  );
}
