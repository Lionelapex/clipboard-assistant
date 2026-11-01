import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { EXTENSION_DIR, MOCK_ORIGIN } from '../configuration/extension.config';

export interface ExtensionSession {
  context: BrowserContext;
  extensionId: string;
  dispose: () => Promise<void>;
}

interface LoadUnpackedResult {
  id: string;
}

/**
 * Launches installed Chrome (channel: 'chrome') with the unpacked extension.
 *
 * Chrome 137+ removed the --load-extension / --disable-extensions-except switches, so the
 * extension is installed at runtime through the CDP Extensions.loadUnpacked command. That
 * command requires --enable-unsafe-extension-debugging and Chrome's debugging pipe, which
 * Playwright already uses. Using the installed browser avoids downloading a Playwright
 * browser runtime.
 */
export async function launchWithExtension(headless = true): Promise<ExtensionSession> {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Extension build not found at ${EXTENSION_DIR}. Run "npm run build" in extension/ first.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-assistant-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless,
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    // Playwright disables extensions by default; remove that switch so the CDP install sticks.
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check'],
  });

  const browser = context.browser();
  if (!browser) throw new Error('Persistent context did not expose a browser handle.');

  const cdp = await browser.newBrowserCDPSession();
  let extensionId: string;
  try {
    const result = (await cdp.send(
      'Extensions.loadUnpacked' as never,
      { path: EXTENSION_DIR } as never,
    )) as unknown as LoadUnpackedResult;
    extensionId = result.id;
  } finally {
    await cdp.detach().catch(() => undefined);
  }

  if (!extensionId) throw new Error('Extensions.loadUnpacked did not return an extension id.');

  return {
    context,
    extensionId,
    dispose: async () => {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

export async function openMockSite(context: BrowserContext, marker?: string): Promise<Page> {
  const page = await context.newPage();
  const url = marker ? `${MOCK_ORIGIN}/?case=${encodeURIComponent(marker)}` : MOCK_ORIGIN;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  return page;
}

/** Opens the floating panel through whatever state it is currently in. */
export async function ensurePanel(page: Page) {
  const panel = page.getByTestId('ca-panel');
  if (await panel.isVisible().catch(() => false)) return panel;

  const launcher = page.getByTestId('ca-launcher');
  if (await launcher.isVisible().catch(() => false)) {
    await launcher.click();
  } else {
    const minimised = page.getByTestId('ca-panel-minimised');
    if (await minimised.isVisible().catch(() => false)) {
      await minimised.getByRole('button', { name: 'Clipboard Assistant', exact: true }).click();
    }
  }

  return panel;
}

export async function writeClipboard(page: Page, text: string): Promise<void> {
  await page.evaluate(async (value) => {
    await navigator.clipboard.writeText(value);
  }, text);
}

export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

export async function setRestrictionConfig(page: Page, id: 'A' | 'B' | 'C' | 'D' | 'E'): Promise<void> {
  await page.evaluate((config) => {
    window.__clipboardAssistantMock?.setConfig(config);
  }, id);
}

/**
 * Opens the toolbar popup as a normal extension page. A real popup is rendered over the
 * active tab, so tests pass `?tab=<id>` (the override documented for popup testing) to
 * point it at the mock site tab instead of the popup's own tab.
 */
export async function openPopup(context: BrowserContext, extensionId: string, tabId?: number): Promise<Page> {
  const page = await context.newPage();
  const suffix = tabId ? `?tab=${tabId}` : '';
  await page.goto(`chrome-extension://${extensionId}/popup.html${suffix}`);
  return page;
}

/** Opens the popup pointed at the tab whose URL starts with `urlPrefix`. */
export async function openPopupFor(
  context: BrowserContext,
  extensionId: string,
  urlPrefix: string,
): Promise<Page> {
  const popup = await openPopup(context, extensionId);
  const tabId = await findTargetTabId(popup, urlPrefix);
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  return popup;
}

export async function findTargetTabId(popup: Page, urlPrefix: string): Promise<number> {
  const id = await popup.evaluate(async (targetPrefix) => {
    const api = (
      globalThis as unknown as {
        chrome?: {
          tabs?: {
            query: (query: Record<string, unknown>) => Promise<Array<{ id?: number; url?: string }>>;
          };
        };
      }
    ).chrome;
    const tabs = (await api?.tabs?.query({})) ?? [];
    return tabs.find((tab) => tab.url?.startsWith(targetPrefix))?.id ?? null;
  }, urlPrefix);

  if (typeof id !== 'number') throw new Error(`No browser tab found for ${urlPrefix}`);
  return id;
}

/** Pastes `text` through the popup UI into the targeted tab. Returns the popup page. */
export async function pasteViaPopup(
  context: BrowserContext,
  extensionId: string,
  urlPrefix: string,
  text: string,
): Promise<Page> {
  const popup = await openPopupFor(context, extensionId, urlPrefix);
  await popup.evaluate(async (value) => navigator.clipboard.writeText(value), text);
  await popup.getByTestId('popup-refresh').click();
  await expect(popup.getByTestId('popup-preview')).toContainText(text.split('\n')[0]);
  await popup.getByTestId('popup-paste').click();
  return popup;
}

/** Sends a message to the tab the popup targets (simulates a keyboard-command handler). */
export async function messageContentTab(popup: Page, message: Record<string, unknown>): Promise<unknown> {
  return popup.evaluate(async (payload) => {
    const api = (
      globalThis as unknown as {
        chrome: { tabs: { sendMessage: (id: number, msg: unknown) => Promise<unknown> } };
      }
    ).chrome;
    const id = Number(new URLSearchParams(location.search).get('tab'));
    return api.tabs.sendMessage(id, payload);
  }, message);
}
