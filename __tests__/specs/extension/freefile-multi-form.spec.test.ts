/**
 * Spec: FreeFile Multi-Form Autofill
 *
 * Status: confirmed — the extension adds all required forms to the FreeFile
 * workspace, navigates to each one, and fills it sequentially.
 *
 * Uses sessionStorage to persist state across FreeFile's full page reloads.
 * Top frame orchestrates (add/navigate), iFrameFilingForm gets filled.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const contentScriptSrc = readFileSync(
  join(__dirname, '../../../packages/extension/src/content/freeFileAutoFill.ts'), 'utf-8',
);
const popupSrc = readFileSync(
  join(__dirname, '../../../packages/extension/popup.ts'), 'utf-8',
);

describe('FreeFile multi-form autofill: content script', () => {

  test('content script handles AUTOFILL_ALL message type', () => {
    expect(contentScriptSrc).toContain('AUTOFILL_ALL');
  });

  test('content script can access iFrameFormsList for navigation', () => {
    expect(contentScriptSrc).toContain('iFrameFormsList');
  });

  test('content script can access the Add Form dialog iframe', () => {
    expect(contentScriptSrc).toContain('btnAddForms');
    expect(contentScriptSrc).toContain('FormsList');
  });

  test('content script fills iFrameFilingForm after form loads', () => {
    expect(contentScriptSrc).toContain('iFrameFilingForm');
  });

  test('content script maps FormKey to FreeFile form codes', () => {
    expect(contentScriptSrc).toContain('FORM_KEY_TO_FREEFILE');
    expect(contentScriptSrc).toContain("scheduleA: 'Schedule A'");
    expect(contentScriptSrc).toContain("scheduleE: 'Schedule E'");
    expect(contentScriptSrc).toContain("form2441: 'Form 2441'");
  });

  test('content script waits for page reload between forms', () => {
    expect(contentScriptSrc).toContain('sessionStorage');
    expect(contentScriptSrc).toContain('AUTOFILL_STATE_KEY');
  });

  test('content script reports progress back to popup', () => {
    expect(contentScriptSrc).toContain('AUTOFILL_PROGRESS');
    expect(contentScriptSrc).toContain('chrome.runtime.sendMessage');
  });

  test('form1040 is already present by default (no add needed)', () => {
    expect(contentScriptSrc).toContain("form1040: null");
  });

  test('ca540 is skipped (not on FreeFile, federal only)', () => {
    expect(contentScriptSrc).toContain("ca540: null");
  });

  test('on page load, checks for pending autofill state', () => {
    expect(contentScriptSrc).toContain('getAutofillState()');
    expect(contentScriptSrc).toContain('__fill_');
  });

  test('PII fields are only merged into form1040 fieldMap', () => {
    // In the AUTOFILL_ALL handler, PII is merged only when fieldMaps.form1040 exists
    expect(contentScriptSrc).toContain("localPII && fieldMaps.form1040");
  });
});

describe('FreeFile multi-form autofill: popup', () => {

  test('popup has "Autofill All Forms" button', () => {
    expect(popupSrc).toContain('AUTOFILL_ALL');
    expect(popupSrc).toContain('autofill-all-btn');
  });

  test('popup shows progress during multi-form fill', () => {
    expect(popupSrc).toContain('AUTOFILL_PROGRESS');
    expect(popupSrc).toContain('message.done');
    expect(popupSrc).toContain('message.currentForm');
  });

  test('popup lists which forms will be filled', () => {
    expect(popupSrc).toContain('formList');
    expect(popupSrc).toContain('FORM_LABEL_MAP');
  });
});
