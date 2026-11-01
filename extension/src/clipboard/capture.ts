/**
 * Copy observation.
 *
 * The site's own capture-phase clipboard handler runs before this listener and may
 * call preventDefault(). Because `defaultPrevented` is only final after propagation
 * finishes, the check is deferred: a copy cancelled by the page is never recorded in
 * the assistant's history.
 *
 * The selection is also cloned to HTML, so a copy keeps headings, bold text and lists
 * when it is pasted into a rich editor later.
 */
export function installCopyCapture(onCopy: (text: string, html: string | null) => void): () => void {
  const listener = (event: ClipboardEvent) => {
    const selected = window.getSelection()?.toString() ?? '';
    const fromField = readFieldSelection(document.activeElement);
    const text = (selected || fromField).replace(/\r\n/g, '\n');
    const html = selected || !text ? selectedHtml() : null;

    window.setTimeout(() => {
      if (!text.trim() || event.defaultPrevented) return;
      onCopy(text, html);
    }, 0);
  };

  document.addEventListener('copy', listener, true);
  return () => document.removeEventListener('copy', listener, true);
}

function selectedHtml(): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  const html = container.innerHTML.trim();
  return html || null;
}

function readFieldSelection(target: Element | null): string {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    if (end > start) return target.value.slice(start, end);
  }
  return '';
}
