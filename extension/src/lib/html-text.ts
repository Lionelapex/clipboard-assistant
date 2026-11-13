/**
 * Table-aware text conversion.
 *
 * A table cannot exist inside an input or textarea, so the closest faithful form is
 * tab-separated rows: one line per row, one tab per column. That is also what Word puts
 * on the plain-text clipboard flavour, and what spreadsheets understand when pasted.
 */

/** Flattens one cell to a single line of text. */
function cellText(cell: HTMLTableCellElement): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  clone.querySelectorAll('p, div, li').forEach((block) => block.append(' '));
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Converts a table element to tab-separated rows, padding colspans with empty cells. */
export function tableToText(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .map((row) => {
      const cells: string[] = [];
      for (const cell of Array.from(row.cells)) {
        cells.push(cellText(cell));
        const span = Number.parseInt(cell.getAttribute('colspan') ?? '1', 10);
        for (let index = 1; index < Math.min(Math.max(span, 1), 50); index += 1) {
          cells.push('');
        }
      }
      return cells.join('\t');
    })
    .join('\n');
}

/** True when the fragment contains at least one table. */
export function containsTable(html: string | null): boolean {
  return Boolean(html && /<table[\s>]/i.test(html));
}

/**
 * HTML to readable text, with every table rendered as tab-separated rows.
 * Nested tables are converted from the inside out so their rows stay intact.
 */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Word's clipboard fragment may carry the tail of a conditional comment as text.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const junk: Text[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (/^\s*(?:<!--|-->|<!\[endif\]|<!\[if[^\]]*\]>)\s*$/i.test(text.nodeValue ?? '')) {
      junk.push(text);
    }
  }
  junk.forEach((text) => text.remove());

  const tables = Array.from(doc.querySelectorAll('table')).reverse();
  for (const table of tables) {
    const text = tableToText(table as HTMLTableElement);
    if (text) table.replaceWith(doc.createTextNode(`\n${text}\n`));
    else table.remove();
  }

  doc.querySelectorAll('br').forEach((br) => br.replaceWith(doc.createTextNode('\n')));
  doc
    .querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, tr')
    .forEach((block) => block.append(doc.createTextNode('\n')));

  const lines = (doc.body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    // Trim spaces around each line, but never tabs: they are the column separators,
    // including a trailing empty cell.
    .map((line) => line.replace(/^ +| +$/g, ''));

  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

  return lines.join('\n');
}
