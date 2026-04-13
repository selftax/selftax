/**
 * Spec: Extension structure — popup-based architecture
 *
 * Status: active
 * Confirm: Extension uses popup.ts as the primary UI, with services for
 *          vault, calculation, extraction, and autofill.
 * Invalidate: Extension reverts to React full-page app
 */

import * as fs from 'fs';
import * as path from 'path';

const extDir = path.resolve(__dirname, '../../../packages/extension');
const extSrc = path.join(extDir, 'src');

describe('Extension Structure', () => {
  describe('popup is the primary UI', () => {
    test('popup.ts exists as the main entry point', () => {
      expect(fs.existsSync(path.join(extDir, 'popup.ts'))).toBe(true);
    });

    test('popup.html exists with popup.js script', () => {
      const html = fs.readFileSync(path.join(extDir, 'popup.html'), 'utf-8');
      expect(html).toContain('popup.js');
      expect(html).toContain('SelfTax');
    });

    test('no React full-page app (App.tsx removed)', () => {
      expect(fs.existsSync(path.join(extSrc, 'App.tsx'))).toBe(false);
    });

    test('no pages/ directory (old multi-page flow removed)', () => {
      expect(fs.existsSync(path.join(extSrc, 'pages'))).toBe(false);
    });

    test('manifest.json uses popup.html as default_popup', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.action.default_popup).toBe('popup.html');
    });
  });

  describe('no duplicated code', () => {
    test('extension does NOT duplicate web components (no components/ dir)', () => {
      expect(fs.existsSync(path.join(extSrc, 'components'))).toBe(false);
    });

    test('extension does NOT duplicate web stores (no stores/ dir)', () => {
      expect(fs.existsSync(path.join(extSrc, 'stores'))).toBe(false);
    });

    test('extension services/ contains only extension-specific code', () => {
      const servicesDir = path.join(extSrc, 'services');
      if (fs.existsSync(servicesDir)) {
        const files = fs.readdirSync(servicesDir);
        const allowedPatterns = [
          /analyzeService/i, /browserCalculator/i,
          /vault/i, /labelExtractor/i,
        ];
        for (const file of files) {
          const matches = allowedPatterns.some((p) => p.test(file));
          expect(matches).toBe(true);
        }
      }
    });
  });

  describe('build config', () => {
    test('vite.config.ts has popup as build entry', () => {
      const config = fs.readFileSync(path.join(extDir, 'vite.config.ts'), 'utf-8');
      expect(config).toContain('popup');
    });

    test('vite.config.ts has content script as build entry', () => {
      const config = fs.readFileSync(path.join(extDir, 'vite.config.ts'), 'utf-8');
      expect(config).toContain('freeFileAutoFill');
    });

    test('vite.config.ts has popupProcessing as build entry', () => {
      const config = fs.readFileSync(path.join(extDir, 'vite.config.ts'), 'utf-8');
      expect(config).toContain('popupProcessing');
    });
  });

  describe('content script', () => {
    test('content script file exists', () => {
      expect(fs.existsSync(path.join(extSrc, 'content/freeFileAutoFill.ts'))).toBe(true);
    });

    test('manifest declares content_scripts for freefilefillableforms.com', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.content_scripts).toBeDefined();
      const entry = manifest.content_scripts[0];
      expect(entry.matches).toContain('*://*.freefilefillableforms.com/*');
      expect(entry.js).toContain('content/freeFileAutoFill.js');
    });
  });
});
