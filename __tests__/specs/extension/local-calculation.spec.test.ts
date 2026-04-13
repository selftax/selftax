/**
 * Spec: Extension always calculates locally
 *
 * Status: hypothesis
 * Confirm: The extension popup ALWAYS runs calculateInBrowser for the final
 *          tax return, regardless of whether fields came from local extraction
 *          or server extraction. The server never returns a calculated return.
 * Invalidate: Some edge case requires server-side calculation
 */

import * as fs from 'fs';
import * as path from 'path';

const popupPath = path.resolve(
  __dirname,
  '../../../packages/extension/popup.ts',
);
const backgroundPath = path.resolve(
  __dirname,
  '../../../packages/extension/background.ts',
);
const browserCalcPath = path.resolve(
  __dirname,
  '../../../packages/extension/src/services/browserCalculator.ts',
);

describe('Extension always calculates locally', () => {
  test('popup calls calculateInBrowser for structured-only docs', () => {
    /** Spec: When all docs are structured, popup calls calculateInBrowser
     *  directly with the extracted StructuredExtraction fields. */
    const content = fs.readFileSync(popupPath, 'utf-8');
    expect(content).toContain('calculateInBrowser');
    expect(content).toContain('handleCalculateLocally');
  });

  test('popup calls /extract then calculateInBrowser for mixed docs', () => {
    /** Spec: When unstructured docs exist, popup sends them to the background
     *  worker which calls /extract to get structured fields, then popup merges
     *  with local fields and calls calculateInBrowser. Server never returns a full return. */
    const popupContent = fs.readFileSync(popupPath, 'utf-8');
    const bgContent = fs.readFileSync(backgroundPath, 'utf-8');
    // Background worker calls /extract endpoint
    expect(bgContent).toMatch(/\/extract/);
    // Popup delegates via EXTRACT_REQUEST message
    expect(popupContent).toContain('EXTRACT_REQUEST');
    // Should still call calculateInBrowser after getting server fields
    expect(popupContent).toContain('calculateInBrowser');
  });

  test('popup does not call /analyze endpoint', () => {
    /** Spec: The popup should never call the /analyze endpoint which
     *  returns a pre-calculated return. All calculation is local. */
    const content = fs.readFileSync(popupPath, 'utf-8');
    // Should NOT reference /analyze (the old all-in-one endpoint)
    expect(content).not.toMatch(/localhost:3742\/analyze/);
  });

  test('handleSendToServer delegates to background worker and calculates locally', () => {
    /** Spec: The server send flow:
     *  1. Popup sends EXTRACT_REQUEST to background worker
     *  2. Background worker POSTs redacted docs to /extract
     *  3. Background worker stores result in chrome.storage
     *  4. Popup merges server fields with locally-extracted structured fields
     *  5. Popup runs calculateInBrowser with all merged fields */
    const popupContent = fs.readFileSync(popupPath, 'utf-8');
    const bgContent = fs.readFileSync(backgroundPath, 'utf-8');
    expect(bgContent).toMatch(/\/extract/);
    expect(bgContent).toContain('storedServerOverrides');
    expect(popupContent).toContain('calculateFromStoredData');
  });

  test('browserCalculator accepts both StructuredExtraction and server-extracted fields', () => {
    /** Spec: calculateInBrowser should be able to accept fields from
     *  both local extraction (StructuredExtraction) and server extraction
     *  (CalculateTaxesInput / overrides). Both get merged into the same
     *  calculation pipeline. */
    const content = fs.readFileSync(browserCalcPath, 'utf-8');
    expect(content).toContain('calculateInBrowser');
    // Should accept or merge server-provided overrides
    expect(content).toMatch(/overrides|serverFields|calcInput/);
  });
});
