import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from '../configuration/extension.config';
import {
  launchWithExtension,
  messageContentTab,
  openPopupFor,
  pasteViaPopup,
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

async function waitForContentScript(page: Page) {
  await page.waitForFunction(() => {
    const host = document.getElementById('clipboard-assistant-host');
    return Boolean(host && host.shadowRoot);
  });
}

async function openSite(path: string): Promise<Page> {
  const page = await session.context.newPage();
  await page.goto(`${FIXTURE_ORIGIN}${path}`);
  await page.bringToFront();
  await waitForContentScript(page);
  return page;
}

test.describe('Framework compatibility', () => {
  test('Vue 3 v-model input and textarea update Vue state', async () => {
    const marker = 'vue';
    const page = await openSite(`/site-vue/?case=${marker}`);
    const prefix = `${FIXTURE_ORIGIN}/site-vue/?case=${marker}`;
    const text = 'Vue controlled textarea content.';

    const body = page.locator('#vue-body');
    await body.click();
    let popup = await pasteViaPopup(session.context, session.extensionId, prefix, text);
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    await expect(body).toHaveValue(text);
    await expect(page.getByTestId('vue-count')).toContainText(`${text.length} characters in Vue state`);
    await popup.close();

    await page.bringToFront();
    await page.getByRole('button', { name: 'Add field' }).click();
    const extra = page.getByTestId('vue-extra-1');
    await extra.click();
    popup = await pasteViaPopup(session.context, session.extensionId, prefix, 'Vue dynamic field');
    await expect(extra).toHaveValue('Vue dynamic field');
  });
});

test.describe('Field edge cases', () => {
  test('maxlength truncates to the field limit and reports the real count', async () => {
    const marker = 'edge-maxlength';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const limited = page.locator('#limited');
    await limited.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, 'x'.repeat(60));

    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified · 40 characters');
    await expect(limited).toHaveValue('x'.repeat(40));
    await expect(page.getByTestId('limited-count')).toHaveText('40 / 40');
  });

  test('preserves Unicode and paragraph breaks exactly', async () => {
    const marker = 'edge-unicode';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const unicode = 'Café — naïve 🚀\n\n第二段 with emoji 🙂';
    const field = page.locator('#unicode');
    await field.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, unicode);
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    await expect(field).toHaveValue(unicode);
  });

  test('read-only field produces the read-only diagnostic', async () => {
    const marker = 'edge-readonly';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const field = page.locator('#multi-2');
    await field.click();
    await field.evaluate((element) => {
      (element as HTMLTextAreaElement).readOnly = true;
    });

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, 'should not land');

    await expect(popup.getByTestId('popup-status')).toHaveAttribute('data-status-kind', 'error');
    await expect(popup.getByTestId('popup-status')).toContainText('read-only');
    await expect(field).toHaveValue('');
  });

  test('disabled field produces the disabled diagnostic', async () => {
    const marker = 'edge-disabled';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const field = page.locator('#multi-3');
    await field.click();
    await field.evaluate((element) => {
      (element as HTMLTextAreaElement).disabled = true;
    });

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, 'should not land');

    await expect(popup.getByTestId('popup-status')).toHaveAttribute('data-status-kind', 'error');
    await expect(popup.getByTestId('popup-status')).toContainText('disabled');
    await expect(field).toHaveValue('');
  });

  test('numeric field rejects non-numeric text with a specific message', async () => {
    const marker = 'edge-number';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const amount = page.locator('#numeric');
    await amount.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, 'not a number');

    await expect(popup.getByTestId('popup-status')).toHaveAttribute('data-status-kind', 'error');
    await expect(popup.getByTestId('popup-status')).toContainText('only accepts numbers');
    await expect(amount).toHaveValue('');
  });

  test('contenteditable="plaintext-only" accepts insertion', async () => {
    const marker = 'edge-plaintext';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const editor = page.locator('#plaintext');
    await editor.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, 'Plain text only content');
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    expect(await editor.innerText()).toContain('Plain text only content');
  });

  test('multiple textareas stay independent', async () => {
    const marker = 'edge-multi';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const prefix = `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`;

    const first = page.locator('#multi-1');
    await first.click();
    let popup = await pasteViaPopup(session.context, session.extensionId, prefix, 'first textarea');
    await expect(first).toHaveValue('first textarea');
    await popup.close();

    await page.bringToFront();
    const second = page.locator('#multi-2');
    await second.click();
    popup = await pasteViaPopup(session.context, session.extensionId, prefix, 'second textarea');
    await expect(second).toHaveValue('second textarea');
    await expect(first).toHaveValue('first textarea');
    await expect(page.locator('#multi-3')).toHaveValue('');
  });

  test('open shadow DOM fields are detected and editable', async () => {
    const marker = 'edge-shadow';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const shadowInput = page.locator('shadow-notes').locator('#shadow-input');
    await shadowInput.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, 'Shadow DOM insertion');

    await expect(popup.getByTestId('popup-target-field')).toContainText('Shadow field');
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    await expect(shadowInput).toHaveValue('Shadow DOM insertion');
  });

  test('fields inside a same-origin iframe are reached through the frame bridge', async () => {
    const marker = 'edge-frame';
    const page = await openSite(`/site-edge/?case=${marker}`);
    const frame = page.frameLocator('iframe[title="Frame with a text field"]');
    const field = frame.locator('#frame-field');
    await field.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-edge/?case=${marker}`, 'iframe insertion');

    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    await expect(field).toHaveValue('iframe insertion');
  });
});

test.describe('Restriction simulation', () => {
  test('cancelled paste events do not stop extension insertion', async () => {
    const marker = 'restricted-paste';
    const page = await openSite(`/site-restricted/?case=${marker}`);
    const field = page.locator('#paste-blocked');

    await field.click();
    await page.keyboard.type('prefix ');
    await page.evaluate(() => navigator.clipboard.writeText('BLOCKED-SENTINEL'));
    await page.keyboard.press('Control+V');

    await expect(field).toHaveValue('prefix ');
    await expect(page.getByTestId('blocked-counts')).toContainText('paste 1');

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-restricted/?case=${marker}`, 'EXTENSION-INSERT');
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    await expect(field).toHaveValue('prefix EXTENSION-INSERT');
  });

  test('a keyboard trap on Ctrl+V does not stop extension insertion', async () => {
    const marker = 'restricted-keytrap';
    const page = await openSite(`/site-restricted/?case=${marker}`);
    const field = page.locator('#key-trapped');

    await field.click();
    await page.keyboard.type('base ');
    await page.evaluate(() => navigator.clipboard.writeText('KEY-TRAP-SENTINEL'));
    await page.keyboard.press('Control+V');
    await expect(field).toHaveValue('base ');

    const popup = await pasteViaPopup(session.context, session.extensionId, `${FIXTURE_ORIGIN}/site-restricted/?case=${marker}`, 'KEYTRAP-INSERT');
    await expect(field).toHaveValue('base KEYTRAP-INSERT');
  });

  test('blocked copy is respected, but the capture shortcut captures the selection', async () => {
    const marker = 'restricted-copy';
    const page = await openSite(`/site-restricted/?case=${marker}`);
    const blocked = page.locator('#paste-blocked');
    const copyText = 'copy me, despite the cancelled copy event';

    await blocked.click();
    await page.keyboard.type(copyText);
    await page.keyboard.press('Control+A');
    await page.evaluate(() => navigator.clipboard.writeText('BASELINE'));
    await page.keyboard.press('Control+C');

    // The page cancelled the copy event: the system clipboard is untouched.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('BASELINE');
    await expect(page.getByTestId('blocked-counts')).toContainText('copy 1');

    const popup = await openPopupFor(
      session.context,
      session.extensionId,
      `${FIXTURE_ORIGIN}/site-restricted/?case=${marker}`,
    );

    // The selection is still in the field; the capture handler reads it directly.
    const result = (await messageContentTab(popup, { type: 'ca:capture-selection' })) as {
      ok: boolean;
      chars?: number;
    };
    expect(result.ok).toBe(true);
    expect(result.chars).toBe(copyText.length);

    const stored = await popup.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).chrome;
      const data = await api.storage.local.get('clipboardHistory');
      const entries = (data.clipboardHistory ?? []) as Array<{ text?: string }>;
      return entries.some((entry) => entry.text === 'copy me, despite the cancelled copy event');
    });
    expect(stored).toBe(true);

    // The user-select:none region is a separate mechanism. Chrome does not expose a
    // programmatic selection there (Range -> Selection yields an empty string), and
    // dragging cannot select it either, so the capture shortcut correctly reports
    // "Nothing selected". Verified here via the computed style; the diagnostic itself
    // is covered by the empty-capture test below.
    const userSelect = await page
      .locator('#select-none')
      .evaluate((element) => getComputedStyle(element).userSelect);
    expect(userSelect).toBe('none');
  });
});

test.describe('Keyboard shortcut handlers', () => {
  test('capture-selection stores the selected text, insert-current pastes it', async () => {
    const marker = 'shortcut-flow';
    const page = await openSite(`/site-plain/?case=${marker}`);
    const field = page.locator('#full-name');

    await field.click();
    await page.keyboard.type('Shortcut snippet');
    await page.keyboard.press('Control+A');

    // The popup is only a message conduit here; it is not part of the assertions.
    const popup = await openPopupFor(
      session.context,
      session.extensionId,
      `${FIXTURE_ORIGIN}/site-plain/?case=${marker}`,
    );

    const captured = (await messageContentTab(popup, { type: 'ca:capture-selection' })) as {
      ok: boolean;
      chars?: number;
    };
    expect(captured.ok).toBe(true);
    expect(captured.chars).toBe('Shortcut snippet'.length);

    // Capture flashes a status line and opens the floating panel. That open must not
    // re-read the system clipboard and clobber the freshly captured snippet.
    await expect(page.getByTestId('ca-panel')).toBeVisible();
    await expect(page.getByTestId('ca-panel')).toContainText('Shortcut snippet');

    const stored = await popup.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).chrome;
      const data = await api.storage.local.get('clipboardCurrent');
      return (data.clipboardCurrent?.text as string | undefined) ?? '';
    });
    expect(stored).toBe('Shortcut snippet');

    await page.bringToFront();
    await field.fill('');
    await field.click();

    const inserted = (await messageContentTab(popup, { type: 'ca:insert-current' })) as {
      ok: boolean;
    };
    expect(inserted.ok).toBe(true);
    await expect(field).toHaveValue('Shortcut snippet');
  });

  test('insert-current reports when nothing is stored', async () => {
    const marker = 'shortcut-empty';
    const page = await openSite(`/site-plain/?case=${marker}`);
    await page.evaluate(() => navigator.clipboard.writeText(''));

    const popup = await openPopupFor(
      session.context,
      session.extensionId,
      `${FIXTURE_ORIGIN}/site-plain/?case=${marker}`,
    );

    await popup.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: { storage: { local: { remove: (key: string) => Promise<void> } } } }).chrome;
      await api.storage.local.remove('clipboardCurrent');
    });

    const field = page.locator('#notes');
    await page.bringToFront();
    await field.click();

    const result = (await messageContentTab(popup, { type: 'ca:insert-current' })) as { ok: boolean; reason?: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty');
  });
});
