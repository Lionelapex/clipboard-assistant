import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(here, '..', '..');
export const EXTENSION_DIR = path.join(PROJECT_ROOT, 'extension', 'dist');
export const MOCK_DIR = path.join(PROJECT_ROOT, 'mock-website');

export const MOCK_PORT = 5173;
export const MOCK_ORIGIN = 'http://127.0.0.1:5173';

/**
 * A second, independent origin (plain HTML and React test sites). It is deliberately
 * not registered anywhere in the extension — it exists to prove out-of-the-box
 * operation on a site the extension has never seen.
 */
export const FIXTURE_PORT = 5180;
export const FIXTURE_ORIGIN = 'http://127.0.0.1:5180';

/** Attribute selectors exposed by the mock site for deterministic tests. */
export const TEST_IDS = {
  answerForm: 'answer-form',
  testControlsToggle: 'test-controls-toggle',
  programmaticInsert: 'programmatic-insert',
  eventLog: 'event-log',
  panel: 'ca-panel',
  launcher: 'ca-launcher',
  preview: 'ca-preview',
  refresh: 'ca-refresh',
  paste: 'ca-paste',
  status: 'ca-status',
  activeField: 'ca-active-field',
} as const;
