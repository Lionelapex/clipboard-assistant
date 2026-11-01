import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from '../configuration/extension.config';
import {
  launchWithExtension,
  messageContentTab,
  openPopupFor,
  pasteViaPopup,
  type ExtensionSession,
} from './helpers';

/**
 * Rich-text round trips and the absence of any app-side length limit.
 * Everything is read back from the page, not trusted from a status message.
 */
const RICH_HTML =
  '<h2>Quarterly <strong>results</strong></h2><p>We <em>doubled</em> reach.</p><ul><li>One</li><li>Two</li></ul>';
const RICH_TEXT = 'Quarterly results\nWe doubled reach.\nOne\nTwo';

let session: ExtensionSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  session = await launchWithExtension();
});

test.afterAll(async () => {
  await session?.dispose();
});

function siteUrl(marker: string): string {
  return `${FIXTURE_ORIGIN}/site-rich/?case=${marker}`;
}

async function openRichSite(marker: string): Promise<Page> {
  const page = await session.context.newPage();
  await page.goto(siteUrl(marker), { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForFunction(() =>
    Boolean(document.getElementById('clipboard-assistant-host')?.shadowRoot),
  );
  return page;
}

async function writeRichClipboard(page: Page, html: string, text: string): Promise<void> {
  await page.evaluate(
    async ([richHtml, plainText]) => {
      const item = new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([richHtml], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
    },
    [html, text] as const,
  );
}

test.describe('Rich text and large content', () => {
  test('formatted clipboard content keeps its headings, bold text and list', async () => {
    const marker = 'rich-paste';
    const page = await openRichSite(marker);
    await writeRichClipboard(page, RICH_HTML, RICH_TEXT);

    const editor = page.locator('#editor');
    await editor.click();

    const popup = await openPopupFor(session.context, session.extensionId, siteUrl(marker));
    await popup.getByTestId('popup-refresh').click();
    await expect(popup.getByTestId('popup-preview')).toContainText('Quarterly');

    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText(/formatting|verified/i, {
      timeout: 30_000,
    });

    const html = await editor.innerHTML();
    expect(html).toContain('<h2>');
    expect(html).toMatch(/<strong>|font-weight:\s*700/);
    expect(html).toMatch(/<em>|font-style:\s*italic/);
    expect(html).toContain('<li>');
    await expect(editor).toContainText('Quarterly results');
  });

  test('script tags and event handlers in pasted HTML are removed', async () => {
    const marker = 'rich-sanitise';
    const page = await openRichSite(marker);
    const hostile =
      '<h3>Title</h3><p><strong>Safe</strong> text</p>' +
      '<script>window.__pwned = "script"</script>' +
      '<img src="x" onerror="window.__pwned = \'img\'">' +
      '<a href="javascript:window.__pwned=\'link\'">bad link</a>';
    await writeRichClipboard(page, hostile, 'Title\nSafe text\nbad link');

    const editor = page.locator('#editor');
    await editor.click();

    const popup = await openPopupFor(session.context, session.extensionId, siteUrl(marker));
    await popup.getByTestId('popup-refresh').click();
    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText(/formatting|verified/i, {
      timeout: 30_000,
    });

    const html = await editor.innerHTML();
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<strong>');
    const pwned = await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned);
    expect(pwned).toBeUndefined();
  });

  test('a 50,000 character paste is not truncated by the extension', async () => {
    const marker = 'large-paste';
    const page = await openRichSite(marker);
    const large = `${'A'.repeat(50_000)} end`;

    const field = page.locator('#plain');
    await field.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, siteUrl(marker), large);
    await expect(popup.getByTestId('popup-status')).toContainText('verified', { timeout: 30_000 });

    const value = await field.inputValue();
    expect(value.length).toBe(large.length);
    expect(value.endsWith(' end')).toBeTruthy();
  });

  test('the capture shortcut keeps formatted selection markup', async () => {
    const marker = 'rich-capture';
    const page = await openRichSite(marker);

    await page.evaluate(() => {
      const source = document.getElementById('source');
      if (!source) return;
      const range = document.createRange();
      range.selectNodeContents(source);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    const popup = await openPopupFor(session.context, session.extensionId, siteUrl(marker));
    const captured = (await messageContentTab(popup, { type: 'ca:capture-selection' })) as {
      ok: boolean;
      chars?: number;
    };
    expect(captured.ok).toBe(true);

    const storedHtml = await popup.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).chrome;
      const data = await api.storage.local.get('clipboardCurrent');
      return (data.clipboardCurrent?.html as string | undefined) ?? '';
    });
    expect(storedHtml).toContain('<strong>');
    expect(storedHtml).toContain('<li>');

    await page.bringToFront();
    const editor = page.locator('#editor');
    await editor.click();
    const inserted = (await messageContentTab(popup, { type: 'ca:insert-current' })) as {
      ok: boolean;
      strategy?: string;
    };
    expect(inserted.ok).toBe(true);
    expect(inserted.strategy).toBe('insert-html');

    const html = await editor.innerHTML();
    expect(html).toContain('<strong>');
    expect(html).toContain('<li>');
  });
});
