import { useCallback, useState } from 'react';
import { useRestrictions } from '../restrictions/RestrictionContext';
import { PRESETS, RESTRICTION_LABELS, presetById, type RestrictionKey } from '../restrictions/presets';
import { getLastAnswerField } from '../forms/activeField';
import { cn, formatNumber } from '../lib/format';

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09A1.7 1.7 0 0 0 20.86 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function TestControls() {
  const { configId, settings, selectConfig, toggle, events, clearEvents } = useRestrictions();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const activePreset = configId === 'custom' ? null : presetById(configId);

  const runProgrammaticInsert = useCallback(() => {
    const field = getLastAnswerField();
    if (!field) {
      setNote('No answer field is available. Focus a text area first.');
      return;
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) {
      setNote('The native value setter is unavailable in this browser.');
      return;
    }

    const snippet = ` [Programmatic update ${new Date().toLocaleTimeString('en-GB')}]`;
    setter.call(field, field.value + snippet);
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: snippet }));
    field.focus();
    setNote(
      `Inserted ${formatNumber(snippet.length)} characters into “${field.getAttribute('aria-label') ?? 'answer field'}” with the native value setter. No clipboard event was fired.`,
    );
  }, []);

  return (
    <>
      <button
        type="button"
        data-testid="test-controls-toggle"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/95 px-3.5 py-2 text-[11.5px] font-semibold text-slate-600 shadow-md backdrop-blur transition-colors hover:border-slate-400 hover:text-slate-900"
      >
        <GearIcon />
        Test controls
      </button>

      {open ? (
        <div
          data-testid="test-controls"
          className="fixed bottom-16 left-5 z-50 flex max-h-[78vh] w-[366px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <div>
              <h2 className="text-[12.5px] font-semibold text-slate-800">Testing settings</h2>
              <p className="text-[10.5px] text-slate-500">Clipboard restriction manager</p>
            </div>
            <button
              type="button"
              aria-label="Close testing settings"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current configuration</p>
              <p className="mt-0.5 text-[12px] font-semibold text-slate-800" data-testid="current-config">
                {activePreset ? `${activePreset.id} · ${activePreset.name}` : 'Custom configuration'}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(Object.keys(RESTRICTION_LABELS) as RestrictionKey[]).map((key) => (
                  <span
                    key={key}
                    data-testid={`chip-${key}`}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium ring-1',
                      settings[key]
                        ? 'bg-rose-50 text-rose-700 ring-rose-200'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                    )}
                  >
                    {RESTRICTION_LABELS[key]} {settings[key] ? 'blocked' : 'allowed'}
                  </span>
                ))}
              </div>
            </div>

            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Configurations</h3>
              <div className="mt-1.5 space-y-1.5">
                {PRESETS.map((preset) => (
                  <label
                    key={preset.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors',
                      configId === preset.id
                        ? 'border-brand-500 bg-brand-50/60'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="restriction-config"
                      className="mt-0.5 h-3.5 w-3.5 accent-[#12304a]"
                      checked={configId === preset.id}
                      onChange={() => selectConfig(preset.id)}
                      data-testid={`config-${preset.id}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-[11.5px] font-semibold text-slate-800">
                        {preset.id} · {preset.name}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">{preset.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Individual controls</h3>
              <div className="mt-1.5 space-y-1.5">
                {(Object.keys(RESTRICTION_LABELS) as RestrictionKey[]).map((key) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5">
                    <span className="text-[11.5px] text-slate-700">Block {RESTRICTION_LABELS[key].toLowerCase()} events</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings[key]}
                      aria-label={`Block ${key} events`}
                      data-testid={`toggle-${key}`}
                      onClick={() => toggle(key)}
                      className={cn(
                        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                        settings[key] ? 'bg-brand-700' : 'bg-slate-300',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                          settings[key] ? 'left-[18px]' : 'left-0.5',
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Programmatic update</h3>
              <button
                type="button"
                data-testid="programmatic-insert"
                onClick={runProgrammaticInsert}
                className="mt-1.5 w-full rounded-lg border border-dashed border-brand-500/50 bg-brand-50/50 px-3 py-2 text-[11.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
              >
                Simulate programmatic insert
              </button>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
                Writes through the native value setter and dispatches a synthetic <code>input</code> event. Clipboard
                restrictions do not apply, because no clipboard event occurs.
              </p>
              {note ? (
                <p data-testid="programmatic-note" className="mt-1.5 rounded bg-sky-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-sky-800">
                  {note}
                </p>
              ) : null}
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Event log</h3>
                <button type="button" onClick={clearEvents} className="text-[10px] font-medium text-slate-400 hover:text-rose-600">
                  Clear log
                </button>
              </div>
              <ul data-testid="event-log" className="mt-1.5 space-y-1">
                {events.length === 0 ? (
                  <li className="rounded border border-dashed border-slate-200 px-2 py-2 text-center text-[10.5px] text-slate-400">
                    No clipboard events recorded yet.
                  </li>
                ) : (
                  events.slice(0, 12).map((event) => (
                    <li
                      key={event.id}
                      data-event-type={event.type}
                      data-event-blocked={String(event.blocked)}
                      className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[10px]"
                    >
                      <span
                        className={cn(
                          'shrink-0 font-semibold',
                          event.type === 'programmatic-input'
                            ? 'text-sky-700'
                            : event.blocked
                              ? 'text-rose-600'
                              : 'text-emerald-700',
                        )}
                      >
                        {event.type}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-500">{event.field}</span>
                      <span className={cn('shrink-0', event.blocked ? 'text-rose-600' : 'text-slate-400')}>
                        {event.blocked ? 'blocked' : 'allowed'}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-3.5 py-2 text-[10px] leading-relaxed text-slate-500">
            Restrictions only cancel clipboard events on answer fields. They cannot prevent a browser extension from
            writing to the DOM directly.
          </div>
        </div>
      ) : null}
    </>
  );
}
