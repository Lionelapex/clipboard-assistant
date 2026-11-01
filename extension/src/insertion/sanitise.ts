/**
 * HTML sanitiser for pasted rich text.
 *
 * The clipboard is untrusted input: it can contain script tags, event handlers or
 * javascript: URLs. Only formatting is kept; anything that can execute, navigate
 * unexpectedly or fetch remote content is removed.
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

function cleanNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? '');
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
    output.setAttribute(name, attribute.value);
  }

  if (tag === 'A' && output.hasAttribute('href')) {
    output.setAttribute('target', '_blank');
    output.setAttribute('rel', 'noreferrer noopener');
  }

  element.childNodes.forEach((child) => {
    const cleaned = cleanNode(child, doc);
    if (cleaned) output.appendChild(cleaned);
  });

  return output;
}

/** Returns a safe HTML fragment containing only formatting markup. */
export function sanitiseHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = doc.createElement('div');
  doc.body.childNodes.forEach((child) => {
    const cleaned = cleanNode(child, doc);
    if (cleaned) container.appendChild(cleaned);
  });
  return container.innerHTML;
}

/** True when the fragment carries structure worth inserting as HTML. */
export function isRichHtml(html: string | null): boolean {
  if (!html) return false;
  return /<(p|div|br|h[1-6]|ul|ol|li|strong|b|em|i|u|s|blockquote|pre|code|table|a)\b/i.test(html);
}
