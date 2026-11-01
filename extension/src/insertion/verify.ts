import type { FieldDescriptor, InsertResult, InsertStrategy } from '../types';
import { describeField } from './focusTracker';
import { isTextControl } from './dom';

export function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function readFieldValue(el: HTMLElement): string {
  if (isTextControl(el)) return el.value;
  return el.innerText ?? el.textContent ?? '';
}

/** Confirms the field really contains the text, rather than trusting execCommand's boolean. */
export function verifyText(expected: string, actual: string): { verified: boolean; detail: string } {
  const target = normalizeText(expected);
  const value = normalizeText(actual);

  if (!target) return { verified: false, detail: 'There was nothing to insert.' };
  if (value.includes(target)) {
    return { verified: true, detail: 'Field content matches the inserted text.' };
  }

  const head = target.slice(0, 40);
  const tail = target.slice(-40);
  if (target.length > 80 && value.includes(head) && value.includes(tail)) {
    return { verified: true, detail: 'Field content matches the inserted text (whitespace normalised).' };
  }
  if (value.includes(head)) {
    return {
      verified: false,
      detail: 'Only the start of the text is present. The field may have truncated it or rejected the update.',
    };
  }

  // Masked fields reformat the value ("2025550143" -> "+1 (202) 555-0143"). Compare the
  // alphanumeric skeleton so a correct masked result is not reported as a failure.
  const skeleton = (input: string) => input.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  const targetSkeleton = skeleton(target);
  if (targetSkeleton && skeleton(value).includes(targetSkeleton)) {
    return { verified: true, detail: 'Field content matches after ignoring the field\'s formatting characters.' };
  }

  return { verified: false, detail: 'The field value did not change as expected.' };
}

export function buildResult(
  el: HTMLElement,
  strategy: InsertStrategy,
  expected: string,
  actual: string,
  startedAt: number,
  detail?: string,
): InsertResult {
  const verification = verifyText(expected, actual);
  return {
    ok: verification.verified,
    verified: verification.verified,
    strategy,
    detail: detail ? `${detail} ${verification.detail}` : verification.detail,
    field: safeDescribe(el),
    expectedChars: expected.length,
    actualChars: actual.length,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

function safeDescribe(el: HTMLElement): FieldDescriptor | null {
  try {
    return describeField(el);
  } catch {
    return null;
  }
}
