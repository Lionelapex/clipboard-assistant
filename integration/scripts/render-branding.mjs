import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Renders branding assets with the installed Chrome:
 *   branding/logo.svg  -> branding/logo-512.png (transparent)
 *   branding/banner.html -> branding/social-preview.png (1280x640)
 */
const root = path.resolve(process.cwd(), '..');
const branding = path.join(root, 'branding');

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// Logo: open the SVG directly and screenshot it at 512x512 without a background.
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(branding, 'logo.svg').replace(/\\/g, '/')}`);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(branding, 'logo-512.png'), omitBackground: true });
await page.close();

// Social preview: 1280x640 banner with the logo, name and one-line pitch.
const banner = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
const logoData = fs.readFileSync(path.join(branding, 'logo.svg')).toString('base64');
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1280px; height: 640px; overflow: hidden; }
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background: #0B1220; color: #F8FAFC; display: flex; align-items: center; gap: 72px; padding: 88px; }
  .mark { width: 300px; height: 300px; flex: none; border-radius: 68px; box-shadow: 0 24px 80px rgba(15,118,110,.45); }
  .copy { max-width: 760px; }
  .kicker { font-size: 22px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #2DD4BF; margin: 0 0 18px; }
  h1 { margin: 0 0 24px; font-size: 74px; line-height: 1.05; letter-spacing: -.02em; font-weight: 800; }
  .lede { font-size: 26px; line-height: 1.4; color: #94A3B8; margin: 0 0 32px; }
  .chips { display: flex; gap: 12px; font-size: 20px; color: #CBD5E1; }
  .chip { border: 1px solid #1E293B; border-radius: 999px; padding: 8px 18px; }
</style></head>
<body>
  <img class="mark" src="data:image/svg+xml;base64,${logoData}" alt="">
  <div class="copy">
    <p class="kicker">Clipboard Assistant</p>
    <h1>Paste where<br>paste is blocked</h1>
    <p class="lede">Chrome and Edge extension for forms that cancel Ctrl+V, plus a Type it fallback for fields that only accept typing.</p>
    <div class="chips">
      <span class="chip">Manifest V3</span>
      <span class="chip">Local only</span>
      <span class="chip">Free</span>
    </div>
  </div>
</body></html>`;
await banner.setContent(html);
await banner.waitForTimeout(200);
await banner.screenshot({ path: path.join(branding, 'social-preview.png') });

await browser.close();
console.log('rendered logo-512.png and social-preview.png');
