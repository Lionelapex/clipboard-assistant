/** Shared types for the Clipboard Assistant extension. */

export type HistorySource = 'copy' | 'refresh' | 'selection';

export interface HistoryEntry {
  id: string;
  text: string;
  createdAt: number;
  source: HistorySource;
  chars: number;
}

export interface AssistantSettings {
  panelPosition: { x: number; y: number } | null;
  panelOpen: boolean;
}

export interface FieldDescriptor {
  tag: string;
  label: string;
  id: string | null;
  name: string | null;
  richText: boolean;
  maxLength: number | null;
}

export type InsertStrategy = 'native-value-setter' | 'exec-command' | 'range-insert' | 'typing' | 'none';

export interface InsertResult {
  ok: boolean;
  verified: boolean;
  strategy: InsertStrategy;
  detail: string;
  field: FieldDescriptor | null;
  expectedChars: number;
  actualChars: number;
  elapsedMs: number;
}

export interface ClipboardReadResult {
  text: string;
  via: 'offscreen' | 'navigator.clipboard';
}

/**
 * Reasons insertion can genuinely fail. There is deliberately no "site is not
 * allowlisted" reason: the extension does not gate sites at the application level.
 */
export type InsertFailureReason =
  | 'empty'
  | 'no-field'
  | 'read-only'
  | 'disabled'
  | 'removed'
  | 'unsupported'
  | 'restricted'
  | 'failed';

/** Context returned by the content script to the popup. */
export interface ContentContext {
  origin: string;
  field: FieldDescriptor | null;
}

/** Result returned by the content script when the popup asks it to insert text. */
export interface ContentInsertResponse {
  ok: boolean;
  verified: boolean;
  reason?: InsertFailureReason;
  detail: string;
  field: FieldDescriptor | null;
  strategy?: InsertStrategy;
  elapsedMs?: number;
  /** Characters actually inserted (may be fewer than the snippet if the field is limited). */
  chars?: number;
}
