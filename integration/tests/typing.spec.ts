import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from '../configuration/extension.config';
import {
  launchWithExtension,
  openPopupFor,
  pasteViaPopup,
  type ExtensionSession,
} from './helpers';

/**
 * Fields that reject programmatic value changes and only accept character-wise typing.
 * The fixture reproduces the Allow Copy + "Boss level" checks without depending on the
 * public site: a >2-character input guard, a keydown-driven mask, a fake field and a
 * same-origin embedded widget.
 */
const SAMPLE = 'Force Paste works! Привет · 世界 👍';

let session: ExtensionSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  session = await launchWithExtension();
});

test.afterAll(async () => {
  await session?.dispose();
});

/** Each test gets its own URL so the popup's tab lookup cannot target another test's tab. */
function siteUrl(marker: string): string {
  return `${FIXTURE_ORIGIN}/site-typing/?case=${marker}`;
}

async function openTypingSite(marker: string): Promise<Page> {
  const page = await session.context.newPage();
  await page.goto(siteUrl(marker), { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForFunction(() =>
    Boolean(document.getElementById('clipboard-assistant-host')?.shadowRoot),
  );
  return page;
}

test.describe('Typing-only fields', () => {
  test('a bulk paste that the field reverts is retyped automatically', async () => {
    const url = siteUrl('bulk');
    const page = await openTypingSite('bulk');
    const field = page.locator('#typing');
    await field.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, url, SAMPLE);

    await expect(popup.getByTestId('popup-status')).toContainText('Typed and verified');
    await expect(field).toHaveValue(SAMPLE);
    expect(Number(await page.locator('#refused').innerText())).toBeGreaterThanOrEqual(1);
  });

  test('the explicit Type it button types the snippet character by character', async () => {
    const url = siteUrl('explicit');
    const page = await openTypingSite('explicit');
    const field = page.locator('#typing');
    await field.click();

    const popup = await openPopupFor(session.context, session.extensionId, url);
    await popup.evaluate(async (value) => navigator.clipboard.writeText(value), SAMPLE);
    await popup.getByTestId('popup-refresh').click();
    await expect(popup.getByTestId('popup-preview')).toContainText('Force Paste works!');

    await popup.getByTestId('popup-type').click();

    await expect(popup.getByTestId('popup-status')).toContainText('Typed and verified');
    await expect(field).toHaveValue(SAMPLE);
  });

  test('a masked phone field accepts keyed digits and is verified despite the mask', async () => {
    const url = siteUrl('phone');
    const page = await openTypingSite('phone');
    const field = page.locator('#phone');
    await field.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, url, '2025550143');

    await expect(popup.getByTestId('popup-status')).toContainText(/verified/i);
    await expect(field).toHaveValue('+1 (202) 555-0143');
  });

  test('a fake field that only draws text is reported honestly', async () => {
    const url = siteUrl('fake');
    const page = await openTypingSite('fake');
    await page.locator('#fake').click();

    const popup = await pasteViaPopup(session.context, session.extensionId, url, 'should not appear');

    await expect(popup.getByTestId('popup-status')).toContainText(/only draws text/i);
    await expect(page.locator('#fake')).toHaveText('Click and type');
  });

  test('a field inside a same-origin iframe is reached and verified', async () => {
    const url = siteUrl('frame');
    const page = await openTypingSite('frame');
    const field = page.frameLocator('iframe[title="Embedded widget"]').locator('#frame-field');
    await field.click();

    const popup = await pasteViaPopup(session.context, session.extensionId, url, 'Inside the frame');

    await expect(popup.getByTestId('popup-status')).toContainText('Pasted and verified');
    await expect(field).toHaveValue('Inside the frame');
  });
});
