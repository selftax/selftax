import { defineConfig } from '@playwright/test';
import { resolve } from 'path';

const extensionPath = resolve(__dirname, 'packages/extension/dist');

export default defineConfig({
  testDir: './__tests__/e2e',
  timeout: 30000,
  use: {
    // Chrome extensions require a persistent context with the extension loaded.
    // Playwright's `chromium.launchPersistentContext` is used in the test itself.
  },
  projects: [
    {
      name: 'extension',
      use: {
        // Store the extension path for tests to reference
        baseURL: `file://${extensionPath}`,
      },
    },
  ],
});
