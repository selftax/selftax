/**
 * Spec: Extension Auto-fill — content script + popup messaging
 *
 * Status: active
 * Confirm: Content script handles autofill messages, manifest declares correct patterns
 * Invalidate: FreeFile field naming conventions change
 */

import * as fs from 'fs';
import * as path from 'path';

const extDir = path.resolve(__dirname, '../../../packages/extension');

describe('Extension Auto-fill', () => {
  describe('content script — structure', () => {
    test('content script file exists', () => {
      const contentPath = path.join(extDir, 'src/content/freeFileAutoFill.ts');
      expect(fs.existsSync(contentPath)).toBe(true);
    });

    test('content script handles AUTOFILL_CURRENT messages', () => {
      const content = fs.readFileSync(
        path.join(extDir, 'src/content/freeFileAutoFill.ts'),
        'utf-8',
      );
      expect(content).toContain('AUTOFILL_CURRENT');
    });

    test('content script handles AUTOFILL_ALL messages', () => {
      const content = fs.readFileSync(
        path.join(extDir, 'src/content/freeFileAutoFill.ts'),
        'utf-8',
      );
      expect(content).toContain('AUTOFILL_ALL');
    });

    test('content script registers chrome.runtime.onMessage listener', () => {
      const content = fs.readFileSync(
        path.join(extDir, 'src/content/freeFileAutoFill.ts'),
        'utf-8',
      );
      expect(content).toContain('chrome.runtime.onMessage.addListener');
    });

    test('content script dispatches input and change events', () => {
      const content = fs.readFileSync(
        path.join(extDir, 'src/content/freeFileAutoFill.ts'),
        'utf-8',
      );
      expect(content).toContain("'input'");
      expect(content).toContain("'change'");
      expect(content).toContain('dispatchEvent');
    });
  });

  describe('manifest.json — content script entry', () => {
    test('declares content_scripts for freefilefillableforms.com', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.content_scripts).toBeDefined();
      const freeFileEntry = manifest.content_scripts.find(
        (cs: { matches: string[] }) =>
          cs.matches.some((m: string) => m.includes('freefilefillableforms.com')),
      );
      expect(freeFileEntry).toBeDefined();
    });

    test('content script matches the correct URL pattern', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      const freeFileEntry = manifest.content_scripts[0];
      expect(freeFileEntry.matches).toContain('*://*.freefilefillableforms.com/*');
    });

    test('content script entry references the correct JS file', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      const freeFileEntry = manifest.content_scripts[0];
      expect(freeFileEntry.js).toContain('content/freeFileAutoFill.js');
    });

    test('has tabs permission for sendMessage', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.permissions).toContain('tabs');
    });
  });

  describe('popup — auto-fill buttons', () => {
    test('popup.ts has AUTOFILL_ALL message type', () => {
      const popup = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
      expect(popup).toContain('AUTOFILL_ALL');
    });

    test('popup.ts has AUTOFILL_CURRENT message type', () => {
      const popup = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
      expect(popup).toContain('AUTOFILL_CURRENT');
    });
  });

  describe('vite build config — content script entry', () => {
    test('vite.config.ts includes content script as build entry', () => {
      const config = fs.readFileSync(
        path.join(extDir, 'vite.config.ts'),
        'utf-8',
      );
      expect(config).toContain('freeFileAutoFill');
    });
  });
});
