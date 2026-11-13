/**
 * HTML sanitiser for pasted rich text.
 *
 * The clipboard is untrusted input: it can contain script tags, event handlers or
 * javascript: URLs. Only formatting is kept; anything that can execute, navigate
 * unexpectedly or fetch remote content is removed.
 *
 * Tables are preserved as tables. Word puts its layout in inline styles, which are not
 * copied verbatim; instead the safe parts (alignment, background colour, percentage
 * widths, bold/italic/underline) are translated into a small, predictable style that
 * renders the same grid in any editor.
 */
const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DIV',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'I',
  'LI',
  'OL',
  'P',
  'PRE',
  'S',
  'SPAN',
  'STRONG',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'U',
  'UL',
]);

const DROPPED_TAGS = new Set([
  'AUDIO',
  'BUTTON',
  'CANVAS',
  'EMBED',
  'FORM',
  'IFRAME',
  'IMG',
  'INPUT',
  'LINK',
  'MATH',
  'META',
  'OBJECT',
  'SCRIPT',
  'SELECT',
  'STYLE',
  'SVG',
  'TEXTAREA',
  'VIDEO',
]);

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  A: ['href', 'title'],
  TD: ['colspan', 'rowspan'],
  TH: ['colspan', 'rowspan', 'scope'],
};

const FORMATTABLE_TAGS = new Set([
  'A',
  'BLOCKQUOTE',
  'CODE',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'P',
  'PRE',
  'SPAN',
  'TD',
  'TH',
]);

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i;
const SAFE_WIDTH = /^\d{1,4}(?:\.\d+)?(?:px|pt|%)?$/;
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

function parseStyle(value: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const part of value.split(';')) {
    const separator = part.indexOf(':');
    if (separator < 0) continue;
    const property = part.slice(0, separator).trim().toLowerCase();
    const declaration = part.slice(separator + 1).trim();
    if (property && declaration) declarations.set(property, declaration);
  }
  return declarations;
}

/** Accepts only a single colour token, never a shorthand with url() or gradients. */
function safeColour(value: string): string {
  const candidate = value.trim();
  if (SAFE_COLOR.test(candidate)) return candidate;
  const first = candidate.split(/\s+/)[0] ?? '';
  return SAFE_COLOR.test(first) ? first : '';
}

function cellPresentation(source: Element): { align: string; background: string; width: string } {
  const style = parseStyle(source.getAttribute('style') ?? '');
  const rawAlign = (style.get('text-align') ?? source.getAttribute('align') ?? '').toLowerCase();
  const rawBackground =
    style.get('background-color') ?? style.get('background') ?? source.getAttribute('bgcolor') ?? '';
  const rawWidth = (style.get('width') ?? source.getAttribute('width') ?? '').trim();

  return {
    align: ALIGNMENTS.has(rawAlign) ? rawAlign : '',
    background: safeColour(rawBackground),
    width: SAFE_WIDTH.test(rawWidth) ? rawWidth : '',
  };
}

/** Word often states borders only in cell styles; a table with none still gets a grid. */
function tableHasBorders(table: Element): boolean {
  const attribute = Number.parseInt(table.getAttribute('border') ?? '', 10);
  if (Number.isFinite(attribute) && attribute > 0) return true;

  let sawNone = false;
  for (const cell of Array.from(table.querySelectorAll('td, th'))) {
    const style = parseStyle(cell.getAttribute('style') ?? '');
    for (const [property, value] of style) {
      if (property !== 'border' && !property.startsWith('border-') && !property.startsWith('mso-border')) {
        continue;
      }
      if (/solid|dotted|dashed|double/i.test(value)) return true;
      if (/\bnone\b|\b0(?:px|pt|em)?\b/i.test(value)) sawNone = true;
    }
  }
  return !sawNone;
}

/** Null means the cell does not say; false means it explicitly has no border. */
function cellHasBorder(source: Element): boolean | null {
  const style = parseStyle(source.getAttribute('style') ?? '');
  let sawNone = false;
  let sawBorder = false;

  for (const [property, value] of style) {
    if (property !== 'border' && !property.startsWith('border-') && !property.startsWith('mso-border')) {
      continue;
    }
    if (/solid|dotted|dashed|double/i.test(value) && !/\bnone\b/i.test(value)) {
      sawBorder = true;
    } else if (/\bnone\b|\b0(?:px|pt|cm|em)?\b/i.test(value) || /\bwhite\b/i.test(value)) {
      sawNone = true;
    }
  }

  if (sawBorder) return true;
  if (sawNone) return false;
  return null;
}

/** Translates Word's inline font styles into semantic tags. */
function applyFormatting(source: Element, output: HTMLElement, doc: Document): void {
  if (!FORMATTABLE_TAGS.has(source.tagName.toUpperCase())) return;
  if (!output.textContent?.trim()) return;

  const style = parseStyle(source.getAttribute('style') ?? '');
  const weight = (style.get('font-weight') ?? '').toLowerCase();
  const bold = weight === 'bold' || weight === 'bolder' || /^[6-9]00$/.test(weight);
  const italic = (style.get('font-style') ?? '').toLowerCase() === 'italic';
  const underline = /underline/i.test(style.get('text-decoration') ?? '');

  const wrap = (tag: 'strong' | 'em' | 'u') => {
    const wrapper = doc.createElement(tag);
    while (output.firstChild) wrapper.appendChild(output.firstChild);
    output.appendChild(wrapper);
  };

  if (bold) wrap('strong');
  if (italic) wrap('em');
  if (underline) wrap('u');

  // Word colours cell text on spans; keep it when it is a plain colour value.
  const colour = safeColour(style.get('color') ?? '');
  if (colour && (source.tagName === 'SPAN' || source.tagName === 'P' || source.tagName === 'DIV')) {
    output.style.color = colour;
  }
}

function cleanNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    // Word's CF_HTML fragment can begin with the tail of a conditional comment.
    if (/^\s*(?:<!--|-->|<!\[endif\]|<!\[if[^\]]*\]>)\s*$/i.test(text)) return null;
    return doc.createTextNode(text);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const tag = element.tagName.toUpperCase();

  if (DROPPED_TAGS.has(tag)) return null;

  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = doc.createDocumentFragment();
    element.childNodes.forEach((child) => {
      const cleaned = cleanNode(child, doc);
      if (cleaned) fragment.appendChild(cleaned);
    });
    return fragment;
  }

  const output = doc.createElement(tag.toLowerCase());
  const allowed = ALLOWED_ATTRIBUTES[tag] ?? [];

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (!allowed.includes(name)) continue;
    if (tag === 'A' && name === 'href' && !/^(https?:|mailto:|#|\/)/i.test(attribute.value)) continue;
    if ((name === 'colspan' || name === 'rowspan') && !/^\d{1,2}$/.test(attribute.value.trim())) continue;
    output.setAttribute(name, attribute.value);
  }

  if (tag === 'A' && output.hasAttribute('href')) {
    output.setAttribute('target', '_blank');
    output.setAttribute('rel', 'noreferrer noopener');
  }

  if (tag === 'TABLE') {
    output.setAttribute('data-ca-borders', tableHasBorders(element) ? '1' : '0');
  }

  if (tag === 'TD' || tag === 'TH') {
    const presentation = cellPresentation(element);
    if (presentation.align) output.setAttribute('data-ca-align', presentation.align);
    if (presentation.background) output.setAttribute('data-ca-bg', presentation.background);
    if (presentation.width) output.setAttribute('data-ca-width', presentation.width);
    if (cellHasBorder(element) === false) output.setAttribute('data-ca-border', '0');
  }

  element.childNodes.forEach((child) => {
    const cleaned = cleanNode(child, doc);
    if (cleaned) output.appendChild(cleaned);
  });

  applyFormatting(element, output, doc);

  return output;
}

/** Word's cell widths arrive as percentages, or as pixels after Chrome rewrites them. */
interface Width {
  value: number;
  unit: 'px' | 'pt' | '%';
}

function parseWidth(value: string): Width | null {
  const match = /^(\d{1,4}(?:\.\d+)?)(px|pt|%)?$/.exec(value.trim());
  if (!match) return null;
  return {
    value: Number.parseFloat(match[1]),
    unit: (match[2] as Width['unit'] | undefined) ?? 'px',
  };
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Applies the small, safe presentation model to every table in the fragment. */
function presentTables(container: HTMLElement): void {
  container.querySelectorAll('table').forEach((node) => {
    const table = node as HTMLTableElement;
    const bordered = table.getAttribute('data-ca-borders') !== '0';
    table.removeAttribute('data-ca-borders');
    table.setAttribute(
      'style',
      `border-collapse:collapse;width:100%;max-width:100%;margin:8px 0;${bordered ? '' : 'border:none;'}`,
    );

    // Widths repeat on every row; normalise within each row so a 14-row table does not
    // divide each cell by the sum of all rows.
    Array.from(table.rows).forEach((row) => {
      const cells = Array.from(row.cells);
      const widths = cells.map((cell) => parseWidth(cell.getAttribute('data-ca-width') ?? ''));
      const hasPercent = widths.some((width) => width?.unit === '%');
      const pixelTotal = widths.reduce(
        (sum, width) => sum + (width && width.unit !== '%' ? width.value : 0),
        0,
      );

      cells.forEach((cell, index) => {
        const align = cell.getAttribute('data-ca-align') ?? '';
        const background = cell.getAttribute('data-ca-bg') ?? '';
        const borderless = cell.getAttribute('data-ca-border') === '0';
        for (const attribute of ['data-ca-align', 'data-ca-bg', 'data-ca-width', 'data-ca-border']) {
          cell.removeAttribute(attribute);
        }

        // Chrome rewrites Word's percentage widths to pixels while pasting; turning those
        // pixels back into proportions keeps the original column layout instead of a
        // table of near-empty columns.
        const source = widths[index];
        let width = '';
        if (source?.unit === '%') {
          width = `${roundPercent(source.value)}%`;
        } else if (source && !hasPercent && pixelTotal > 0) {
          width = `${roundPercent((source.value / pixelTotal) * 100)}%`;
        }

        const styles = ['padding:6px 8px', 'vertical-align:top'];
        if (bordered && !borderless) styles.push('border:1px solid #94a3b8');
        if (align) styles.push(`text-align:${align}`);
        if (background) styles.push(`background-color:${background}`);
        if (width) styles.push(`width:${width}`);
        cell.setAttribute('style', `${styles.join(';')};`);

        // Word pads every cell with an empty MsoNormal paragraph; keep the cell text tight.
        cell.querySelectorAll('p, div').forEach((block) => {
          const element = block as HTMLElement;
          if (!element.textContent?.trim() && !element.querySelector('br')) {
            element.remove();
            return;
          }
          element.style.margin = '0';
        });
      });
    });
  });
}

/** Returns a safe HTML fragment containing only formatting markup. */
export function sanitiseHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = doc.createElement('div');
  doc.body.childNodes.forEach((child) => {
    const cleaned = cleanNode(child, doc);
    if (cleaned) container.appendChild(cleaned);
  });
  presentTables(container);
  return container.innerHTML;
}

/** True when the fragment carries structure worth inserting as HTML. */
export function isRichHtml(html: string | null): boolean {
  if (!html) return false;
  return /<(p|div|br|h[1-6]|ul|ol|li|strong|b|em|i|u|s|blockquote|pre|code|table|a)\b/i.test(html);
}
