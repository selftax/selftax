/**
 * Constraint: Per-Document-Type Extraction Templates
 *
 * Scope: packages/mcp/src/docDistiller.ts
 *
 * Decision: Each document type gets a focused extraction template with only
 * the fields relevant to that type. Ambiguous documents (receipt, other,
 * statement) are classified first (Haiku), then extracted with the specific
 * template (Sonnet). Known IRS forms skip classification.
 *
 * REQUIRE: TYPE_TEMPLATES has entries for all common IRS form types
 * REQUIRE: W-2 template only asks for wage-related fields (not rental, not capital gains)
 * REQUIRE: Prior-year-return template only asks for carryforward fields
 * REQUIRE: Classify-then-extract for ambiguous types (receipt, other, statement)
 * REQUIRE: Classification uses cheap model (Haiku) with limited text
 * REQUIRE: Extraction retries failed documents before aborting
 * DENY: Generic 40-field template used for typed documents
 * DENY: Single template for all document types
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const distillerSrc = readFileSync(join(__dirname, '../../packages/mcp/src/docDistiller.ts'), 'utf-8');

describe('Constraint: Per-Document-Type Extraction Templates', () => {

  test('has per-type templates (not a single generic template)', () => {
    expect(distillerSrc).toContain('TYPE_TEMPLATES');
    // Must have templates for key types
    expect(distillerSrc).toContain("'w2'");
    expect(distillerSrc).toContain("'1098'");
    expect(distillerSrc).toContain("'1099-int'");
    expect(distillerSrc).toContain("'1099-div'");
    expect(distillerSrc).toContain("'1099-b'");
    expect(distillerSrc).toContain("'1099-r'");
    expect(distillerSrc).toContain("'k-1'");
    expect(distillerSrc).toContain("'prior-year-return'");
  });

  test('W-2 template exists with wage fields', () => {
    // The w2 template string should contain wage-related extraction fields
    expect(distillerSrc).toMatch(/w2.*wages/s);
    expect(distillerSrc).toMatch(/w2.*federalWithholding/s);
  });

  test('prior-year-return template focuses on carryforward', () => {
    // The prior-year template should mention carryforward explicitly
    expect(distillerSrc).toMatch(/prior-year-return.*capitalLossCarryforward/s);
    expect(distillerSrc).toMatch(/prior-year-return.*depreciation/s);
    expect(distillerSrc).toMatch(/prior-year-return.*ONLY carryforward/s);
  });

  test('has specific templates for non-IRS documents', () => {
    expect(distillerSrc).toContain("'property-tax-bill'");
    expect(distillerSrc).toContain("'daycare-statement'");
    expect(distillerSrc).toContain("'charitable-receipt'");
    expect(distillerSrc).toContain("'medical-receipt'");
  });

  test('every document is classified by Haiku before extraction', () => {
    expect(distillerSrc).toContain('CLASSIFICATION_PROMPT');
    expect(distillerSrc).toContain('haiku');
    // No skip logic — all docs get classified
    expect(distillerSrc).not.toContain('SKIP_CLASSIFICATION');
    expect(distillerSrc).not.toContain('NEEDS_CLASSIFICATION');
  });

  test('classification uses cheap model with limited text', () => {
    expect(distillerSrc).toContain('CLASSIFICATION_PROMPT');
    expect(distillerSrc).toContain('haiku');
    // Should only read first N chars for classification
    expect(distillerSrc).toMatch(/slice\(0,\s*\d+\)/);
  });

  test('extraction retries failed documents', () => {
    expect(distillerSrc).toContain('MAX_RETRIES');
    expect(distillerSrc).toContain('Retry');
    // Should throw on complete failure, not silently continue
    expect(distillerSrc).toContain('throw new Error');
    expect(distillerSrc).toContain('Cannot proceed with incomplete data');
  });

  test('builds prompt from document type', () => {
    expect(distillerSrc).toContain('buildExtractionPrompt');
    expect(distillerSrc).toContain('documentType');
  });
});
