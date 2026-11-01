import { test, expect, type Page } from '@playwright/test';
import { MOCK_ORIGIN } from '../configuration/extension.config';
import {
  ensurePanel,
  launchWithExtension,
  messageContentTab,
  openMockSite,
  openPopupFor,
  writeClipboard,
  type ExtensionSession,
} from './helpers';

/**
 * Automatic clipboard refresh: the assistant must pick up a new copy without the user
 * pressing Refresh — when it opens, and while it stays open.
 */
let session: ExtensionSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  session = await launchWithExtension();
});

test.afterAll(async () => {
  await session?.dispose();
});

async function waitForContentScript(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const host = document.getElementById('clipboard-assistant-host');
    return Boolean(host && host.shadowRoot);
  });
}

test.describe('Automatic clipboard refresh', () => {
  test('the open panel picks up a new copy without pressing Refresh', async () => {
    const marker = 'auto-panel';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);
    const panel = await ensurePanel(page);

    await expect(panel).toBeVisible();
    await writeClipboard(page, `Fresh copy ${marker}`);

    await expect(page.getByTestId('ca-preview')).toContainText(`Fresh copy ${marker}`, {
      timeout: 6000,
    });
    await expect(page.getByTestId('ca-history-item').first()).toContainText(`Fresh copy ${marker}`);
    // The status tells the user it happened on its own.
    await expect(page.getByTestId('ca-status')).toContainText(/Clipboard updated|Clipboard read/i);
  });

  test('the panel updates again when the clipboard changes while it stays open', async () => {
    const marker = 'auto-panel-again';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);
    const panel = await ensurePanel(page);
    await expect(panel).toBeVisible();

    await writeClipboard(page, `First value ${marker}`);
    await expect(page.getByTestId('ca-preview')).toContainText(`First value ${marker}`, { timeout: 6000 });

    await writeClipboard(page, `Second value ${marker}`);
    await expect(page.getByTestId('ca-preview')).toContainText(`Second value ${marker}`, { timeout: 6000 });
  });

  test('the popup picks up a new copy while it is open', async () => {
    const marker = 'auto-popup';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);

    const popup = await openPopupFor(session.context, session.extensionId, `${MOCK_ORIGIN}/?case=${marker}`);
    await expect(popup.getByTestId('popup-preview')).toBeVisible();

    await writeClipboard(page, `Popup fresh ${marker}`);
    await expect(popup.getByTestId('popup-preview')).toContainText(`Popup fresh ${marker}`, {
      timeout: 6000,
    });
    const stored = await popup.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).chrome;
      const data = await api.storage.local.get('clipboardCurrent');
      return (data.clipboardCurrent?.text as string | undefined) ?? '';
    });
    expect(stored).toContain(`Popup fresh ${marker}`);
  });

  test('an automatic refresh never replaces a captured selection with the stale clipboard', async () => {
    const marker = 'auto-capture';
    const page = await openMockSite(session.context, marker);
    await waitForContentScript(page);

    // The clipboard holds an old value; the capture shortcut stores a different selection.
    await writeClipboard(page, `Stale clipboard ${marker}`);
    const field = page.locator('textarea').first();
    await field.click();
    await page.keyboard.type(`Captured text ${marker}`);
    await page.keyboard.press('Control+A');

    const popup = await openPopupFor(session.context, session.extensionId, `${MOCK_ORIGIN}/?case=${marker}`);
    const captured = (await messageContentTab(popup, { type: 'ca:capture-selection' })) as {
      ok: boolean;
      chars?: number;
    };
    expect(captured.ok).toBe(true);

    await expect(page.getByTestId('ca-preview')).toContainText(`Captured text ${marker}`, { timeout: 6000 });
    // Several polling ticks later the captured text must still be there.
    await page.waitForTimeout(3500);
    await expect(page.getByTestId('ca-preview')).toContainText(`Captured text ${marker}`);
    await expect(page.getByTestId('ca-preview')).not.toContainText(`Stale clipboard ${marker}`);
  });
});
