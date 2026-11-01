/**
 * Remembers the answer field the applicant last interacted with, so the test
 * panel's "programmatic update" control can target it after the drawer steals focus.
 */
let lastField: HTMLTextAreaElement | null = null;
let installed = false;

export function initAnswerFieldTracking(): void {
  if (installed) return;
  installed = true;
  document.addEventListener(
    'focusin',
    (event) => {
      const field = (event.target as Element | null)?.closest('textarea[data-answer-field]');
      if (field instanceof HTMLTextAreaElement) lastField = field;
    },
    true,
  );
}

export function getLastAnswerField(): HTMLTextAreaElement | null {
  if (lastField && lastField.isConnected) return lastField;
  return document.querySelector<HTMLTextAreaElement>('textarea[data-answer-field]');
}
