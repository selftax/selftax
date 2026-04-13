/**
 * Spec: Extension Settings — Processing Mode Selector
 *
 * Status: hypothesis
 * Confirm: The extension has a settings tab with three processing modes
 *          (Local Only, Local Server, Cloud) that controls how unstructured
 *          documents are handled. Port is configurable for local server mode.
 * Invalidate: Settings don't persist or mode isn't wired into extraction flow.
 */

import * as fs from 'fs';
import * as path from 'path';

const extDir = path.resolve(__dirname, '../../../packages/extension');
const popupTs = fs.readFileSync(path.join(extDir, 'popup.ts'), 'utf-8');
const popupHtml = fs.readFileSync(path.join(extDir, 'popup.html'), 'utf-8');
const backgroundTs = fs.readFileSync(path.join(extDir, 'background.ts'), 'utf-8');
const analyzeTs = fs.readFileSync(
  path.join(extDir, 'src/services/analyzeService.ts'),
  'utf-8',
);

describe('Extension Settings — Processing Mode', () => {
  // ── Settings UI ────────────────────────────────────────────

  test('popup has a settings button in the header', () => {
    expect(popupHtml).toMatch(/settings-btn/);
    expect(popupHtml).toMatch(/settings-button/);
  });

  test('popup defines three processing modes: local, localhost, cloud', () => {
    expect(popupTs).toContain("'local'");
    expect(popupTs).toContain("'localhost'");
    expect(popupTs).toContain("'cloud'");
  });

  test('cloud mode is disabled with a coming soon badge', () => {
    expect(popupTs).toMatch(/cloud.*disabled.*true/s);
    expect(popupTs).toMatch(/COMING SOON/);
  });

  test('default mode is local (no server)', () => {
    // loadMode falls back to 'local' when nothing is stored
    expect(popupTs).toMatch(/currentMode.*=.*'local'/);
  });

  test('settings renders a mode selector with radio buttons', () => {
    expect(popupTs).toMatch(/renderSettings/);
    expect(popupTs).toMatch(/type="radio".*name="mode"/);
  });

  // ── Mode persistence ───────────────────────────────────────

  test('mode is saved to chrome.storage', () => {
    expect(popupTs).toMatch(/chrome\.storage\.local\.set.*processingMode/);
  });

  test('mode is loaded from chrome.storage on init', () => {
    expect(popupTs).toMatch(/chrome\.storage\.local\.get.*processingMode/);
    expect(popupTs).toMatch(/await loadMode/);
  });

  // ── Port configuration ─────────────────────────────────────

  test('port is configurable and defaults to 3742', () => {
    expect(popupTs).toMatch(/serverPort.*=.*3742/);
  });

  test('port input is shown when localhost mode is selected', () => {
    expect(popupTs).toMatch(/currentMode === 'localhost'.*server-port-input/s);
  });

  test('port is saved to chrome.storage', () => {
    expect(popupTs).toMatch(/chrome\.storage\.local\.set.*serverPort/);
  });

  // ── Mode wired into extraction flow ────────────────────────

  test('unstructured docs show server button only in localhost mode', () => {
    // In localhost mode, the send-btn is shown
    expect(popupTs).toMatch(/currentMode === 'localhost'.*send-btn/s);
    // In local mode, a warning message is shown instead
    expect(popupTs).toMatch(/Local Only mode/);
    expect(popupTs).toMatch(/switch to.*Local Server.*mode in Settings/);
  });

  // ── Port used in server calls ──────────────────────────────

  test('background worker reads port from chrome.storage', () => {
    expect(backgroundTs).toMatch(/chrome\.storage\.local\.get.*serverPort/);
    expect(backgroundTs).not.toMatch(/fetch\('http:\/\/localhost:3742/);
  });

  test('analyzeService reads port from chrome.storage', () => {
    expect(analyzeTs).toMatch(/chrome\.storage\.local\.get.*serverPort/);
    expect(analyzeTs).not.toMatch(/const API_URL = /);
  });

  test('no hardcoded localhost:3742 in background or analyzeService', () => {
    expect(backgroundTs).not.toContain("'http://localhost:3742");
    expect(analyzeTs).not.toContain("'http://localhost:3742");
  });

  // ── CSS styles for settings ────────────────────────────────

  test('popup.html has styles for mode options', () => {
    expect(popupHtml).toMatch(/\.mode-option/);
    expect(popupHtml).toMatch(/\.mode-label/);
    expect(popupHtml).toMatch(/\.mode-badge/);
  });
});
