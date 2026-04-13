/**
 * Spec: Classify → Extract → Merge Pipeline (no orchestrator LLM)
 * Status: confirmed — every document classified by Haiku, extracted to JSON
 * by Sonnet with a per-type template, then merged deterministically.
 * Confirm: classify → extract → merge → calculate, no orchestrator
 * Invalidate: pipeline reverts to LLM orchestrator or generic templates
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const distillerPath = join(__dirname, '../../../packages/mcp/src/docDistiller.ts');
const mergerPath = join(__dirname, '../../../packages/mcp/src/extractionMerger.ts');
const httpServerPath = join(__dirname, '../../../packages/mcp/src/httpServer.ts');

describe('Extract → Merge Pipeline', () => {

  const distillerSrc = readFileSync(distillerPath, 'utf-8');
  const mergerSrc = readFileSync(mergerPath, 'utf-8');
  const httpServerSrc = readFileSync(httpServerPath, 'utf-8');

  test('distiller outputs structured JSON (TaxDocumentExtraction)', () => {
    expect(distillerSrc).toContain('TaxDocumentExtraction');
    expect(distillerSrc).toContain('JSON');
    expect(distillerSrc).toContain('rentalUnits');
  });

  test('distiller runs in parallel — one agent per document', () => {
    expect(distillerSrc).toContain('Promise.allSettled');
    expect(distillerSrc).toContain('extractDocument');
  });

  test('distiller passes full document text — no truncation', () => {
    expect(distillerSrc).toContain('input.redactedText');
    expect(distillerSrc).not.toContain('maxLen');
  });

  test('merger is pure TypeScript — no LLM call', () => {
    expect(mergerSrc).not.toContain('runClaude');
    expect(mergerSrc).not.toContain('spawn');
    expect(mergerSrc).toContain('mergeExtractions');
  });

  test('merger sums rental units from multiple documents', () => {
    expect(mergerSrc).toContain('allRentalUnits');
    expect(mergerSrc).toContain('flatMap');
    expect(mergerSrc).toContain('grossRentalIncome');
  });

  test('QBI derivation handled by calculateTaxes, not merger', () => {
    // Merger passes through explicit QBI but doesn't derive it
    expect(mergerSrc).toContain('qbiIncome');
    expect(mergerSrc).not.toContain('netRental');
  });

  test('pipeline is extract → merge → calculate (no orchestrator)', () => {
    expect(httpServerSrc).toContain('extractDocuments');
    expect(httpServerSrc).toContain('mergeExtractions');
    expect(httpServerSrc).toContain('handleCalculateTaxes');
    expect(httpServerSrc).not.toContain('runOrchestrator');
  });

  test('pipeline errors when all extractions fail', () => {
    expect(httpServerSrc).toContain('All extractions failed');
  });

  test('every document is classified by Haiku before extraction', () => {
    expect(distillerSrc).toContain('CLASSIFICATION_PROMPT');
    expect(distillerSrc).toContain('haiku');
  });

  test('prior-year returns use regex extraction, not LLM', () => {
    expect(distillerSrc).toContain('extractPriorYearByRegex');
    expect(distillerSrc).toContain("model: 'regex'");
  });

  test('classification uses only first 2000 chars for speed', () => {
    expect(distillerSrc).toMatch(/slice\(0,\s*2000\)/);
  });

  test('per-type templates exist for focused extraction', () => {
    expect(distillerSrc).toContain('TYPE_TEMPLATES');
    expect(distillerSrc).toContain('buildExtractionPrompt');
  });

  test('server does not pre-classify documents — Haiku handles it', () => {
    // httpServer should NOT run detectDocumentType or set documentType
    expect(httpServerSrc).not.toContain('detectDocumentType');
    expect(httpServerSrc).not.toContain('documentType: docType');
  });

  test('distiller retries failed extractions before aborting', () => {
    expect(distillerSrc).toContain('MAX_RETRIES');
    expect(distillerSrc).toContain('Cannot proceed with incomplete data');
  });
});
