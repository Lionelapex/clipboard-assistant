import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { launchWithExtension, openPopupFor } from './helpers';

/**
 * Live end-to-end pass over the Allow Copy + playground (the benchmark named in the brief).
 *
 * Every editable control on the page is focused, then the extension's own popup is used to
 * insert text — so this measures the real extension against the real page, not a DOM script.
 * Opt in with ALLCOPY_LIVE=1.
 */
const URL = 'https://allowcopyplus.pidevex.com/force-paste#try';
const TEXT = 'Hello 123 Привет';
const PHONE = '2025550143';
/** The page's own sample for the "A field that wants real typing" card — filling it unlocks the boss reward. */
const BOSS_TEXT = 'Force Paste works! Привет · 世界 👍';

interface FieldReport {
  index: number;
  tag: string;
  placeholder: string;
  sample: string;
  status: string;
  value: string;
  verified: boolean;
}

test.describe('Live: Allow Copy + boss level', () => {
  test.beforeEach(() => {
    test.skip(process.env.ALLCOPY_LIVE !== '1', 'Set ALLCOPY_LIVE=1 to run against the public playground.');
  });

  test('the extension fills every real field, including typing-only and masked ones', async () => {
    test.setTimeout(180_000);
    const session = await launchWithExtension();
    const report: FieldReport[] = [];

    try {
      const page = await session.context.newPage();
      const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      expect(response?.status() ?? 500).toBeLessThan(400);
      await page.waitForTimeout(1500);
      await page.waitForFunction(
        () => Boolean(document.getElementById('clipboard-assistant-host')?.shadowRoot),
        undefined,
        { timeout: 20_000 },
      );

      // Some editors mount lazily; walk the page once so every field exists before collection.
      await page.evaluate(async () => {
        const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);

      // Collect the editable controls (checkboxes and the fake div are handled separately).
      const handles = await page.$$(
        'input:not([type="checkbox"]):not([type="hidden"]), textarea, [contenteditable="true"]',
      );

      for (let index = 0; index < handles.length; index += 1) {
        const handle = handles[index];
        const meta = await handle.evaluate((el) => ({
          tag: el.tagName.toLowerCase(),
          placeholder: (el as HTMLInputElement).placeholder ?? '',
        }));
        const sample = meta.placeholder === 'Typing only'
          ? BOSS_TEXT
          : meta.placeholder.includes('+1 (')
            ? PHONE
            : TEXT;

        await handle.evaluate((el) => {
          el.scrollIntoView({ block: 'center' });
          (el as HTMLElement).focus();
        });
        await page.bringToFront();

        const popup = await openPopupFor(session.context, session.extensionId, URL);
        await popup.evaluate(async (value) => navigator.clipboard.writeText(value), sample);
        await popup.getByTestId('popup-refresh').click();
        await expect(popup.getByTestId('popup-preview')).toContainText(sample.slice(0, 5));
        await popup.getByTestId('popup-paste').click();
        // Wait for the paste result itself; auto-refresh may show an informational status first.
        await expect(popup.getByTestId('popup-status')).toContainText(
          /verified|could not|not supported|no field|rejected|read-only|disabled/i,
          { timeout: 30_000 },
        );
        const status = (await popup.getByTestId('popup-status').innerText()).replace(/\s+/g, ' ').trim();
        const value = await handle.evaluate((el) => {
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
          return (el as HTMLElement).innerText;
        });
        report.push({
          index,
          tag: meta.tag,
          placeholder: meta.placeholder,
          sample,
          status,
          value: value.slice(0, 80),
          verified: /verified/i.test(status),
        });
        await popup.close();
      }

      // Same-origin embedded widget: focus its textarea, then paste through the popup.
      const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
      if (frame) {
        const inner = frame.locator('textarea, input').first();
        await inner.click();
        await page.bringToFront();
        const popup = await openPopupFor(session.context, session.extensionId, URL);
        await popup.evaluate(async (value) => navigator.clipboard.writeText(value), 'Inside the widget');
        await popup.getByTestId('popup-refresh').click();
        await expect(popup.getByTestId('popup-preview')).toContainText('Inside');
        await popup.getByTestId('popup-paste').click();
        await expect(popup.getByTestId('popup-status')).not.toContainText('Clipboard read', { timeout: 30_000 });
        const status = (await popup.getByTestId('popup-status').innerText()).replace(/\s+/g, ' ').trim();
        report.push({
          index: report.length,
          tag: 'iframe-textarea',
          placeholder: 'Embedded widget',
          sample: 'Inside the widget',
          status,
          value: (await inner.inputValue()).slice(0, 80),
          verified: /verified/i.test(status),
        });
        await popup.close();
      }

      // The fake field is a trap by design: it must be refused, not silently "filled".
      const fake = page.locator('div[role="textbox"]:not([contenteditable])').first();
      if (await fake.count()) {
        await fake.click();
        await page.bringToFront();
        const popup = await openPopupFor(session.context, session.extensionId, URL);
        await popup.evaluate(async (value) => navigator.clipboard.writeText(value), TEXT);
        await popup.getByTestId('popup-refresh').click();
        await popup.getByTestId('popup-paste').click();
        await expect(popup.getByTestId('popup-status')).toContainText(/not supported|only draws text/i, {
          timeout: 30_000,
        });
        const status = (await popup.getByTestId('popup-status').innerText()).replace(/\s+/g, ' ').trim();
        report.push({
          index: report.length,
          tag: 'div[role=textbox]',
          placeholder: 'A fake field',
          sample: TEXT,
          status,
          value: (await fake.innerText()).slice(0, 80),
          verified: false,
        });
        await popup.close();
      }

      const outDir = path.join(process.cwd(), 'test-results');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'allowcopyplus-live.json'), JSON.stringify(report, null, 2));

      // The typing-only field must be reported as typed, and the masked phone as verified.
      const typing = report.find((entry) => entry.placeholder === 'Typing only');
      expect(typing?.verified, 'the typing-only field should verify').toBeTruthy();
      expect(typing?.status).toMatch(/typed/i);

      const phone = report.find((entry) => entry.placeholder.includes('+1 ('));
      expect(phone?.verified, 'the masked phone field should verify').toBeTruthy();
      expect(phone?.value).toContain('202');

      const fakeReport = report.find((entry) => entry.placeholder === 'A fake field');
      expect(fakeReport?.status, 'the fake field should be refused with a precise reason').toMatch(/only draws text/i);

      const failures = report.filter((entry) => !entry.verified && entry.placeholder !== 'A fake field');
      expect(failures, `unverified fields: ${JSON.stringify(failures)}`).toHaveLength(0);

      // Filling both Type-it cards unlocks the page's own boss reward.
      await page.bringToFront();
      await expect(page.getByText('You beat the boss level!')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('iframe[title="You beat the boss level"]')).toHaveCount(1);

      await page.bringToFront();
      await page.getByText('You beat the boss level!').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, 'allowcopyplus-live.png'), fullPage: false });
    } finally {
      await session.dispose();
    }
  });
});
