import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const extensionDir = path.resolve('..', 'extension', 'dist');
const outDir = path.resolve('screenshots');
fs.mkdirSync(outDir, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-shots-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1440, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'],
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--enable-unsafe-extension-debugging'],
});

const cdp = await context.browser().newBrowserCDPSession();
const installed = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
await cdp.detach();
const extensionId = installed.id;

const page = await context.newPage();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(document.getElementById('clipboard-assistant-host')?.shadowRoot));

await page.screenshot({ path: path.join(outDir, 'mock-desktop.png'), fullPage: true });

await page.getByTestId('test-controls-toggle').click();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'mock-test-controls.png') });
await page.getByTestId('test-controls-toggle').click();

// The panel now starts as a launcher bubble; open it for the panel screenshots.
if (await page.getByTestId('ca-launcher').isVisible().catch(() => false)) {
  await page.getByTestId('ca-launcher').click();
  await page.waitForTimeout(300);
}

await page.evaluate(() => navigator.clipboard.writeText('We are applying to extend our weekend youth club into the north of the borough, opening a second venue for 60 young people aged 11–16.\n\nSessions will run every Tuesday and Thursday during term time.'));
await page.getByTestId('ca-refresh').click();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'panel-clipboard.png') });

const field = page.getByTestId('field-project-summary');
await field.click();
await page.keyboard.type('Draft summary: ');
await page.getByTestId('ca-paste').click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, 'panel-inserted.png') });

// Popup screenshot: focus a field first, then point the popup at the mock-site tab.
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`);
const tabId = await popup.evaluate(async (origin) => {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => tab.url && tab.url.startsWith(origin))?.id ?? null;
}, 'http://127.0.0.1:5173');
await popup.goto(`chrome-extension://${extensionId}/popup.html${tabId ? `?tab=${tabId}` : ''}`);
await popup.bringToFront();
await popup.evaluate(() =>
  navigator.clipboard.writeText(
    'We are applying to extend our weekend youth club into the north of the borough, opening a second venue for 60 young people aged 11–16.\n\nSessions will run every Tuesday and Thursday during term time.',
  ),
);
await popup.getByTestId('popup-refresh').click();
await popup.waitForTimeout(400);
await popup.screenshot({ path: path.join(outDir, 'popup.png') });
await popup.close();

await page.bringToFront();
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, 'mock-mobile.png'), fullPage: false });

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log('screenshots written to', outDir);
