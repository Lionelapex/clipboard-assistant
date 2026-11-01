import { test, expect } from '@playwright/test';
import { MOCK_ORIGIN } from '../configuration/extension.config';
import {
  ensurePanel,
  findTargetTabId,
  launchWithExtension,
  openMockSite,
  openPopup,
  readClipboard,
  setRestrictionConfig,
  writeClipboard,
  type ExtensionSession,
} from './helpers';

let session: ExtensionSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  session = await launchWithExtension();
});

test.afterAll(async () => {
  await session?.dispose();
});

async function waitForContentScript(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const host = document.getElementById('clipboard-assistant-host');
    return Boolean(host && host.shadowRoot);
  });
}

test.describe('Clipboard Assistant extension', () => {
  test('loads as an unpacked extension and serves its popup', async () => {
    const page = await session.context.newPage();
    await page.goto(`chrome-extension://${session.extensionId}/popup.html`);
    await expect(page.getByRole('heading', { name: 'Clipboard Assistant' })).toBeVisible();
    await expect(page.getByTestId('popup-preview')).toBeVisible();
    await page.close();
  });

  test('reads the clipboard, inserts into the active field and verifies the result', async () => {
    const page = await openMockSite(session.context);
    await waitForContentScript(page);
    await setRestrictionConfig(page, 'E');

    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Clipboard Assistant', { exact: true })).toBeVisible();

    const field = page.getByTestId('field-approach-and-activities');
    await field.click();
    await page.keyboard.type('Existing note. ');

    const snippet = 'Copied paragraph one.\n\nCopied paragraph two with more detail.';
    await writeClipboard(page, 'clipboard-placeholder');
    await writeClipboard(page, snippet);

    await page.getByTestId('ca-refresh').click();
    await expect(page.getByTestId('ca-preview')).toContainText('Copied paragraph one.');
    await expect(page.getByTestId('ca-active-field')).toContainText('Approach and activities');

    await page.getByTestId('ca-paste').click();
    const status = page.getByTestId('ca-status');
    await expect(status).toHaveAttribute('data-status-kind', 'success');
    await expect(status).toContainText('Inserted and verified');

    const value = await field.inputValue();
    expect(value).toBe(`Existing note. ${snippet}`);

    // Paragraph breaks survived, and the site's React state (counter) accepted the value.
    expect(value).toContain('Copied paragraph one.\n\nCopied paragraph two');
    const expectedLength = value.length;
    await expect(page.getByTestId('counter-approach-and-activities')).toContainText(
      `${expectedLength.toLocaleString('en-GB')} / 4,000`,
    );

    // The extension's history picked up the clipboard read.
    await expect(page.getByTestId('ca-history-item').first()).toContainText('Copied paragraph one');

    // Copy puts the panel's content back on the system clipboard.
    await page.getByTestId('ca-copy').click();
    await expect(page.getByTestId('ca-status')).toContainText('Copied to clipboard');
    expect(await readClipboard(page)).toContain('Copied paragraph one.');

    // Clipboard restrictions are still in force for ordinary paste.
    await writeClipboard(page, 'BLOCKED_PASTE');
    await field.click();
    await page.keyboard.press('Control+V');
    await expect(field).toHaveValue(value);

    await page.getByTestId('test-controls-toggle').click();
    await expect(
      page.getByTestId('event-log').locator('[data-event-type="paste"][data-event-blocked="true"]').first(),
    ).toBeVisible();
  });

  test('inserts into a second field without disturbing the first', async () => {
    const page = await openMockSite(session.context);
    await waitForContentScript(page);
    await setRestrictionConfig(page, 'B');

    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();

    const first = page.getByTestId('field-project-summary');
    await first.click();
    await page.keyboard.type('First field stays put.');
    const firstValue = await first.inputValue();

    const second = page.getByTestId('field-statement-of-need');
    await second.click();
    await page.keyboard.type('Second field content. ');

    await writeClipboard(page, 'Inserted into field two.');
    await page.getByTestId('ca-refresh').click();
    await page.getByTestId('ca-paste').click();

    await expect(second).toHaveValue('Second field content. Inserted into field two.');
    await expect(first).toHaveValue(firstValue);
    await expect(page.getByTestId('ca-active-field')).toContainText('Statement of need');
  });

  test('inserts at the caret and preserves surrounding content', async () => {
    const page = await openMockSite(session.context);
    await waitForContentScript(page);
    await setRestrictionConfig(page, 'A');

    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();

    const field = page.getByTestId('field-outcomes-and-measurement');
    await field.fill('AAA BBB');
    await field.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(4, 4);
    });

    await writeClipboard(page, 'XXX ');
    await page.getByTestId('ca-refresh').click();
    await page.getByTestId('ca-paste').click();

    await expect(field).toHaveValue('AAA XXX BBB');
  });

  test('supports inputs, textareas, contenteditable and large snippets', async () => {
    const page = await session.context.newPage();
    await page.goto(`${MOCK_ORIGIN}/integration-harness.html`);
    await waitForContentScript(page);

    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();

    const text = 'Alpha line\n\nBeta paragraph';
    await writeClipboard(page, text);

    const input = page.locator('#single-input');
    await page.getByTestId('ca-refresh').click();
    await input.click();
    await page.getByTestId('ca-paste').click();
    // A single-line input cannot hold line breaks: the extension joins lines with spaces.
    await expect(input).toHaveValue('Alpha line Beta paragraph');

    const textarea = page.locator('#multi-textarea');
    await textarea.click();
    await page.getByTestId('ca-paste').click();
    await expect(textarea).toHaveValue(text);

    const editor = page.locator('#rich-editor');
    await editor.click();
    await page.getByTestId('ca-paste').click();
    await expect(page.getByTestId('ca-status')).toHaveAttribute('data-status-kind', 'success');
    const editorText = await editor.innerText();
    expect(editorText).toContain('Alpha line');
    expect(editorText).toContain('Beta paragraph');

    // Large snippet: ~9k characters, no maxlength on the harness textarea.
    const large = Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}. ${'Text continues here. '.repeat(12)}`).join('\n\n');
    await writeClipboard(page, large);
    await textarea.fill('');
    await page.getByTestId('ca-refresh').click();
    await textarea.click();
    await page.getByTestId('ca-paste').click();
    await expect(textarea).toHaveValue(large);
  });

  test('panel drags, minimises, restores and manages history', async () => {
    const page = await openMockSite(session.context);
    await waitForContentScript(page);
    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();

    const before = await panel.boundingBox();
    expect(before).not.toBeNull();
    if (before) {
      await page.mouse.move(before.x + 110, before.y + 18);
      await page.mouse.down();
      await page.mouse.move(before.x + 30, before.y + 110, { steps: 8 });
      await page.mouse.up();
    }
    const after = await panel.boundingBox();
    expect(after).not.toBeNull();
    if (before && after) {
      expect(Math.abs(after.x - before.x)).toBeGreaterThan(30);
      expect(Math.abs(after.y - before.y)).toBeGreaterThan(30);
    }

    await page.getByTestId('ca-minimise').click();
    await expect(page.getByTestId('ca-panel')).toHaveCount(0);
    await expect(page.getByTestId('ca-panel-minimised')).toBeVisible();
    await page
      .getByTestId('ca-panel-minimised')
      .getByRole('button', { name: 'Clipboard Assistant', exact: true })
      .click();
    await expect(page.getByTestId('ca-panel')).toBeVisible();

    await writeClipboard(page, 'History entry one');
    await page.getByTestId('ca-refresh').click();
    await writeClipboard(page, 'History entry two');
    await page.getByTestId('ca-refresh').click();

    const items = page.getByTestId('ca-history-item');
    await expect(items.first()).toContainText('History entry two');
    await expect(items.first()).toContainText(/\d{2}:\d{2}:\d{2}/);
    const countBefore = await items.count();
    expect(countBefore).toBeGreaterThanOrEqual(2);

    await page.getByTestId('ca-history-delete').first().click();
    await expect(items).toHaveCount(countBefore - 1);

    await page
      .getByTestId('ca-history-item')
      .filter({ hasText: 'History entry one' })
      .first()
      .click();
    await expect(page.getByTestId('ca-status')).toContainText('Snippet selected');
    await expect(page.getByTestId('ca-preview')).toContainText('History entry one');

    await page.getByTestId('ca-clear-history').click();
    await expect(items).toHaveCount(0);

    await page.getByTestId('ca-clear-clipboard').click();
    await expect(page.getByTestId('ca-preview')).toContainText('Clipboard is empty');
    expect(await readClipboard(page)).toBe('');

    await page.getByTestId('ca-close').click();
    await expect(page.getByTestId('ca-panel')).toHaveCount(0);
    await expect(page.getByTestId('ca-launcher')).toBeVisible();
  });

  test('keeps the latest ten snippets in history', async () => {
    const page = await openMockSite(session.context);
    await waitForContentScript(page);
    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();

    const items = page.getByTestId('ca-history-item');
    const clearAll = page.getByTestId('ca-clear-history');
    if (await clearAll.isVisible().catch(() => false)) {
      await clearAll.click();
      await expect(items).toHaveCount(0);
    }

    for (let index = 0; index < 12; index += 1) {
      await writeClipboard(page, `Snippet number ${index + 1}`);
      await page.getByTestId('ca-refresh').click();
      // Wait for that read to land before the next one, so overlapping refreshes cannot
      // reorder the history.
      await expect(page.getByTestId('ca-preview')).toContainText(`Snippet number ${index + 1}`);
    }

    await expect(items).toHaveCount(10);
    await expect(panel.getByText('(10/10)')).toBeVisible();
    await expect(items.first()).toContainText('Snippet number 12');
    await expect(items.last()).toContainText('Snippet number 3');
  });

  test('reports an error when no answer field has been focused', async () => {
    const page = await openMockSite(session.context);
    await waitForContentScript(page);
    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('ca-active-field')).toHaveText('No field focused');

    await writeClipboard(page, 'No target field');
    await page.getByTestId('ca-refresh').click();
    await expect(page.getByTestId('ca-preview')).toContainText('No target field');
    await page.getByTestId('ca-paste').click();

    const status = page.getByTestId('ca-status');
    await expect(status).toHaveAttribute('data-status-kind', 'error');
    await expect(status).toContainText('No active field');
  });

  test('popup Paste inserts into the last focused field', async () => {
    const marker = 'popup-paste-1';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);

    const field = page.getByTestId('field-project-summary');
    await field.click();
    await page.keyboard.type('Popup prefix. ');

    const popup = await openPopup(session.context, session.extensionId);
    const tabId = await findTargetTabId(popup, `${MOCK_ORIGIN}/?case=${marker}`);
    await popup.goto(`chrome-extension://${session.extensionId}/popup.html?tab=${tabId}`);
    await popup.bringToFront();

    await popup.evaluate(() => navigator.clipboard.writeText('Pasted from the toolbar popup.\n\nSecond paragraph.'));
    await popup.getByTestId('popup-refresh').click();
    await expect(popup.getByTestId('popup-preview')).toContainText('Pasted from the toolbar popup.');
    await expect(popup.getByTestId('popup-target-field')).toContainText('Project summary');

    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toHaveAttribute('data-status-kind', 'success');
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');

    await expect(field).toHaveValue('Popup prefix. Pasted from the toolbar popup.\n\nSecond paragraph.');
  });

  test('popup Paste targets whichever field was focused most recently', async () => {
    const marker = 'popup-paste-2';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);

    const first = page.getByTestId('field-project-summary');
    const second = page.getByTestId('field-statement-of-need');

    await first.click();
    await page.keyboard.type('First field keeps. ');
    await page.bringToFront();
    await second.click();
    await page.keyboard.type('Second field gets. ');

    const popup = await openPopup(session.context, session.extensionId);
    const tabId = await findTargetTabId(popup, `${MOCK_ORIGIN}/?case=${marker}`);
    await popup.goto(`chrome-extension://${session.extensionId}/popup.html?tab=${tabId}`);
    await popup.evaluate(() => navigator.clipboard.writeText('ADDED'));
    await popup.getByTestId('popup-refresh').click();
    await popup.getByTestId('popup-paste').click();

    await expect(second).toHaveValue('Second field gets. ADDED');
    await expect(first).toHaveValue('First field keeps. ');
    await expect(popup.getByTestId('popup-target-field')).toContainText('Statement of need');
  });

  test('popup explains when no field has been focused yet', async () => {
    const marker = 'popup-no-field';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);

    const popup = await openPopup(session.context, session.extensionId);
    const tabId = await findTargetTabId(popup, `${MOCK_ORIGIN}/?case=${marker}`);
    await popup.goto(`chrome-extension://${session.extensionId}/popup.html?tab=${tabId}`);

    await expect(popup.getByTestId('popup-target-field')).toHaveText('No field selected');
    await popup.evaluate(() => navigator.clipboard.writeText('No target'));
    await popup.getByTestId('popup-refresh').click();
    await popup.getByTestId('popup-paste').click();

    await expect(popup.getByTestId('popup-status')).toHaveAttribute('data-status-kind', 'error');
    await expect(popup.getByTestId('popup-status')).toContainText('No field selected');
  });

  test('popup Copy and Clear act on the stored content', async () => {
    const marker = 'popup-copy-clear';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);

    const popup = await openPopup(session.context, session.extensionId);
    const tabId = await findTargetTabId(popup, `${MOCK_ORIGIN}/?case=${marker}`);
    await popup.goto(`chrome-extension://${session.extensionId}/popup.html?tab=${tabId}`);

    await popup.evaluate(() => navigator.clipboard.writeText('Copy me.'));
    await popup.getByTestId('popup-refresh').click();
    await expect(popup.getByTestId('popup-preview')).toContainText('Copy me.');

    // Clearing the system clipboard must not disturb the stored snippet, and the automatic
    // refresh ignores empty clipboard reads.
    await popup.evaluate(() => navigator.clipboard.writeText(''));
    await popup.getByTestId('popup-copy').click();
    await expect
      .poll(() => popup.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 })
      .toBe('Copy me.');

    await popup.getByTestId('popup-clear').click();
    await expect(popup.getByTestId('popup-preview')).toContainText('Clipboard is empty');
    await expect
      .poll(() => popup.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 })
      .toBe('');
  });
});
