/**
 * Spec: Chrome Extension Scaffold
 *
 * Status: pending
 * Confirm: Extension package has valid Manifest V3, popup, full-tab UI, Vite build config
 * Invalidate: Manifest V3 requirements change or extension structure is invalid
 */

import * as fs from 'fs';
import * as path from 'path';

const extDir = path.resolve(__dirname, '../../../packages/extension');

describe('Chrome Extension Scaffold', () => {
  describe('manifest.json', () => {
    test('exists and is valid JSON', () => {
      const manifestPath = path.join(extDir, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest).toBeDefined();
    });

    test('uses Manifest V3', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.manifest_version).toBe(3);
    });

    test('has required identity fields', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.name).toBe('SelfTax — Free Tax Preparation');
      expect(manifest.version).toBe('0.1.0');
      expect(manifest.description).toContain('taxes for free');
      expect(manifest.description).toContain('never leaves your device');
    });

    test('declares activeTab and storage permissions', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.permissions).toContain('activeTab');
      expect(manifest.permissions).toContain('storage');
    });

    test('has action with popup', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.action).toBeDefined();
      expect(manifest.action.default_popup).toBe('popup.html');
    });

    test('has content security policy allowing inline styles', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
      );
      expect(manifest.content_security_policy).toBeDefined();
      const policy = manifest.content_security_policy.extension_pages;
      expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    });
  });

  describe('popup', () => {
    test('popup.html exists with SelfTax header and popup script', () => {
      const html = fs.readFileSync(path.join(extDir, 'popup.html'), 'utf-8');
      expect(html).toContain('SelfTax');
      expect(html).toContain('popup.js');
    });

    test('popup.ts exists and has vault-gated UI', () => {
      const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
      // Popup is self-contained — uses vault lock/unlock, no full-page tab
      expect(ts).toContain('isUnlocked');
      expect(ts).toContain('renderDashboard');
    });
  });

  describe('build config', () => {
    test('vite.config.ts exists with popup and content script entries', () => {
      const config = fs.readFileSync(
        path.join(extDir, 'vite.config.ts'),
        'utf-8',
      );
      expect(config).toContain('popup.ts');
      expect(config).toContain('freeFileAutoFill');
      expect(config).toContain('manifest.json');
    });

    test('tailwind.config.ts exists', () => {
      expect(
        fs.existsSync(path.join(extDir, 'tailwind.config.ts')),
      ).toBe(true);
    });

    test('src/index.css has Tailwind directives', () => {
      const css = fs.readFileSync(
        path.join(extDir, 'src/index.css'),
        'utf-8',
      );
      expect(css).toContain('@tailwind base');
    });
  });

  describe('package.json', () => {
    test('has correct package name', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(extDir, 'package.json'), 'utf-8'),
      );
      expect(pkg.name).toBe('@selftax/extension');
    });

    test('depends on @selftax/core workspace', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(extDir, 'package.json'), 'utf-8'),
      );
      expect(pkg.dependencies['@selftax/core']).toBe('workspace:*');
    });

    test('has React, Vite, and Tailwind dependencies', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(extDir, 'package.json'), 'utf-8'),
      );
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(allDeps['react']).toBeDefined();
      expect(allDeps['react-dom']).toBeDefined();
      expect(allDeps['vite']).toBeDefined();
      expect(allDeps['tailwindcss']).toBeDefined();
    });

    test('has Chrome types for extension API', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(extDir, 'package.json'), 'utf-8'),
      );
      expect(pkg.devDependencies['@types/chrome']).toBeDefined();
    });

    test('has build script', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(extDir, 'package.json'), 'utf-8'),
      );
      expect(pkg.scripts.build).toBe('vite build');
    });
  });
});
