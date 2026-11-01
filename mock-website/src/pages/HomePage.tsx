import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { FormFieldBlock } from '../components/FormSection';
import { ProgressPanel } from '../components/ProgressPanel';
import { FORM_FIELDS, completionStatus, type AnswerState } from '../forms/sections';
import { initAnswerFieldTracking } from '../forms/activeField';
import { useRestrictions } from '../restrictions/RestrictionContext';

const INSTRUCTIONS = [
  'Complete all six sections. Each has a minimum length; the counter and indicator show when a section is complete.',
  'Write in plain English. We assess clarity, realism and fit with the fund, not jargon.',
  'You can review and edit any answer before submitting — nothing is sent until you press Submit application.',
  'If you need this form in an alternative format, contact the grants team before the deadline.',
];

const GUIDANCE = [
  {
    title: 'Who can apply',
    body: 'Constituted charities, community interest companies and community groups with a UK bank account. Annual income must be below £1.5 million, and the organisation must have at least twelve months of accounts.',
  },
  {
    title: 'What we fund',
    body: 'Project delivery costs, staff time directly associated with delivery, small capital items under £5,000, and monitoring or evaluation. Core running costs and retrospective costs are not eligible.',
  },
  {
    title: 'How we assess',
    body: 'Applications are scored on evidence of need, clarity of approach, realism of outcomes and organisational capacity. Shortlisted applicants are invited to a 45-minute conversation in February.',
  },
];

const KEY_DATES = [
  ['Applications open', '1 September 2026'],
  ['Deadline', '15 December 2026, 17:00'],
  ['Shortlist invited', '26 January 2027'],
  ['Decisions announced', '31 March 2027'],
];

function fieldLabel(field: Element): string {
  const section = field.closest('[data-field-section]');
  const heading = section?.querySelector('[data-field-heading]')?.textContent?.trim();
  return (heading ?? field.getAttribute('aria-label') ?? 'answer field').replace(/\s*\*$/, '').trim();
}

export function HomePage() {
  const [answers, setAnswers] = useState<AnswerState>({});
  const [submitted, setSubmitted] = useState<{ reference: string } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement | null>(null);
  const { settings, logEvent } = useRestrictions();

  useEffect(() => {
    initAnswerFieldTracking();
  }, []);

  // Clipboard restrictions are attached to the form only, so the rest of the site
  // (navigation, guidance, footer) behaves normally.
  useEffect(() => {
    const node = formRef.current;
    if (!node) return;

    const handler = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const field = target?.closest('textarea, input, [contenteditable="true"]');
      if (!field) return;

      const type = event.type as 'copy' | 'paste' | 'cut';
      const blocked = settings[type];
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
      }
      logEvent({ type, blocked, field: fieldLabel(field) });
    };

    const types = ['copy', 'paste', 'cut'] as const;
    types.forEach((type) => node.addEventListener(type, handler as EventListener, true));
    return () => types.forEach((type) => node.removeEventListener(type, handler as EventListener, true));
  }, [settings, logEvent]);

  // Separate mechanism: synthetic input events (extension or script driven DOM writes)
  // bypass clipboard handlers entirely. They are logged so the difference is visible.
  useEffect(() => {
    const node = formRef.current;
    if (!node) return;

    const handler = (event: Event) => {
      if (!(event instanceof InputEvent) || event.isTrusted) return;
      const field = (event.target as HTMLElement | null)?.closest('textarea, input');
      if (!field) return;
      logEvent({ type: 'programmatic-input', blocked: false, field: fieldLabel(field) });
    };

    node.addEventListener('input', handler, true);
    return () => node.removeEventListener('input', handler, true);
  }, [logEvent]);

  const updateAnswer = useCallback((id: string, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setSubmitted(null);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const incomplete = FORM_FIELDS.filter((field) => completionStatus(field, answers[field.id]) !== 'complete');
    setMissing(incomplete.map((field) => field.heading));
    if (incomplete.length > 0) {
      setSubmitted(null);
      return;
    }
    setSubmitted({ reference: `CIG-2027-${Math.floor(1000 + Math.random() * 9000)}` });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main>
        <section id="home" className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_318px] lg:items-start">
              <div>
                <nav aria-label="Breadcrumb" className="text-[11px] text-slate-400">
                  <a className="hover:text-brand-700" href="#home">Funding</a>
                  <span className="px-1.5">/</span>
                  <a className="hover:text-brand-700" href="#information">Open calls</a>
                  <span className="px-1.5">/</span>
                  <span className="text-slate-500">Community Impact Grant</span>
                </nav>

                <h1 className="mt-3 max-w-2xl font-serif text-[30px] leading-[1.15] text-brand-700 sm:text-[38px]">
                  Community Impact Grant — Stage 1 application
                </h1>

                <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-slate-600">
                  Tell us how your organisation would use a Community Impact Grant to strengthen your local area.
                  This stage is a written application; shortlisted applicants will be invited to a follow-up
                  conversation in February.
                </p>

                <div className="mt-5 flex flex-wrap gap-2 text-[11.5px] text-slate-600">
                  {[
                    'Award: £5,000 – £25,000',
                    'Deadline: 15 December 2026, 17:00',
                    'Decisions: 31 March 2027',
                  ].map((chip) => (
                    <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {chip}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href="#application-form"
                    className="inline-flex items-center rounded-lg bg-brand-700 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-900"
                  >
                    Start your application
                  </a>
                  <a
                    href="#information"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Read the guidance
                  </a>
                </div>

                <p className="mt-3 text-[11.5px] text-slate-400">Six written answers · approximately 30–45 minutes</p>
              </div>

              <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-[15px] font-semibold text-brand-700">At a glance</h2>
                <dl className="mt-3 space-y-2.5 text-[12.5px]">
                  {[
                    ['Award range', '£5,000 – £25,000'],
                    ['Project length', '12 months'],
                    ['Deadline', '15 December 2026'],
                    ['Contact', 'grants@lumenfoundation.org.uk'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-right font-medium text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 rounded-lg bg-brand-50/70 p-3 text-[11.5px] leading-relaxed text-slate-600">
                  We recommend reading the guidance before starting. You can move between sections freely; your
                  answers remain on this page until you submit.
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section id="information" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-400">Information</p>
            <h2 className="mt-2 font-serif text-[22px] font-semibold text-brand-700">Guidance for applicants</h2>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {GUIDANCE.map((item) => (
                <article key={item.title}>
                  <h3 className="font-serif text-[14.5px] font-semibold text-brand-700">{item.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">{item.body}</p>
                </article>
              ))}
            </div>

            <div className="mt-7 border-t border-slate-100 pt-5">
              <h3 className="font-serif text-[14.5px] font-semibold text-brand-700">Key dates</h3>
              <dl className="mt-3 grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2 lg:grid-cols-4">
                {KEY_DATES.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 pb-1.5 sm:block sm:border-0 sm:pb-0">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-medium text-slate-800 sm:mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section id="application-form" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-400">Application</p>
              <h2 className="mt-1 font-serif text-[22px] font-semibold text-brand-700">Stage 1 written application</h2>
            </div>
            <p className="text-[11.5px] text-slate-500">Fields marked <span className="text-rose-500">*</span> are required.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-serif text-[16px] font-semibold text-brand-700">Before you begin</h3>
                <p className="mt-1 text-[12.5px] text-slate-500">A few notes to help your application go smoothly.</p>
                <ol className="mt-3 grid gap-2.5 text-[12.5px] leading-relaxed text-slate-600 sm:grid-cols-2">
                  {INSTRUCTIONS.map((instruction, index) => (
                    <li key={instruction} className="flex gap-2">
                      <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-100">
                        {index + 1}
                      </span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="answer-form">
                {FORM_FIELDS.map((field, index) => (
                  <FormFieldBlock
                    key={field.id}
                    field={field}
                    index={index}
                    value={answers[field.id] ?? ''}
                    onChange={(value) => updateAnswer(field.id, value)}
                  />
                ))}

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-serif text-[15px] font-semibold text-brand-700">Ready to submit?</h3>
                      <p className="mt-1 text-[12px] text-slate-500">
                        You can return to any section before submitting.
                      </p>
                    </div>
                    <button
                      type="submit"
                      data-testid="submit-application"
                      className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-900"
                    >
                      Submit application
                    </button>
                  </div>

                  {missing.length > 0 ? (
                    <div
                      data-testid="validation-summary"
                      role="alert"
                      className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-800"
                    >
                      <p className="font-semibold">Some sections still need attention.</p>
                      <p className="mt-0.5">Complete: {missing.join(', ')}.</p>
                    </div>
                  ) : null}

                  {submitted ? (
                    <div
                      data-testid="submission-confirmation"
                      className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] leading-relaxed text-emerald-900"
                    >
                      <p className="font-semibold">Application received.</p>
                      <p className="mt-0.5">
                        Your reference is <span className="font-mono font-semibold">{submitted.reference}</span>. We
                        will email a confirmation and respond by 31 March 2027.
                      </p>
                    </div>
                  ) : null}
                </div>
              </form>
            </div>

            <ProgressPanel answers={answers} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
