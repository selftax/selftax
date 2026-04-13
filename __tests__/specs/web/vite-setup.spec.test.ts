/**
 * Spec: Vite Web App Setup
 *
 * Status: confirmed
 * Confirm: Web app builds with Vite, renders React root, Tailwind styles apply
 * Invalidate: Vite + React + Tailwind + monorepo workspace causes build issues
 */

import * as fs from 'fs';
import * as path from 'path';

const webDir = path.resolve(__dirname, '../../../packages/web');

describe('Vite Web App Setup', () => {
  test('packages/web has vite.config.ts', () => {
    expect(fs.existsSync(path.join(webDir, 'vite.config.ts'))).toBe(true);
  });

  test('packages/web has React entry point (src/main.tsx)', () => {
    expect(fs.existsSync(path.join(webDir, 'src/main.tsx'))).toBe(true);
  });

  test('packages/web has index.html with root div', () => {
    const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf-8');
    expect(html).toContain('id="root"');
    expect(html).toContain('src/main.tsx');
  });

  test('packages/web has Tailwind configured (tailwind.config.ts)', () => {
    const hasTsConfig = fs.existsSync(path.join(webDir, 'tailwind.config.ts'));
    const hasJsConfig = fs.existsSync(path.join(webDir, 'tailwind.config.js'));
    expect(hasTsConfig || hasJsConfig).toBe(true);
  });

  test('packages/web has src/index.css with Tailwind directives', () => {
    const css = fs.readFileSync(path.join(webDir, 'src/index.css'), 'utf-8');
    expect(css).toContain('@tailwind base');
    expect(css).toContain('@tailwind components');
    expect(css).toContain('@tailwind utilities');
  });

  test('packages/web/package.json has react, vite, tailwindcss dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(webDir, 'package.json'), 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(allDeps['react']).toBeDefined();
    expect(allDeps['react-dom']).toBeDefined();
    expect(allDeps['vite']).toBeDefined();
    expect(allDeps['tailwindcss']).toBeDefined();
  });

  test('packages/web imports @selftax/core', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(webDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@selftax/core']).toBe('workspace:*');
  });

  test('packages/web has App.tsx with basic router shell', () => {
    const appPath = path.join(webDir, 'src/App.tsx');
    expect(fs.existsSync(appPath)).toBe(true);
    const content = fs.readFileSync(appPath, 'utf-8');
    expect(content).toMatch(/Route|Router|navigate|page/i);
  });
});
