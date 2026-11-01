import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN, MOCK_ORIGIN } from '../configuration/extension.config';
import {
  launchWithExtension,
  openMockSite,
  openPopupFor,
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

async function setClipboardAndRefresh(popup: Page, text: string) {
  await popup.evaluate(async (value) => navigator.clipboard.writeText(value), text);
  await popup.getByTestId('popup-refresh').click();
  await expect(popup.getByTestId('popup-preview')).toContainText(text.split('\n')[0]);
}

/** These sites are not referenced anywhere in the extension — no allowlist, no setup. */
test.describe('Unregistered sites', () => {
  test('plain HTML site: text input, textarea and contenteditable', async () => {
    const marker = 'plain-fields';
    const page = await openSite(`/site-plain/?case=${marker}`);
    const prefix = `${FIXTURE_ORIGIN}/site-plain/?case=${marker}`;

    const name = page.locator('#full-name');
    await name.click();
    await page.keyboard.type('Ada ');
    let popup = await openPopupFor(session.context, session.extensionId, prefix);
    await setClipboardAndRefresh(popup, 'Lovelace');
    await expect(popup.getByTestId('popup-target-field')).toContainText('Full name');
    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    await expect(name).toHaveValue('Ada Lovelace');
    await popup.close();

    const notes = page.locator('#notes');
    await page.bringToFront();
    await notes.click();
    popup = await openPopupFor(session.context, session.extensionId, prefix);
    await setClipboardAndRefresh(popup, 'First line\n\nSecond line');
    await popup.getByTestId('popup-paste').click();
    await expect(notes).toHaveValue('First line\n\nSecond line');
    await popup.close();

    const rich = page.locator('#rich');
    await page.bringToFront();
    await rich.click();
    popup = await openPopupFor(session.context, session.extensionId, prefix);
    await setClipboardAndRefresh(popup, 'Rich text content');
    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    expect(await rich.innerText()).toContain('Rich text content');
  });

  test('plain HTML site: fields generated after load are detected', async () => {
    const marker = 'plain-dynamic';
    const page = await openSite(`/site-plain/?case=${marker}`);

    await page.getByRole('button', { name: 'Add another field' }).click();
    await expect(page.getByTestId('field-count')).toHaveText('5 fields');

    const generated = page.locator('#extra-1');
    await generated.click();

    const popup = await openPopupFor(
      session.context,
      session.extensionId,
      `${FIXTURE_ORIGIN}/site-plain/?case=${marker}`,
    );
    await setClipboardAndRefresh(popup, 'Injected into a generated field');
    await expect(popup.getByTestId('popup-target-field')).toContainText('Extra detail 1');
    await popup.getByTestId('popup-paste').click();
    await expect(generated).toHaveValue('Injected into a generated field');
  });

  test('React site: controlled fields update React state', async () => {
    const marker = 'react';
    const page = await openSite(`/site-react/?case=${marker}`);
    const prefix = `${FIXTURE_ORIGIN}/site-react/?case=${marker}`;
    const text = 'Inserted into a controlled React textarea.';

    const body = page.locator('#react-body');
    await body.click();
    let popup = await openPopupFor(session.context, session.extensionId, prefix);
    await setClipboardAndRefresh(popup, text);
    await expect(popup.getByTestId('popup-target-field')).toContainText('Description');
    await popup.getByTestId('popup-paste').click();
    await expect(body).toHaveValue(text);
    await expect(page.getByTestId('react-count')).toContainText(`${text.length} characters in React state`);
    await popup.close();

    // A field created by React after mount.
    await page.bringToFront();
    await page.getByRole('button', { name: 'Add field' }).click();
    const extra = page.getByTestId('react-extra-1');
    await extra.click();
    popup = await openPopupFor(session.context, session.extensionId, prefix);
    await setClipboardAndRefresh(popup, 'Dynamic React field');
    await popup.getByTestId('popup-paste').click();
    await expect(extra).toHaveValue('Dynamic React field');
  });

  test('the same build works on two different sites without configuration', async () => {
    const mock = await openMockSite(session.context, 'multi-site');
    const other = await openSite('/site-plain/?case=multi-site');
    await waitForContentScript(mock);

    const mockField = mock.getByTestId('field-project-summary');
    await mock.bringToFront();
    await mockField.click();

    let popup = await openPopupFor(session.context, session.extensionId, `${MOCK_ORIGIN}/?case=multi-site`);
    await setClipboardAndRefresh(popup, 'mock site text');
    await popup.getByTestId('popup-paste').click();
    await expect(mockField).toHaveValue('mock site text');
    await popup.close();

    const otherField = other.locator('#notes');
    await other.bringToFront();
    await otherField.click();

    popup = await openPopupFor(
      session.context,
      session.extensionId,
      `${FIXTURE_ORIGIN}/site-plain/?case=multi-site`,
    );
    await setClipboardAndRefresh(popup, 'other site text');
    await popup.getByTestId('popup-paste').click();
    await expect(otherField).toHaveValue('other site text');

    // Neither site touched the other's field.
    await expect(mockField).toHaveValue('mock site text');
  });

  test('reports a field the page removed instead of pasting elsewhere', async () => {
    const marker = 'removed-field';
    const page = await openSite(`/site-plain/?case=${marker}`);

    await page.getByRole('button', { name: 'Add another field' }).click();
    const generated = page.locator('#extra-1');
    await generated.click();
    await page.evaluate(() => document.getElementById('extra-1')?.remove());

    const popup = await openPopupFor(
      session.context,
      session.extensionId,
      `${FIXTURE_ORIGIN}/site-plain/?case=${marker}`,
    );
    await setClipboardAndRefresh(popup, 'goes nowhere');
    await popup.getByTestId('popup-paste').click();

    await expect(popup.getByTestId('popup-status')).toHaveAttribute('data-status-kind', 'error');
    await expect(popup.getByTestId('popup-status')).toContainText('removed');
    await expect(page.locator('#notes')).toHaveValue('');
  });
});
