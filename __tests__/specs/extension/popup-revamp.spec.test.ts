/**
 * Spec: Extension Popup UI Revamp (1Password-style)
 *
 * Status: hypothesis
 * Confirm: The extension popup is the complete product experience —
 *          lock screen, document upload, vault view, autofill — with no
 *          "Open SelfTax" tab escape hatch. All interaction happens in the popup.
 * Invalidate: Chrome popup size constraints (800x600 max) make upload/review
 *             impractical — would need a side panel instead.
 */

import * as fs from 'fs';
import * as path from 'path';

const extDir = path.resolve(__dirname, '../../../packages/extension');

describe('Extension Popup UI Revamp', () => {
  // ────────────────────────────────────────────────────────────
  // Screen flow: lock → unlock → dashboard
  // ────────────────────────────────────────────────────────────

  test('popup has a lock screen as the default view', () => {
    /** Spec: When vault is set up and locked, the popup shows a password
     *  input with an "Unlock" button. No tax data visible until unlocked.
     *  This is the FIRST thing users see when clicking the extension icon. */
    const html = fs.readFileSync(path.join(extDir, 'popup.html'), 'utf-8');
    expect(html).toMatch(/lock|password|unlock/i);
  });

  test('popup has a first-time setup screen for creating a password', () => {
    /** Spec: When no vault exists (!isSetup), show a "Create Password" screen
     *  with password + confirm password inputs. This only appears once. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/renderSetup|renderCreatePassword|setupVault/);
  });

  test('popup shows dashboard after successful unlock', () => {
    /** Spec: After entering the correct password, the popup shows the main
     *  dashboard: return summary card, action buttons, vault access.
     *  Same info as current renderSavedReturn but within the popup. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/renderDashboard|renderMain/);
    expect(ts).toContain('unlock');
  });

  test('wrong password shows error without unlocking', () => {
    /** Spec: If unlock() returns false (wrong password), show an error
     *  message and stay on the lock screen. No data exposed. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/wrong|incorrect|invalid.*password/i);
  });

  // ────────────────────────────────────────────────────────────
  // No "Open SelfTax" tab — everything in popup
  // ────────────────────────────────────────────────────────────

  test('popup does not open a full-page tab for the main experience', () => {
    /** Spec: The popup IS the product. There should be no "Open SelfTax" button
     *  that opens index.html in a new tab. All core flows (upload, review,
     *  autofill) happen within the popup panel.
     *  Exception: links to external sites (FreeFile, IRS) can open new tabs. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    // Should NOT have openFullApp or chrome.tabs.create pointing to index.html
    expect(ts).not.toContain('openFullApp');
    expect(ts).not.toMatch(/chrome\.tabs\.create.*index\.html/);
  });

  // ────────────────────────────────────────────────────────────
  // Document upload in popup
  // ────────────────────────────────────────────────────────────

  test('popup has a document upload area', () => {
    /** Spec: Users can upload tax documents directly in the popup.
     *  File input or drag-and-drop zone. Supports PDF, images, Excel.
     *  After upload, triggers extraction + PII detection + storage. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/upload|file.*input|drag.*drop/i);
    expect(ts).toMatch(/\.pdf|\.xlsx|\.xls/i);
  });

  test('popup shows upload progress and extracted document list', () => {
    /** Spec: After uploading, show:
     *  1. Processing status per document (extracting → detected type → done)
     *  2. List of processed documents with detected types (W-2, 1099-INT, etc.)
     *  3. Summary of what was extracted (income sources, deductions found) */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/progress|processing|document.*list/i);
  });

  // ────────────────────────────────────────────────────────────
  // Profile/PII collection in popup
  // ────────────────────────────────────────────────────────────

  test('popup has a profile section for filing info', () => {
    /** Spec: Users enter filing status, dependents, state of residence.
     *  PII (name, SSN, address) can be extracted from uploaded docs
     *  or entered manually. Stored encrypted in vault. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/filingStatus|filing.*status/);
    expect(ts).toMatch(/dependent/i);
  });

  // ────────────────────────────────────────────────────────────
  // Vault view (field inspection)
  // ────────────────────────────────────────────────────────────

  test('popup vault view shows all stored fields grouped by form', () => {
    /** Spec: The vault view (existing renderFieldVault) remains but is now
     *  a core screen, not a toggle. Shows all field values grouped by form
     *  with human-readable labels. SSNs masked. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toContain('renderFieldVault');
    expect(ts).toContain('FORM_LABEL_MAP');
  });

  // ────────────────────────────────────────────────────────────
  // Autofill actions (same as before but gated by unlock)
  // ────────────────────────────────────────────────────────────

  test('autofill buttons only appear when vault is unlocked', () => {
    /** Spec: "Autofill All Forms" and "Autofill Current Form" buttons
     *  are only rendered after unlock. They must not be clickable
     *  when the vault is locked (PII not available). */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/isUnlocked|unlocked/);
    expect(ts).toContain('AUTOFILL_ALL');
    expect(ts).toContain('AUTOFILL_CURRENT');
  });

  test('autofill reads PII from vault manager, not raw chrome.storage', () => {
    /** Spec: The popup's field vault display and autofill must get PII through
     *  getPII() (which requires unlock), not by reading chrome.storage.local
     *  directly. The vault migration code in setupVault may still reference
     *  localPII for the one-time encryption migration. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/getPII/);
    // renderFieldVault should use getPII(), not chrome.storage.local.get('localPII')
    expect(ts).not.toMatch(/renderFieldVault[\s\S]*?chrome\.storage\.local\.get\(.*localPII/);
  });

  // ────────────────────────────────────────────────────────────
  // Popup dimensions
  // ────────────────────────────────────────────────────────────

  test('popup is sized for the full experience (wider than current 360px)', () => {
    /** Spec: 1Password's popup is ~400px wide and uses full height.
     *  The popup should be wide enough for form fields and tables.
     *  Chrome caps popup at 800x600, but 400-420px wide is the sweet spot. */
    const html = fs.readFileSync(path.join(extDir, 'popup.html'), 'utf-8');
    // Width should be >= 400px
    const widthMatch = html.match(/(?:width|min-width):\s*(\d+)px/);
    expect(widthMatch).not.toBeNull();
    expect(Number(widthMatch![1])).toBeGreaterThanOrEqual(400);
  });

  // ────────────────────────────────────────────────────────────
  // Lock button / manual lock
  // ────────────────────────────────────────────────────────────

  test('popup header has a lock button when unlocked', () => {
    /** Spec: A lock icon/button in the header lets users manually lock
     *  the vault (like 1Password's lock button). Clicking it calls lock()
     *  and returns to the password screen. */
    const ts = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
    expect(ts).toMatch(/lock.*button|btn.*lock/i);
  });
});
