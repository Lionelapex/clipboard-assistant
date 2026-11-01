import { chromium } from '@playwright/test';

/**
 * Enumerates every editable field on the Allow Copy + playground and measures which
 * insertion strategy the page accepts. No extension involved: this isolates page behaviour.
 *
 * Strategies:
 *   one-shot  – native value setter + input event (what a normal paste does)
 *   typed     – keydown per character, then execCommand('insertText')
 */
const URL = 'https://allowcopyplus.pidevex.com/force-paste#try';
const SAMPLE = 'Hello 123 Привет';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1500);

const report = await page.evaluate(async (sample) => {
  const isEditable = (el) =>
    el.matches('input:not([type="hidden"]), textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]');
  const editableFor = (el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') return el;
    return null;
  };
  const labelFor = (el) => {
    const card = el.closest('div.rounded-xl, article, section') ?? el.parentElement;
    const heading = card?.querySelector('h3, h4, h2');
    return (heading?.textContent ?? el.getAttribute('placeholder') ?? el.tagName).trim().slice(0, 60);
  };
  const valueOf = (el) => {
    if ('value' in el) return el.value;
    return el.innerText ?? '';
  };
  const setValue = (el, text) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } else {
      el.focus();
      document.execCommand('insertText', false, text);
    }
  };
  const clear = (el) => {
    if ('value' in el) setValue(el, '');
    else if (el.isContentEditable) {
      el.focus();
      el.textContent = '';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const all = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]'));
  const fields = all.filter((el) => isEditable(el) && !el.closest('#__next-build-watcher'));

  const out = [];
  for (const el of fields) {
    try {
    if (el.closest('iframe')) continue;
    const label = labelFor(el);
    const tag = `${el.tagName.toLowerCase()}${el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''}${
      el.isContentEditable ? '[contenteditable]' : ''
    }${el.getAttribute('role') === 'textbox' ? '[role=textbox]' : ''}`;
    const before = valueOf(el);
    clear(el);
    await wait(30);

    // one-shot
    el.focus?.();
    const target = editableFor(el);
    if (target) setValue(target, sample);
    await wait(250);
    const afterOneShot = valueOf(el);
    const oneShot = afterOneShot.includes(sample) ? 'accepted' : 'rejected';

    // typed (fresh attempt)
    let typed = 'n/a';
    if (oneShot !== 'accepted') {
      clear(el);
      await wait(30);
      if (el.isContentEditable) {
        el.focus();
        for (const ch of Array.from(sample)) {
          const ev = new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true });
          const prevented = !el.dispatchEvent(ev);
          if (!prevented) document.execCommand('insertText', false, ch);
          await wait(2);
        }
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        el.setSelectionRange?.(0, 0);
        for (const ch of Array.from(sample)) {
          const ev = new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true });
          const prevented = !el.dispatchEvent(ev);
          if (!prevented) document.execCommand('insertText', false, ch);
          await wait(2);
        }
      }
      await wait(250);
      typed = valueOf(el).includes(sample) ? 'accepted' : 'rejected';
      clear(el);
    }

    out.push({ label, tag, oneShot, typed, editable: Boolean(target) || el.isContentEditable });
    } catch (error) {
      out.push({ label: labelFor(el), tag: el.tagName.toLowerCase(), error: String(error) });
    }
  }

  // iframe widget
  const frame = document.querySelector('iframe');
  let iframeInfo = null;
  try {
    if (frame) {
    const doc = frame.contentDocument;
    const inner = doc?.querySelector('input, textarea, [contenteditable="true"]');
    iframeInfo = {
      sameOriginAccess: Boolean(doc),
      innerField: inner ? `${inner.tagName.toLowerCase()}` : null,
      innerValue: inner ? ('value' in inner ? inner.value : inner.innerText) : null,
    };
    if (inner) {
      const proto = inner.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(inner, sample);
      inner.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: sample }));
      await wait(250);
      iframeInfo.afterOneShot = 'value' in inner ? inner.value : inner.innerText;
      iframeInfo.guarded = iframeInfo.afterOneShot !== sample;
    }
    }
  } catch (error) {
    iframeInfo = { error: String(error) };
  }

  return { fields: out, iframeInfo };
}, SAMPLE);

console.log(JSON.stringify(report, null, 2));
await browser.close();
