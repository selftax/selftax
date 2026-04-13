/**
 * Spec: Basic Routing
 *
 * Status: confirmed
 * Confirm: App has routes for the core user journey pages
 * Invalidate: react-router adds too much complexity for a SPA
 */

import * as fs from 'fs';
import * as path from 'path';

const webSrcDir = path.resolve(__dirname, '../../../packages/web/src');

describe('Basic Routing', () => {
  test('has pages directory with core route pages', () => {
    const pagesDir = path.join(webSrcDir, 'pages');
    expect(fs.existsSync(pagesDir)).toBe(true);
    const pages = fs.readdirSync(pagesDir);
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  test('has a Welcome/Home page', () => {
    const pagesDir = path.join(webSrcDir, 'pages');
    const files = fs.readdirSync(pagesDir, { recursive: true }) as string[];
    const hasWelcome = files.some((f) =>
      /welcome|home|landing/i.test(String(f)),
    );
    expect(hasWelcome).toBe(true);
  });

  test('has a Documents page for uploading tax docs', () => {
    const pagesDir = path.join(webSrcDir, 'pages');
    const files = fs.readdirSync(pagesDir, { recursive: true }) as string[];
    const hasDocs = files.some((f) =>
      /document|upload/i.test(String(f)),
    );
    expect(hasDocs).toBe(true);
  });

  test('has a Review page for reviewing the tax return', () => {
    const pagesDir = path.join(webSrcDir, 'pages');
    const files = fs.readdirSync(pagesDir, { recursive: true }) as string[];
    const hasReview = files.some((f) =>
      /review|summary/i.test(String(f)),
    );
    expect(hasReview).toBe(true);
  });

  test('App.tsx renders routes for all pages', () => {
    const appContent = fs.readFileSync(path.join(webSrcDir, 'App.tsx'), 'utf-8');
    expect(appContent).toMatch(/Welcome|Home|Landing/i);
    expect(appContent).toMatch(/Document|Upload/i);
    expect(appContent).toMatch(/Review|Summary/i);
  });
});
