/**
 * Realm-safe DOM helpers.
 *
 * Elements inside a same-origin iframe are instances of that frame's constructors, so
 * `node instanceof HTMLTextAreaElement` is false in the parent frame even though the node
 * behaves exactly like a textarea. Everything here therefore keys off `nodeType`/`tagName`
 * instead of prototypes.
 */

export function isElement(value: unknown): value is Element {
  return Boolean(value) && typeof value === 'object' && (value as Node).nodeType === 1;
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return isElement(value) && (value as Element).namespaceURI === 'http://www.w3.org/1999/xhtml';
}

export function isInputElement(value: unknown): value is HTMLInputElement {
  return isElement(value) && value.tagName === 'INPUT';
}

export function isTextAreaElement(value: unknown): value is HTMLTextAreaElement {
  return isElement(value) && value.tagName === 'TEXTAREA';
}

export function isTextControl(value: unknown): value is HTMLInputElement | HTMLTextAreaElement {
  return isInputElement(value) || isTextAreaElement(value);
}

export function isContentEditableElement(value: unknown): value is HTMLElement {
  return isHTMLElement(value) && value.isContentEditable;
}

export function isFrameElement(value: unknown): value is HTMLIFrameElement {
  return isElement(value) && value.tagName === 'IFRAME';
}

/** The document that owns the element (may be an iframe document). */
export function ownerDocument(el: Element): Document {
  return el.ownerDocument ?? document;
}

/** Same-origin documents of frames inside `root`, including nested frames. */
export function sameOriginFrameDocuments(root: Document = document): Document[] {
  const docs: Document[] = [];
  const visit = (doc: Document, depth: number) => {
    if (depth > 4) return;
    doc.querySelectorAll('iframe').forEach((frame) => {
      let child: Document | null = null;
      try {
        child = frame.contentDocument;
      } catch {
        child = null;
      }
      if (child) {
        docs.push(child);
        visit(child, depth + 1);
      }
    });
  };
  visit(root, 0);
  return docs;
}
