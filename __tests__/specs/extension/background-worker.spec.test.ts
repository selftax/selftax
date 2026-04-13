/**
 * Spec: Background service worker handles server extraction
 *
 * Status: active
 * Confirm: The extension uses a background service worker for /extract fetch calls
 *          so the request survives popup close. Results are stored in chrome.storage.
 * Invalidate: Chrome changes MV3 service worker lifecycle behavior.
 */

import * as fs from 'fs';
import * as path from 'path';

const extDir = path.resolve(__dirname, '../../../packages/extension');

describe('Background service worker', () => {
  test('manifest.json declares a background service worker', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
    );
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBe('background.js');
  });

  test('manifest.json has host_permissions for localhost MCP server', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
    );
    expect(manifest.host_permissions).toContain('http://localhost:3742/*');
  });

  test('background script handles EXTRACT_REQUEST messages', () => {
    const content = fs.readFileSync(
      path.join(extDir, 'background.ts'),
      'utf-8',
    );
    expect(content).toContain('EXTRACT_REQUEST');
    expect(content).toContain('/extract');
  });

  test('background script stores extraction status in chrome.storage', () => {
    const content = fs.readFileSync(
      path.join(extDir, 'background.ts'),
      'utf-8',
    );
    expect(content).toContain('extractionStatus');
    expect(content).toContain('storedServerOverrides');
  });

  test('popup delegates /extract to background worker, not direct fetch', () => {
    const content = fs.readFileSync(
      path.join(extDir, 'popup.ts'),
      'utf-8',
    );
    // Popup should send message to background, not fetch directly
    expect(content).toContain('EXTRACT_REQUEST');
    // Popup should NOT have a direct fetch to /extract
    expect(content).not.toMatch(/fetch\s*\(\s*['"]http:\/\/localhost:3742\/extract/);
  });

  test('popup checks for completed extraction on init', () => {
    /** When popup reopens after being closed during extraction,
     *  it should check extractionStatus and calculate if done. */
    const content = fs.readFileSync(
      path.join(extDir, 'popup.ts'),
      'utf-8',
    );
    expect(content).toContain('extractionStatus');
    expect(content).toContain('calculateFromStoredData');
  });
});
