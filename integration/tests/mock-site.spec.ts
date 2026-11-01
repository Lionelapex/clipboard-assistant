import { test, expect, type Page } from '@playwright/test';

async function waitForMock(page: Page) {
  await page.waitForFunction(() => Boolean(window.__clipboardAssistantMock));
}

async function useConfig(page: Page, id: 'A' | 'B' | 'C' | 'D' | 'E') {
  await page.evaluate((config) => window.__clipboardAssistantMock?.setConfig(config), id);
  await expect
    .poll(async () => page.evaluate(() => window.__clipboardAssistantMock?.getConfig().configId))
    .toBe(id);
}

test.describe('Mock application site', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForMock(page);
  });

  test('defaults to Configuration E (copy, paste and cut blocked)', async ({ page }) => {
    const config = await page.evaluate(() => window.__clipboardAssistantMock?.getConfig());
    expect(config?.settings).toEqual({ copy: true, paste: true, cut: true });

    await page.getByTestId('test-controls-toggle').click();
    await expect(page.getByTestId('current-config')).toHaveText('E · Combined restrictions');
    await expect(page.getByTestId('chip-copy')).toHaveText('Copy blocked');
    await expect(page.getByTestId('chip-paste')).toHaveText('Paste blocked');
    await expect(page.getByTestId('chip-cut')).toHaveText('Cut blocked');
  });

  test('accepts ordinary typing, editing, caret movement and paragraph breaks', async ({ page }) => {
    const field = page.getByTestId('field-project-summary');

    await field.click();
    await field.pressSequentially('Hello', { delay: 10 });
    await expect(field).toHaveValue('Hello');

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    await expect(field).toHaveValue('Helo');

    await page.keyboard.press('Control+A');
    await page.keyboard.type('First paragraph');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second paragraph');
    await expect(field).toHaveValue('First paragraph\n\nSecond paragraph');

    await page.keyboard.press('Control+A');
    await page.keyboard.type('Replacement');
    await page.keyboard.press('Home');
    await page.keyboard.type('> ');
    await expect(field).toHaveValue('> Replacement');
  });

  test('updates the character counter and completion indicator', async ({ page }) => {
    const field = page.getByTestId('field-project-summary');
    const counter = page.getByTestId('counter-project-summary');
    const completion = page.getByTestId('completion-project-summary');

    await expect(completion).toHaveText('Not started');
    await expect(counter).toContainText('0 / 4,000');

    await field.fill('x'.repeat(120));
    await expect(completion).toHaveText('In progress');
    await expect(counter).toContainText('120 / 4,000');

    await field.fill('y'.repeat(250));
    await expect(completion).toHaveText('Complete');
  });

  test('enforces the selected clipboard configuration', async ({ page }) => {
    const field = page.getByTestId('field-project-summary');

    const cases = [
      { id: 'A', paste: false, copy: false, cut: false },
      { id: 'B', paste: true, copy: false, cut: false },
      { id: 'C', paste: false, copy: true, cut: false },
      { id: 'D', paste: true, copy: true, cut: false },
      { id: 'E', paste: true, copy: true, cut: true },
    ] as const;

    for (const scenario of cases) {
      await useConfig(page, scenario.id);

      // Paste
      await page.evaluate(() => navigator.clipboard.writeText('PASTE_SENTINEL'));
      await field.fill('');
      await field.click();
      await page.keyboard.press('Control+V');
      await expect(field, `config ${scenario.id}: paste`).toHaveValue(
        scenario.paste ? '' : 'PASTE_SENTINEL',
      );

      // Copy
      await page.evaluate(() => navigator.clipboard.writeText('BASELINE'));
      await field.fill('');
      await field.click();
      await page.keyboard.type('COPY_SENTINEL');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Control+C');
      const afterCopy = await page.evaluate(() => navigator.clipboard.readText());
      expect(afterCopy, `config ${scenario.id}: copy`).toBe(
        scenario.copy ? 'BASELINE' : 'COPY_SENTINEL',
      );

      // Cut
      await field.fill('');
      await field.click();
      await page.keyboard.type('CUT_SENTINEL');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Control+X');
      await expect(field, `config ${scenario.id}: cut`).toHaveValue(
        scenario.cut ? 'CUT_SENTINEL' : '',
      );
    }
  });

  test('logs blocked clipboard events', async ({ page }) => {
    await page.getByTestId('test-controls-toggle').click();
    const field = page.getByTestId('field-project-summary');
    await field.click();
    await page.keyboard.type('Log me');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+C');

    const log = page.getByTestId('event-log');
    const copyEntry = log.locator('[data-event-type="copy"][data-event-blocked="true"]').first();
    await expect(copyEntry).toBeVisible();
    await expect(copyEntry).toContainText('Project summary');
  });

  test('programmatic DOM updates bypass clipboard restrictions and reach React state', async ({ page }) => {
    await page.getByTestId('test-controls-toggle').click();
    const field = page.getByTestId('field-project-summary');
    await field.click();

    await page.getByTestId('programmatic-insert').click();
    await expect(page.getByTestId('programmatic-note')).toContainText('native value setter');
    await expect(field).toHaveValue(/Programmatic update/);
    await expect(page.getByTestId('counter-project-summary')).not.toContainText('0 / 4,000');

    const entry = page.getByTestId('event-log').locator('[data-event-type="programmatic-input"]').first();
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute('data-event-blocked', 'false');
  });

  test('validates incomplete sections on submit', async ({ page }) => {
    await page.getByTestId('submit-application').click();
    const summary = page.getByTestId('validation-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Project summary');
    await expect(summary).toContainText('Organisational capacity');
    await expect(page.getByTestId('submission-confirmation')).toHaveCount(0);
  });
});
