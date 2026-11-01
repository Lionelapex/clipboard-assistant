import { chromium } from '@playwright/test';

/**
 * Diagnostic probe for the "Boss level" fields on allowcopyplus.pidevex.com.
 * No extension involved: this isolates how the page judges programmatic input.
 */
const URL = 'https://allowcopyplus.pidevex.com/force-paste#try';
const SAMPLE = 'Force Paste works! Привет · 世界 👍';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1500);

const typing = page.locator('input[placeholder="Typing only"]');
const phone = page.locator('input[placeholder="+1 (___) ___-____"]');
const fake = page.locator('div[role="textbox"][tabindex="0"]:not([contenteditable])');
console.log('counts', await typing.count(), await phone.count(), await fake.count());

// 1) One-shot insertion, the strategy the extension uses today.
await typing.click();
const oneShot = await page.evaluate((text) => {
  const el = document.querySelector('input[placeholder="Typing only"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, text);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  return el.value;
}, SAMPLE);
await page.waitForTimeout(400);
console.log('one-shot immediate:', JSON.stringify(oneShot));
console.log('one-shot after guard:', JSON.stringify(await typing.inputValue()));

// 2) Character-by-character through execCommand, with a keydown first.
await typing.click();
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');
const typed = await page.evaluate(async (text) => {
  const el = document.querySelector('input[placeholder="Typing only"]');
  el.focus();
  const chars = Array.from(text);
  const handled = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const down = new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true });
    const prevented = !el.dispatchEvent(down);
    if (!prevented) document.execCommand('insertText', false, ch);
    else handled.push(ch);
    if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return { value: el.value, preventedCount: handled.length };
}, SAMPLE);
await page.waitForTimeout(400);
console.log('typed result:', JSON.stringify(typed));
console.log('typed field value:', JSON.stringify(await typing.inputValue()));

// 3) Phone field: dispatch keydown only, let the page's handler update React state.
await phone.click();
await page.evaluate(async () => {
  const el = document.querySelector('input[placeholder="+1 (___) ___-____"]');
  for (const digit of '2025550143') {
    const down = new KeyboardEvent('keydown', { key: digit, bubbles: true, cancelable: true });
    el.dispatchEvent(down);
    await new Promise((r) => setTimeout(r, 10));
  }
});
await page.waitForTimeout(300);
console.log('phone after keydown dispatch:', JSON.stringify(await phone.inputValue()));

// 4) Fake field: untrusted keydown should be refused.
await fake.click();
const fakeBefore = await fake.innerText();
await page.evaluate(() => {
  const el = document.querySelector('div[role="textbox"]:not([contenteditable])');
  el.focus();
  for (const ch of 'ABC') {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
  }
});
await page.waitForTimeout(200);
console.log('fake field before:', JSON.stringify(fakeBefore), 'after:', JSON.stringify(await fake.innerText()));

await page.screenshot({ path: 'test-results/probe-typing-only.png', fullPage: false });
await browser.close();
