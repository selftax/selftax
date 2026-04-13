/**
 * Takes a screenshot of the extension popup for visual iteration.
 * Usage: npx tsx scripts/popup-screenshot.ts [action]
 *
 * Actions:
 *   setup    — fresh state, shows "Create Password" screen
 *   unlock   — creates vault + unlocks, shows dashboard
 *   lock     — creates vault, locks, shows lock screen
 */

import { chromium } from '@playwright/test';
import { resolve } from 'path';

const extensionPath = resolve(__dirname, '../packages/extension/dist');
const screenshotPath = resolve(__dirname, '../popup-screenshot.png');

async function main() {
  const action = process.argv[2] ?? 'setup';

  const context = await chromium.launchPersistentContext('', {
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
  const extensionId = await idPage.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1000));
    const mgr = document.querySelector('extensions-manager');
    const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
    const item = list?.shadowRoot?.querySelector('extensions-item');
    return item?.id ?? '';
  });
  await idPage.close();

  if (!extensionId) {
    console.error('Could not find extension ID');
    await context.close();
    process.exit(1);
  }

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(500);

  if (action === 'unlock') {
    // Check if setup needed
    const needsSetup = await page.locator('#setup-pw').isVisible().catch(() => false);
    if (needsSetup) {
      await page.fill('#setup-pw', 'test1234');
      await page.fill('#setup-confirm', 'test1234');
      await page.click('#setup-btn');
      await page.waitForTimeout(1000);
    } else {
      const needsUnlock = await page.locator('#unlock-pw').isVisible().catch(() => false);
      if (needsUnlock) {
        await page.fill('#unlock-pw', 'test1234');
        await page.click('#unlock-btn');
        await page.waitForTimeout(1000);
      }
    }
  }

  // Set viewport to popup size
  await page.setViewportSize({ width: 400, height: 700 });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved to ${screenshotPath}`);

  await context.close();
}

main();
