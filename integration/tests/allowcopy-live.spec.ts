import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { launchWithExtension, messageContentTab, openPopupFor } from './helpers';

/**
 * Live inspection of the benchmark site named in the brief.
 *
 * allowcopy.com is checked at run time rather than assumed: the site is a technology
 * publication today, and its own "allow copy" tool page states the tool is retired. This
 * test records what the extension actually does there, so the compatibility report never
 * claims a playground result that cannot be reproduced.
 *
 * Opt in with ALLOWCOPY_LIVE=1 (needs network access).
 */
const TARGET = 'https://allowcopy.com/tools/allow-copy/';

test.describe('Live site: allowcopy.com', () => {
  test.beforeEach(() => {
    test.skip(process.env.ALLCOPY_LIVE !== '1', 'Set ALLCOPY_LIVE=1 to run the live public-site check.');
  });

  test('extension injects on a public site, captures text and reports the absence of fields', async () => {
    test.setTimeout(120_000);
    const session = await launchWithExtension();
    try {
      const page = await session.context.newPage();
      const response = await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      expect(response?.status(), 'allowcopy.com should answer with a successful status').toBeLessThan(400);
      await page.waitForLoadState('load').catch(() => undefined);

      // Content script is injected on any http(s) page, with no site registration.
      await expect(page.locator('#clipboard-assistant-host')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.getByTestId('ca-launcher')).toBeVisible();

      // The page really is an article, not a playground: no editable controls at all.
      const editableCount = await page.evaluate(
        () =>
          document.querySelectorAll(
            'input:not([type="hidden"]), textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
          ).length,
      );
      expect(editableCount, 'allowcopy.com offers no input fields to paste into').toBe(0);

      // Select the longest article paragraph the way a reader would and capture it by shortcut.
      const selected = await page.evaluate(() => {
        const paragraphs = Array.from(document.querySelectorAll('article p, main p, p')).filter(
          (node) => (node.textContent ?? '').trim().length > 0,
        );
        const paragraph = paragraphs.sort(
          (a, b) => (b.textContent ?? '').length - (a.textContent ?? '').length,
        )[0];
        if (!paragraph) return 0;
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return selection?.toString().trim().length ?? 0;
      });
      expect(selected, 'the article exposes selectable text').toBeGreaterThan(100);

      const urlPrefix = TARGET;
      const popup = await openPopupFor(session.context, session.extensionId, urlPrefix);
      const captured = (await messageContentTab(popup, { type: 'ca:capture-selection' })) as {
        ok: boolean;
        chars?: number;
      };
      expect(captured.ok).toBe(true);
      expect(captured.chars ?? 0).toBeGreaterThan(40);

      // The popup was already open, so the capture must reach it through storage events.
      await expect(popup.getByTestId('popup-preview')).not.toContainText('Clipboard is empty');

      // The shortcut flashes the floating panel with the captured text.
      await expect(page.getByTestId('ca-panel')).toBeVisible();
      await expect(page.getByTestId('ca-panel')).not.toContainText('Nothing captured');

      // With no field on the page, Paste must refuse with a precise diagnostic.
      await expect(popup.getByTestId('popup-target-field')).toContainText('No field selected');
      await popup.getByTestId('popup-paste').click();
      await expect(popup.getByTestId('popup-status')).toContainText(/No field selected/i);

      // Record the evidence next to the test run.
      const outDir = path.join(process.cwd(), 'test-results');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'allowcopy-live.json'),
        JSON.stringify(
          {
            url: TARGET,
            status: response?.status(),
            editableCount,
            selectedChars: selected,
            capturedChars: captured.chars ?? null,
            pasteDiagnostic: 'No field selected',
            checkedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      await page.bringToFront();
      await page.screenshot({ path: path.join(outDir, 'allowcopy-live.png'), fullPage: false });
    } finally {
      await session.dispose();
    }
  });
});
