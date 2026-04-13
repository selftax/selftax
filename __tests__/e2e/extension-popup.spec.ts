/**
 * E2E test: Extension popup UI flows.
 *
 * Loads the built extension into a real Chromium instance and verifies:
 * - First-time setup (create password)
 * - Lock/unlock flow
 * - Dashboard renders after unlock
 * - Reset clears data
 */

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { resolve } from 'path';

const extensionPath = resolve(__dirname, '../../packages/extension/dist');

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  // Launch Chromium with the extension loaded
  context = await chromium.launchPersistentContext('', {
    headless: false, // Extensions require headed mode
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-gpu',
    ],
  });

  // Our extension has no service worker, so find the ID via chrome://extensions
  const page = await context.newPage();
  await page.goto('chrome://extensions');

  // Enable developer mode to see extension IDs
  // The extension ID is in the page's shadow DOM; extract it via JS
  extensionId = await page.evaluate(async () => {
    // Wait a moment for extensions to load
    await new Promise((r) => setTimeout(r, 1000));

    const manager = document.querySelector('extensions-manager');
    if (!manager?.shadowRoot) return '';
    const itemList = manager.shadowRoot.querySelector('extensions-item-list');
    if (!itemList?.shadowRoot) return '';
    const item = itemList.shadowRoot.querySelector('extensions-item');
    if (!item) return '';
    return item.id || '';
  });

  // Fallback: try to find it from the manifest
  if (!extensionId) {
    // Open a known extension page and capture the redirected URL
    const testPage = await context.newPage();
    // Navigate to a page and check for extension in the extensions list
    await testPage.goto('chrome://extensions');
    await testPage.waitForTimeout(2000);

    // Try extracting from the page content
    extensionId = await testPage.evaluate(() => {
      const el = document.querySelector('extensions-manager');
      const items = el?.shadowRoot?.querySelector('extensions-item-list');
      const first = items?.shadowRoot?.querySelector('extensions-item');
      return first?.getAttribute('id') ?? '';
    });
    await testPage.close();
  }

  await page.close();

  if (!extensionId) {
    throw new Error('Could not find extension ID. Is the extension built in dist/?');
  }
});

test.afterAll(async () => {
  await context?.close();
});

test.describe('Extension Popup', () => {
  test('shows create password screen on first launch', async () => {
    const popupURL = `chrome-extension://${extensionId}/popup.html`;
    const page = await context.newPage();
    await page.goto(popupURL);

    // Should show the setup screen
    await expect(page.locator('h2')).toHaveText('Create a Password');
    await expect(page.locator('#setup-pw')).toBeVisible();
    await expect(page.locator('#setup-confirm')).toBeVisible();
    await expect(page.locator('#setup-btn')).toBeVisible();

    await page.close();
  });

  test('rejects mismatched passwords', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.fill('#setup-pw', 'testpass123');
    await page.fill('#setup-confirm', 'different');
    await page.click('#setup-btn');

    // Should show error
    await expect(page.locator('#setup-error')).toBeVisible();
    await expect(page.locator('#setup-error')).toContainText('do not match');

    await page.close();
  });

  test('rejects short passwords', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.fill('#setup-pw', 'abc');
    await page.fill('#setup-confirm', 'abc');
    await page.click('#setup-btn');

    await expect(page.locator('#setup-error')).toBeVisible();
    await expect(page.locator('#setup-error')).toContainText('at least 4');

    await page.close();
  });

  test('creates vault and shows dashboard', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Wait for either setup or lock screen
    await page.waitForSelector('#setup-pw, #unlock-pw', { timeout: 5000 });

    if (await page.locator('#setup-pw').isVisible()) {
      // First time — create vault
      await page.fill('#setup-pw', 'testpass123');
      await page.fill('#setup-confirm', 'testpass123');
      await page.click('#setup-btn');
    } else {
      // Already set up — unlock
      await page.fill('#unlock-pw', 'testpass123');
      await page.click('#unlock-btn');
    }

    // Should show dashboard elements
    await expect(page.locator('#lock-button')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#upload-area')).toBeVisible();
    await expect(page.locator('#profile-filing-status')).toBeVisible();
    await expect(page.locator('#fields-toggle-btn')).toBeVisible();
    await expect(page.locator('#reset-btn')).toBeVisible();

    await page.close();
  });

  test('lock button returns to lock screen', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Vault already created, should show lock or dashboard
    await page.waitForSelector('#unlock-pw, #lock-button', { timeout: 5000 });

    if (await page.locator('#unlock-pw').isVisible()) {
      await page.fill('#unlock-pw', 'testpass123');
      await page.click('#unlock-btn');
      await page.waitForSelector('#lock-button', { timeout: 10000 });
    }

    // Click lock
    await page.click('#lock-button');

    // Should show lock screen
    await expect(page.locator('#unlock-pw')).toBeVisible();
    await expect(page.locator('h2')).toHaveText('Unlock SelfTax');

    await page.close();
  });

  test('wrong password shows error', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.waitForSelector('#unlock-pw', { timeout: 5000 });
    await page.fill('#unlock-pw', 'wrongpassword');
    await page.click('#unlock-btn');

    await expect(page.locator('#unlock-error')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#unlock-error')).toContainText('Incorrect password');

    await page.close();
  });

  test('correct password unlocks to dashboard', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.waitForSelector('#unlock-pw', { timeout: 5000 });
    await page.fill('#unlock-pw', 'testpass123');
    await page.click('#unlock-btn');

    await expect(page.locator('#lock-button')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#upload-area')).toBeVisible();

    await page.close();
  });

  test('profile fields are editable', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Unlock if needed
    if (await page.locator('#unlock-pw').isVisible()) {
      await page.fill('#unlock-pw', 'testpass123');
      await page.click('#unlock-btn');
      await page.waitForSelector('#lock-button', { timeout: 10000 });
    }

    // Change filing status
    await page.selectOption('#profile-filing-status', 'mfj');

    // Should show "Profile saved"
    await expect(page.locator('.status.success')).toContainText('Profile saved', { timeout: 3000 });

    await page.close();
  });

  test('reset clears all data and returns to setup', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Unlock if needed
    if (await page.locator('#unlock-pw').isVisible()) {
      await page.fill('#unlock-pw', 'testpass123');
      await page.click('#unlock-btn');
      await page.waitForSelector('#lock-button', { timeout: 10000 });
    }

    // Click reset — first click is confirmation prompt
    await page.click('#reset-btn');
    await expect(page.locator('#reset-btn')).toContainText('Are you sure');

    // Second click actually resets
    await page.click('#reset-btn');

    // Should return to setup screen
    await expect(page.locator('#setup-pw')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('h2')).toHaveText('Create a Password');

    await page.close();
  });

  test('forgot password clears vault and returns to setup', async () => {
    // First create a vault
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.waitForSelector('#setup-pw, #unlock-pw', { timeout: 5000 });
    if (await page.locator('#setup-pw').isVisible()) {
      await page.fill('#setup-pw', 'testpass123');
      await page.fill('#setup-confirm', 'testpass123');
      await page.click('#setup-btn');
      await page.waitForSelector('#lock-button', { timeout: 10000 });
    }

    // Lock the vault
    await page.click('#lock-button');
    await expect(page.locator('#unlock-pw')).toBeVisible();

    // Click forgot password — first click is confirmation
    await page.click('#forgot-pw-btn');
    await expect(page.locator('#forgot-pw-btn')).toContainText('clear your PII');

    // Second click resets
    await page.click('#forgot-pw-btn');
    await expect(page.locator('#setup-pw')).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  test('e-file fields are visible and editable', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.waitForSelector('#setup-pw, #unlock-pw', { timeout: 5000 });
    if (await page.locator('#setup-pw').isVisible()) {
      await page.fill('#setup-pw', 'testpass123');
      await page.fill('#setup-confirm', 'testpass123');
      await page.click('#setup-btn');
    } else {
      await page.fill('#unlock-pw', 'testpass123');
      await page.click('#unlock-btn');
    }
    await page.waitForSelector('#lock-button', { timeout: 10000 });

    // E-file fields should be visible
    await expect(page.locator('#profile-phone')).toBeVisible();
    await expect(page.locator('#profile-dob')).toBeVisible();
    await expect(page.locator('#profile-pin')).toBeVisible();

    // Edit phone and verify save feedback
    await page.fill('#profile-phone', '555-123-4567');
    await page.locator('#profile-phone').dispatchEvent('change');
    await expect(page.locator('.status.success')).toContainText('Profile saved', { timeout: 3000 });

    await page.close();
  });

  test('field vault shows editable inputs', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.waitForSelector('#setup-pw, #unlock-pw', { timeout: 5000 });
    if (await page.locator('#setup-pw').isVisible()) {
      await page.fill('#setup-pw', 'testpass123');
      await page.fill('#setup-confirm', 'testpass123');
      await page.click('#setup-btn');
    } else {
      await page.fill('#unlock-pw', 'testpass123');
      await page.click('#unlock-btn');
    }
    await page.waitForSelector('#lock-button', { timeout: 10000 });

    // Open field vault
    await page.click('#fields-toggle-btn');
    await expect(page.locator('#fields-vault')).toBeVisible();

    // If there are saved fields, they should be editable inputs
    const editInputs = page.locator('.field-edit');
    const count = await editInputs.count();
    if (count > 0) {
      // Fields should be input elements
      const tag = await editInputs.first().evaluate((el) => el.tagName);
      expect(tag).toBe('INPUT');
    }

    await page.close();
  });
});
