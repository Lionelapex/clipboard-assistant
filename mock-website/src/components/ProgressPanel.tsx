import type { AnswerState, CompletionStatus } from '../forms/sections';
import { FORM_FIELDS, completedCount, completionStatus } from '../forms/sections';
import { cn } from '../lib/format';

const STATUS_LABEL: Record<CompletionStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
};

const DOT: Record<CompletionStatus, string> = {
  'not-started': 'border-slate-300 bg-white',
  'in-progress': 'border-amber-400 bg-amber-400',
  complete: 'border-emerald-500 bg-emerald-500',
};

export function ProgressPanel({ answers }: { answers: AnswerState }) {
  const completed = completedCount(answers);
  const total = FORM_FIELDS.length;
  const percent = Math.round((completed / total) * 100);

  return (
    <aside className="space-y-3 lg:sticky lg:top-24">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-[15px] font-semibold text-brand-700">Application progress</h2>
          <span className="text-[12px] font-semibold tabular-nums text-slate-500">
            {completed}/{total}
          </span>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-700 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        <ul className="mt-4 space-y-2.5">
          {FORM_FIELDS.map((field) => {
            const status = completionStatus(field, answers[field.id]);
            return (
              <li key={field.id} className="flex items-start gap-2 text-[12px]">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full border', DOT[status])} aria-hidden="true" />
                <a href={`#${field.id}`} className="min-w-0 flex-1 leading-snug text-slate-600 hover:text-brand-700">
                  {field.heading}
                </a>
                <span className="whitespace-nowrap text-[10px] text-slate-400">{STATUS_LABEL[status]}</span>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
          Completion is based on the minimum length for each answer. The form can be submitted once all six
          sections are complete.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-[12px] font-semibold text-slate-700">Need help?</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
          Email <span className="text-slate-700">grants@lumenfoundation.org.uk</span> or call 020 7946 0142,
          Monday to Friday, 09:00–17:00.
        </p>
      </div>
    </aside>
  );
}
