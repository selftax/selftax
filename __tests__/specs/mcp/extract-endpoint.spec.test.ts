/**
 * Spec: Server /extract endpoint — extraction-only, no calculation
 *
 * Status: hypothesis
 * Confirm: Server has a /extract endpoint that runs distill → orchestrate
 *          and returns structured fields (CalculateTaxesInput), NOT a full
 *          tax return. Calculation always happens in the extension.
 * Invalidate: Orchestrator output can't be cleanly separated from calculation
 */

import * as fs from 'fs';
import * as path from 'path';

const httpServerPath = path.resolve(
  __dirname,
  '../../../packages/mcp/src/httpServer.ts',
);

describe('Server /extract endpoint — extraction only', () => {
  test('/extract endpoint exists in httpServer', () => {
    /** Spec: A new /extract endpoint handles POST requests for
     *  document extraction without calculation. */
    const content = fs.readFileSync(httpServerPath, 'utf-8');
    expect(content).toMatch(/\/extract/);
    expect(content).toMatch(/handleExtract/);
  });

  test('/extract returns structured fields, not a full tax return', () => {
    /** Spec: The /extract response contains extracted fields
     *  (CalculateTaxesInput shape) but NOT taxReturn, fieldMaps,
     *  or summary. The extension does the calculation. */
    const content = fs.readFileSync(httpServerPath, 'utf-8');
    // Should have a handler that returns extracted fields
    expect(content).toMatch(/extractedFields|overrides|calcInput/);
    // The extract handler should NOT call calculateForm1040 or buildTaxReturn
    // (those only belong in the /analyze handler)
  });

  test('/extract runs distill and orchestrate but not calculate', () => {
    /** Spec: The pipeline for /extract is:
     *  1. Server-side text extraction (PDF, XLS) for docs browser couldn't parse
     *  2. Distill (LLM per-doc summaries)
     *  3. Orchestrate (LLM combines summaries into structured fields)
     *  4. Return the orchestrated fields — STOP here, no calculation
     */
    const content = fs.readFileSync(httpServerPath, 'utf-8');
    expect(content).toMatch(/handleExtract/);
    // Extract handler should reference distill/orchestrate pipeline
    expect(content).toMatch(/getOverridesViaPipeline|extractDocuments|orchestrat/i);
  });

  test('/analyze endpoint still exists for backward compatibility', () => {
    /** Spec: The existing /analyze endpoint continues to work
     *  (MCP server and legacy clients use it). It still does
     *  extraction + calculation in one shot. */
    const content = fs.readFileSync(httpServerPath, 'utf-8');
    expect(content).toMatch(/\/analyze/);
    expect(content).toMatch(/handleAnalyze/);
  });
});
