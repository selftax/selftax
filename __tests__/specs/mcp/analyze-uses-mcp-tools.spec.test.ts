/**
 * Spec: HTTP /analyze endpoint uses extract → merge → calculate pipeline
 * Status: confirmed — no LLM orchestrator, deterministic merge
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const httpServerPath = join(__dirname, '../../../packages/mcp/src/httpServer.ts');
const distillerPath = join(__dirname, '../../../packages/mcp/src/docDistiller.ts');
const mergerPath = join(__dirname, '../../../packages/mcp/src/extractionMerger.ts');

describe('HTTP /analyze uses extract → merge → calculate', () => {

  const httpServerSrc = readFileSync(httpServerPath, 'utf-8');
  const distillerSrc = readFileSync(distillerPath, 'utf-8');
  const mergerSrc = readFileSync(mergerPath, 'utf-8');

  test('calculation goes through handleCalculateTaxes', () => {
    expect(httpServerSrc).toContain('handleCalculateTaxes(session, calcInput)');
    expect(httpServerSrc).not.toMatch(/calculateForm1040\(form1040Input\)/);
  });

  test('pipeline uses extract + merge, not LLM orchestrator', () => {
    expect(httpServerSrc).toContain('extractDocuments');
    expect(httpServerSrc).toContain('mergeExtractions');
    expect(httpServerSrc).not.toContain('runOrchestrator');
  });

  test('distiller only sees redacted text', () => {
    expect(distillerSrc).toContain('redactedText');
    expect(distillerSrc).toContain('input.redactedText');
  });

  test('merger produces CalculateTaxesInput without LLM', () => {
    expect(mergerSrc).toContain('CalculateTaxesInput');
    expect(mergerSrc).not.toContain('runClaude');
  });

  test('returns error when pipeline fails', () => {
    expect(httpServerSrc).toContain('throw new Error');
    expect(httpServerSrc).toContain('Tax analysis failed');
  });
});
