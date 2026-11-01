import type { FieldDescriptor } from '../types';
import {
  isContentEditableElement,
  isElement,
  isFrameElement,
  isHTMLElement,
  isInputElement,
  isTextAreaElement,
  isTextControl,
  sameOriginFrameDocuments,
} from './dom';

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

const CONTENTEDITABLE_SELECTOR =
  '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';

function isTextInput(el: HTMLInputElement): boolean {
  return TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase()) && !el.disabled && !el.readOnly;
}

/** Resolves any element inside an editable area to the editable host element. */
export function resolveEditable(target: Element | null): HTMLElement | null {
  if (!target) return null;
  const el = isHTMLElement(target) ? target : isElement(target) ? target.parentElement : null;
  if (!el) return null;

  if (isTextAreaElement(el)) return el.disabled || el.readOnly ? null : el;
  if (isInputElement(el)) return isTextInput(el) ? el : null;

  if (isContentEditableElement(el)) {
    const host = el.closest(CONTENTEDITABLE_SELECTOR);
    return (host as HTMLElement | null) ?? el;
  }

  return null;
}

export function describeField(el: HTMLElement): FieldDescriptor {
  const root = el.getRootNode() as Document | ShadowRoot;
  const labelledBy = el.getAttribute('aria-labelledby');
  const labelledByText = labelledBy
    ? labelledBy
        .split(/\s+/)
        .map((id) => root.querySelector(`#${CSS.escape(id)}`)?.textContent?.trim())
        .filter(Boolean)
        .join(' ')
    : '';
  const explicitLabel = el.id
    ? root.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() ?? ''
    : '';
  const legend = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim() ?? '';
  const nearbyHeading =
    el
      .closest('fieldset, section, article, [data-field-section]')
      ?.querySelector('legend, h1, h2, h3, h4, h5, h6, [data-field-heading]')
      ?.textContent?.trim() ?? '';

  const label =
    el.getAttribute('aria-label')?.trim() ||
    labelledByText ||
    el.getAttribute('data-field-label')?.trim() ||
    explicitLabel ||
    el.closest('label')?.textContent?.trim() ||
    el.getAttribute('placeholder')?.trim() ||
    legend ||
    nearbyHeading ||
    el.id ||
    el.getAttribute('name') ||
    el.tagName.toLowerCase();

  return {
    tag: el.tagName.toLowerCase(),
    label: label.length > 56 ? `${label.slice(0, 55)}…` : label,
    id: el.id || null,
    name: el.getAttribute('name'),
    richText: el.isContentEditable,
    maxLength: isTextControl(el) && el.maxLength > 0 ? el.maxLength : null,
  };
}

/**
 * Resolves the active element, descending through open shadow roots and same-origin
 * frames (an iframe's own activeElement is invisible to the top document otherwise).
 */
export function deepActiveElement(doc: Document = document): Element | null {
  let active: Element | null = doc.activeElement;
  let depth = 0;
  while (active && depth < 8) {
    depth += 1;
    if (isFrameElement(active)) {
      let child: Document | null = null;
      try {
        child = active.contentDocument;
      } catch {
        child = null;
      }
      if (child?.activeElement) {
        active = child.activeElement;
        continue;
      }
    }
    if (active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
      continue;
    }
    break;
  }
  return active;
}

/** Resolves the editable element that an event actually occurred in (shadow-DOM aware). */
function eventEditable(event: Event): HTMLElement | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (isElement(node)) {
      const editable = resolveEditable(node);
      if (editable) return editable;
    }
  }
  return resolveEditable(isElement(event.target) ? event.target : null);
}

let trackedField: HTMLElement | null = null;
let trackedRange: Range | null = null;

export function getTrackedField(): HTMLElement | null {
  if (trackedField && trackedField.isConnected) return trackedField;
  trackedField = null;
  return null;
}

/**
 * Reports the last tracked element even if the page has since removed it, so the
 * popup can say "the field was removed" instead of the generic "no field".
 */
export function lastTrackedFieldState(): { element: HTMLElement | null; removed: boolean } {
  return {
    element: trackedField,
    removed: Boolean(trackedField && !trackedField.isConnected),
  };
}

export function getTrackedRange(): Range | null {
  if (trackedRange && trackedRange.startContainer.isConnected) return trackedRange;
  trackedRange = null;
  return null;
}

const watchedDocuments = new WeakSet<Document>();

function handleFocusIn(event: Event): void {
  const field = eventEditable(event);
  if (field) {
    trackedField = field;
    trackedRange = null;
  }
}

function handlePointerDown(event: Event): void {
  const field = eventEditable(event);
  if (field) trackedField = field;
}

function handleSelectionChange(event: Event): void {
  const doc = isElement(event.target) ? event.target.ownerDocument : (event.target as Document | null);
  const selection = doc?.getSelection?.();
  if (!selection || selection.rangeCount === 0) return;
  const anchorElement = isElement(selection.anchorNode)
    ? selection.anchorNode
    : selection.anchorNode?.parentElement ?? null;
  if (anchorElement && resolveEditable(anchorElement)) {
    trackedRange = selection.getRangeAt(0).cloneRange();
  }
}

function watchDocument(doc: Document): void {
  if (watchedDocuments.has(doc)) return;
  watchedDocuments.add(doc);
  doc.addEventListener('focusin', handleFocusIn, true);
  doc.addEventListener('pointerdown', handlePointerDown, true);
  doc.addEventListener('selectionchange', handleSelectionChange);
}

/**
 * Attaches the focus listeners to the top document and to every same-origin frame.
 * Pages that keep a real field inside an iframe (embedded widgets) then behave like
 * normal fields: the element reference survives the panel taking focus.
 */
function watchFrames(): void {
  for (const doc of sameOriginFrameDocuments()) watchDocument(doc);

  document.querySelectorAll('iframe').forEach((frame) => {
    if (frame.dataset.caWatched === '1') return;
    frame.dataset.caWatched = '1';
    frame.addEventListener('load', () => {
      try {
        const child = frame.contentDocument;
        if (child) watchDocument(child);
      } catch {
        /* cross-origin frame */
      }
    });
  });
}

/**
 * Tracks the most recently focused editable element. Clicking the floating panel
 * (which lives in a shadow root) fires focusin on the shadow host, so the previously
 * focused field is preserved and insertion can target it.
 */
export function initFocusTracker(): void {
  watchDocument(document);
  watchFrames();

  const observer = new MutationObserver(() => watchFrames());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/** The field that insertion should target. */
export function getActiveField(): HTMLElement | null {
  return resolveEditable(deepActiveElement()) ?? getTrackedField();
}
