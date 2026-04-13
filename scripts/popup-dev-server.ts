/**
 * Persistent popup dev server — keeps a Chromium instance running with the
 * extension loaded. Accepts commands via HTTP to query/modify the DOM.
 *
 * Usage: npx tsx scripts/popup-dev-server.ts
 *
 * Then interact via curl:
 *   curl -s localhost:3800/eval -d 'document.querySelector("h2").textContent'
 *   curl -s localhost:3800/eval -d 'document.querySelector(".header").style.background = "red"'
 *   curl -s localhost:3800/dom               # full HTML snapshot
 *   curl -s localhost:3800/dom?sel=.body      # HTML of a selector
 *   curl -s localhost:3800/reload             # reload popup after rebuild
 *   curl -s localhost:3800/screenshot         # take screenshot (saved to popup-screenshot.png)
 */

import { chromium, type Page, type BrowserContext } from '@playwright/test';
import { resolve } from 'path';
import { createServer } from 'http';

const extensionPath = resolve(__dirname, '../packages/extension/dist');
const screenshotPath = resolve(__dirname, '../popup-screenshot.png');
const PORT = 3800;

let context: BrowserContext;
let page: Page;
let extensionId: string;

async function launchBrowser() {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-gpu',
    ],
  });

  // Find extension ID
  const idPage = await context.newPage();
  await idPage.goto('chrome://extensions');
  extensionId = await idPage.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1000));
    const mgr = document.querySelector('extensions-manager');
    const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
    const item = list?.shadowRoot?.querySelector('extensions-item');
    return item?.id ?? '';
  });
  await idPage.close();

  if (!extensionId) throw new Error('Extension not found');

  page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  console.log(`Extension ID: ${extensionId}`);
  console.log(`Popup URL: chrome-extension://${extensionId}/popup.html`);
}

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

async function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    res.setHeader('Content-Type', 'application/json');

    try {
      if (url.pathname === '/eval') {
        const code = await readBody(req);
        const result = await page.evaluate(code);
        res.end(JSON.stringify({ ok: true, result }, null, 2));
      }
      else if (url.pathname === '/dom') {
        const sel = url.searchParams.get('sel');
        const html = sel
          ? await page.evaluate((s) => document.querySelector(s)?.outerHTML ?? 'not found', sel)
          : await page.evaluate(() => document.documentElement.outerHTML);
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      }
      else if (url.pathname === '/text') {
        const sel = url.searchParams.get('sel') ?? 'body';
        const text = await page.evaluate((s) => document.querySelector(s)?.textContent ?? 'not found', sel);
        res.setHeader('Content-Type', 'text/plain');
        res.end(text);
      }
      else if (url.pathname === '/upload') {
        // Upload files: GET /upload?dir=/path/to/folder or /upload?file=/path/to/file.pdf
        const dir = url.searchParams.get('dir');
        const file = url.searchParams.get('file');
        const { readdirSync } = await import('fs');
        const { resolve: pathResolve } = await import('path');

        let files: string[] = [];
        if (dir) {
          files = readdirSync(dir).map(f => pathResolve(dir, f));
        } else if (file) {
          files = [file];
        }

        if (files.length === 0) {
          res.end(JSON.stringify({ error: 'No files. Use ?dir= or ?file=' }));
          return;
        }

        await page.locator('#file-input').setInputFiles(files);
        await page.waitForTimeout(500);
        res.end(JSON.stringify({ ok: true, files: files.length }));
      }
      else if (url.pathname === '/click') {
        // Click a button: GET /click?sel=#extract-btn
        const sel = url.searchParams.get('sel');
        if (!sel) { res.end(JSON.stringify({ error: 'need ?sel=' })); return; }
        await page.click(sel);
        await page.waitForTimeout(500);
        res.end(JSON.stringify({ ok: true, clicked: sel }));
      }
      else if (url.pathname === '/wait') {
        // Wait for processing: GET /wait?ms=5000
        const ms = parseInt(url.searchParams.get('ms') ?? '3000', 10);
        await page.waitForTimeout(ms);
        res.end(JSON.stringify({ ok: true, waited: ms }));
      }
      else if (url.pathname === '/reload') {
        await page.goto(`chrome-extension://${extensionId}/popup.html`);
        await page.waitForTimeout(500);
        res.end(JSON.stringify({ ok: true, msg: 'reloaded' }));
      }
      else if (url.pathname === '/unlock') {
        // No-password mode: popup auto-unlocks, but handle legacy encrypted vaults
        const lockVisible = await page.locator('#unlock-pw').isVisible().catch(() => false);
        if (lockVisible) {
          const pw = url.searchParams.get('pw') ?? 'test1234';
          await page.fill('#unlock-pw', pw);
          await page.click('#unlock-btn');
          await page.waitForTimeout(1000);
        } else {
          await page.waitForTimeout(500);
        }
        res.end(JSON.stringify({ ok: true, msg: 'unlocked' }));
      }
      else if (url.pathname === '/screenshot') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        res.end(JSON.stringify({ ok: true, path: screenshotPath }));
      }
      else {
        res.end(JSON.stringify({
          endpoints: [
            'POST /eval      — run JS in page (body = code)',
            'GET  /dom        — full HTML (or ?sel=.foo)',
            'GET  /text?sel=  — text content of selector',
            'GET  /reload     — reload popup after rebuild',
            'GET  /unlock     — setup/unlock vault',
            'GET  /screenshot — save screenshot',
          ],
        }));
      }
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  server.listen(PORT, () => {
    console.log(`Dev server running on http://localhost:${PORT}`);
    console.log('Endpoints: /eval, /dom, /text, /reload, /unlock, /screenshot');
  });
}

(async () => {
  await launchBrowser();
  await startServer();
})();
