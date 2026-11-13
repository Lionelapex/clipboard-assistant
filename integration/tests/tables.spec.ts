import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_ORIGIN } from '../configuration/extension.config';
import {
  launchWithExtension,
  messageContentTab,
  openPopupFor,
  type ExtensionSession,
} from './helpers';

/**
 * Tables copied from Word are HTML tables with layout in inline styles. These tests
 * paste a Word-shaped table into a rich editor and into a plain textarea, then read the
 * destination back rather than trusting the status message.
 */
const WORD_HTML = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>Report</title>
<style>table.MsoTableGrid { border-collapse: collapse; } p.MsoNormal { margin: 0; }</style>
</head>
<body>
<!--StartFragment-->
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;mso-table-layout-alt:fixed'>
  <tr style='height:15.0pt'>
    <td width=120 style='width:30%;border:solid windowtext 1.0pt;background:#D9E2F3;padding:2.0pt 4.0pt'>
      <p class=MsoNormal><b><span style='font-size:10.0pt'>Region<o:p></o:p></span></b></p>
    </td>
    <td width=140 style='width:35%;border:solid windowtext 1.0pt;background:#D9E2F3;padding:2.0pt 4.0pt'>
      <p class=MsoNormal><b><span style='font-size:10.0pt'>Revenue<o:p></o:p></span></b></p>
    </td>
    <td width=140 style='width:35%;border:solid windowtext 1.0pt;background:#D9E2F3;padding:2.0pt 4.0pt'>
      <p class=MsoNormal><b><span style='font-size:10.0pt'>Growth<o:p></o:p></span></b></p>
    </td>
  </tr>
  <tr>
    <td style='border:solid windowtext 1.0pt;padding:2.0pt 4.0pt'><p class=MsoNormal>North</p></td>
    <td style='border:solid windowtext 1.0pt;padding:2.0pt 4.0pt;text-align:right'><p class=MsoNormal>$1,200</p></td>
    <td style='border:solid windowtext 1.0pt;padding:2.0pt 4.0pt'><p class=MsoNormal><span style='color:#008000'>12%</span></p></td>
  </tr>
  <tr>
    <td colspan=2 style='border:solid windowtext 1.0pt;padding:2.0pt 4.0pt'><p class=MsoNormal>Combined</p></td>
    <td style='border:solid windowtext 1.0pt;padding:2.0pt 4.0pt'><p class=MsoNormal>18%</p></td>
  </tr>
</table>
<script>window.__tablePwned = true;</script>
<!--EndFragment-->
</body>
</html>`;

const WORD_TEXT = 'Region\tRevenue\tGrowth\nNorth\t$1,200\t12%\nCombined\t\t18%';

const BORDERLESS_HTML =
  "<table><tr><td style='border:none;padding:4px'>A1</td><td style='border:none;padding:4px'>B1</td></tr>" +
  "<tr><td style='border:none;padding:4px'>A2</td><td style='border:none;padding:4px'>B2</td></tr></table>";

// Mirrors the user's Word answer grid: two bordered halves separated by a borderless
// spacer column, with widths in points that must become proportions.
const SPACER_HTML =
  "<table border=1><tr>" +
  "<td style='width:95pt;border:solid black 1pt;padding:0 .5pt'><b>Q</b></td>" +
  "<td style='width:137.5pt;border:solid black 1pt;padding:0 .5pt'><b>Student Response</b></td>" +
  "<td style='width:80pt;border:none white 1pt;padding:0 .5pt'>&nbsp;</td>" +
  "<td style='width:95pt;border:solid black 1pt;padding:0 .5pt'><b>Q</b></td>" +
  "<td style='width:137.5pt;border:solid black 1pt;padding:0 .5pt'><b>Student Response</b></td>" +
  "</tr><tr>" +
  "<td style='border:solid black 1pt'>1</td><td style='border:solid black 1pt'>C</td>" +
  "<td style='border:none white 1pt'>&nbsp;</td>" +
  "<td style='border:solid black 1pt'>14</td><td style='border:solid black 1pt'>B</td>" +
  "</tr></table>";

let session: ExtensionSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  session = await launchWithExtension();
});

test.afterAll(async () => {
  await session?.dispose();
});

function siteUrl(marker: string): string {
  return `${FIXTURE_ORIGIN}/site-tables/?case=${marker}`;
}

async function openTableSite(marker: string): Promise<Page> {
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

test.describe('Table pastes', () => {
  test('a Word table keeps its rows, header, colspan, widths and colours in a rich editor', async () => {
    const marker = 'table-rich';
    const page = await openTableSite(marker);
    await writeRichClipboard(page, WORD_HTML, WORD_TEXT);

    const editor = page.locator('#table-editor');
    await editor.click();

    const popup = await openPopupFor(session.context, session.extensionId, siteUrl(marker));
    await popup.getByTestId('popup-refresh').click();
    await expect(popup.getByTestId('popup-preview')).toContainText('Region');

    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText(/formatting|verified/i, {
      timeout: 30_000,
    });

    const shape = await editor.evaluate((element) => {
      const table = element.querySelector('table');
      if (!table) return null;
      const rows = Array.from(table.rows);
      return {
        html: element.innerHTML,
        rows: rows.length,
        headerCells: rows[0]?.cells.length ?? 0,
        lastRowCells: rows[rows.length - 1]?.cells.length ?? 0,
        colspan: rows[rows.length - 1]?.cells[0]?.getAttribute('colspan'),
        tableStyle: table.getAttribute('style') ?? '',
        headerStyle: rows[0]?.cells[0]?.getAttribute('style') ?? '',
        headerStyles: Array.from(rows[0]?.cells ?? []).map((cell) => cell.getAttribute('style') ?? ''),
        revenueStyle: rows[1]?.cells[1]?.getAttribute('style') ?? '',
        text: table.innerText,
      };
    });

    expect(shape).not.toBeNull();
    expect(shape?.rows).toBe(3);
    expect(shape?.headerCells).toBe(3);
    expect(shape?.lastRowCells).toBe(2);
    expect(shape?.colspan).toBe('2');
    expect(shape?.tableStyle).toContain('border-collapse');
    expect(shape?.headerStyle).toContain('border:1px solid');
    expect(shape?.headerStyle).toMatch(/background-color:\s*(#D9E2F3|rgb\(217,\s*226,\s*243\))/i);
    const widths = (shape?.headerStyles ?? []).map((style) =>
      Number.parseFloat(/width:\s*([\d.]+)%/.exec(style)?.[1] ?? '0'),
    );
    expect(widths.every((width) => width > 0)).toBe(true);
    const widthTotal = widths.reduce((sum, width) => sum + width, 0);
    expect(widthTotal).toBeGreaterThan(98);
    expect(widthTotal).toBeLessThan(102);
    expect(shape?.revenueStyle).toContain('text-align:right');
    expect(shape?.html).toMatch(/<(strong|b)>/);
    expect(shape?.html).not.toContain('<script');
    expect(shape?.html).toMatch(/color:\s*(#008000|rgb\(0,\s*128,\s*0\))/i);
    expect(shape?.text).toContain('Combined');
  });

  test('the same table becomes tab-separated rows in a plain textarea', async () => {
    const marker = 'table-plain';
    const page = await openTableSite(marker);
    await writeRichClipboard(page, WORD_HTML, WORD_TEXT);

    const field = page.locator('#table-plain');
    await field.click();

    const popup = await openPopupFor(session.context, session.extensionId, siteUrl(marker));
    await popup.getByTestId('popup-refresh').click();
    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText(/tab-separated|verified/i, {
      timeout: 30_000,
    });

    expect(await field.inputValue()).toBe(WORD_TEXT);
  });

  test('a borderless table stays borderless', async () => {
    const marker = 'table-borderless';
    const page = await openTableSite(marker);
    await writeRichClipboard(page, BORDERLESS_HTML, 'A1\tB1\nA2\tB2');

    const editor = page.locator('#table-editor');
    await editor.click();

    const popup = await openPopupFor(session.context, session.extensionId, siteUrl(marker));
    await popup.getByTestId('popup-refresh').click();
    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText(/formatting|verified/i, {
      timeout: 30_000,
    });

    const styles = await editor.evaluate((element) => {
      const table = element.querySelector('table');
      const cell = element.querySelector('td');
      return {
        table: table?.getAttribute('style') ?? '',
        cell: cell?.getAttribute('style') ?? '',
      };
    });

    expect(styles.table).toContain('border:none');
    expect(styles.cell).not.toContain('border:1px solid');
  });

  test('a borderless spacer cell stays open inside a bordered table', async () => {
    const marker = 'table-spacer';
    const page = await openTableSite(marker);
    await writeRichClipboard(page, SPACER_HTML, 'Q\tStudent Response\t\tQ\tStudent Response\n1\tC\t\t14\tB');

    const editor = page.locator('#table-editor');
    await editor.click();

    const popup = await openPopupFor(session.context, session.extensionId, siteUrl(marker));
    await popup.getByTestId('popup-refresh').click();
    await popup.getByTestId('popup-paste').click();
    await expect(popup.getByTestId('popup-status')).toContainText(/formatting|verified/i, {
      timeout: 30_000,
    });

    const shape = await editor.evaluate((element) => {
      const table = element.querySelector('table');
      if (!table) return null;
      const row = table.rows[0];
      return {
        rows: table.rows.length,
        cells: row?.cells.length ?? 0,
        styles: Array.from(row?.cells ?? []).map((cell) => cell.getAttribute('style') ?? ''),
      };
    });

    expect(shape?.rows).toBe(2);
    expect(shape?.cells).toBe(5);
    expect(shape?.styles?.[2]).not.toContain('border:1px solid');
    expect(shape?.styles?.[0]).toContain('border:1px solid');

    const widths = (shape?.styles ?? []).map((style) =>
      Number.parseFloat(/width:\s*([\d.]+)%/.exec(style)?.[1] ?? '0'),
    );
    expect(widths[0]).toBeGreaterThan(16);
    expect(widths[0]).toBeLessThan(19);
    const total = widths.reduce((sum, width) => sum + width, 0);
    expect(total).toBeGreaterThan(98);
    expect(total).toBeLessThan(102);
  });

  test('the capture shortcut keeps a selected table', async () => {
    const marker = 'table-capture';
    const page = await openTableSite(marker);

    await page.evaluate(() => {
      const source = document.getElementById('source-table');
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
    };
    expect(captured.ok).toBe(true);

    const storedHtml = await popup.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (globalThis as any).chrome;
      const data = await api.storage.local.get('clipboardCurrent');
      return (data.clipboardCurrent?.html as string | undefined) ?? '';
    });
    expect(storedHtml).toContain('<table');

    await page.bringToFront();
    const editor = page.locator('#table-editor');
    await editor.click();
    const inserted = (await messageContentTab(popup, { type: 'ca:insert-current' })) as {
      ok: boolean;
      strategy?: string;
    };
    expect(inserted.ok).toBe(true);
    expect(inserted.strategy).toBe('insert-html');

    const table = await editor.evaluate((element) => {
      const node = element.querySelector('table');
      return node ? { rows: node.rows.length, text: node.innerText } : null;
    });
    expect(table?.rows).toBe(3);
    expect(table?.text).toContain('Revenue');
  });
});
