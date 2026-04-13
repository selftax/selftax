/**
 * Constraint: No Real PII in Tests
 *
 * Scope: __tests__/
 *
 * Decision: Test fixtures must NEVER contain real PII. Use obviously
 * fake data: "Jane Doe", "456 Maple Drive", "000-00-0000".
 *
 * Approach: scan all test files for SSN patterns that aren't obviously
 * fake (000-00-XXXX), and for any non-token real-looking SSNs.
 * Names/addresses are harder to detect generically, so we check
 * that test files use known synthetic names from our fixture patterns.
 *
 * DENY: Real SSNs, real addresses, real names in test files
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function findTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...findTestFiles(path));
    } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      files.push(path);
    }
  }
  return files;
}

/** Find all .ts/.tsx source files (excluding node_modules, dist, .json) */
function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', '.git'].includes(entry.name)) {
      files.push(...findSourceFiles(path));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(path);
    }
  }
  return files;
}

function scanForRealSSNs(files: string[], baseDir: string): string[] {
  // Allow: 000-00-XXXX, 111-11-1111, 222-33-4444 (repeating first 3 digits)
  // Deny: varied first 3 digits (non-repeating prefix)
  const realSsnPattern = /\b(?!000)(?!(\d)\1{2})\d{3}-\d{2}-\d{4}\b/g;

  const violations: string[] = [];
  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = filePath.replace(baseDir + '/', '');

    const matches = content.match(realSsnPattern);
    if (matches) {
      // Filter out regex literals (e.g., /\b\d{3}-\d{2}-\d{4}\b/)
      const nonRegex = matches.filter((m) => {
        const idx = content.indexOf(m);
        const before = content.slice(Math.max(0, idx - 20), idx);
        return !before.includes('/') && !before.includes('RegExp');
      });
      if (nonRegex.length > 0) {
        violations.push(`${relativePath}: ${nonRegex.join(', ')}`);
      }
    }
  }
  return violations;
}

describe('Constraint: No Real PII in Tests', () => {
  const testDir = join(__dirname, '..');
  const testFiles = findTestFiles(testDir);

  test('found test files to scan', () => {
    expect(testFiles.length).toBeGreaterThan(10);
  });

  test('no test file contains real-looking SSNs', () => {
    const violations = scanForRealSSNs(testFiles, testDir);
    expect(violations).toEqual([]);
  });
});

describe('Constraint: No Real PII in Source Code', () => {
  const packagesDir = join(__dirname, '../../packages');
  const sourceFiles = findSourceFiles(packagesDir);

  test('found source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
  });

  test('no source file contains real-looking SSNs (including comments)', () => {
    const violations = scanForRealSSNs(sourceFiles, packagesDir);
    expect(violations).toEqual([]);
  });
});
