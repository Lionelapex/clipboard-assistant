/**
 * Copy observation.
 *
 * The site's own capture-phase clipboard handler runs before this listener and may
 * call preventDefault(). Because `defaultPrevented` is only final after propagation
 * finishes, the check is deferred: a copy cancelled by the page is never recorded in
 * the assistant's history.
 */
export function installCopyCapture(onCopy: (text: string) => void): () => void {
  const listener = (event: ClipboardEvent) => {
    const selected = window.getSelection()?.toString() ?? '';
    const fromField = readFieldSelection(document.activeElement);
    const text = (selected || fromField).replace(/\r\n/g, '\n');

    window.setTimeout(() => {
      if (!text.trim() || event.defaultPrevented) return;
      onCopy(text);
    }, 0);
  };

  document.addEventListener('copy', listener, true);
  return () => document.removeEventListener('copy', listener, true);
}

function readFieldSelection(target: Element | null): string {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    if (end > start) return target.value.slice(start, end);
  }
  return '';
}
