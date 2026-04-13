/**
 * HTTP API Server for SelfTax
 *
 * Exposes tax analysis as a simple HTTP endpoint for the Chrome extension.
 *
 * POST /analyze
 *   Input:  { profile, documents: [{ type, redactedText, fields }] }
 *   Output: { taxReturn, fieldMaps, summary }
 *
 * Architecture: Instead of reimplementing extraction/calculation in parallel,
 * this endpoint loads documents into an MCP session, then either:
 *   1. (Claude available) Spawns Claude with MCP tools to analyze docs and
 *      determine the correct calculate_taxes overrides — same path as manual use.
 *   2. (Fallback) Uses regex parsers + form agents for basic extraction,
 *      then calls handleCalculateTaxes with best-effort overrides.
 *
 * The final calculation ALWAYS goes through handleCalculateTaxes (the MCP tool),
 * ensuring the HTTP path and MCP path produce the same result for the same inputs.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  mapW2Fields,
  aggregateW2s,
  aggregateAllDocuments,
  buildTaxReturn,
  toFreeFileFieldMap,
  irsRound,
  map1098Fields,
  map1099INTFields,
  map1099DIVFields,
  map1099NECFields,
  map1099BFields,
  calculateForm540,
  calculateScheduleE,
  calculateForm2441,
  calculateScheduleA,
} from '@selftax/core';
import type {
  FilingStatus,
  DocumentType,
  ParsedDocument,
  FormKey,
  ScheduleEInput,
} from '@selftax/core';
import {
  createSession,
  setProfile,
  addDocument,
  type Session,
  type SessionProfile,
} from './session.js';
import { handleCalculateTaxes, type CalculateTaxesInput } from './tools/calculateTaxes.js';

interface AnalyzeRequest {
  profile: {
    /** PII fields — optional, only used if provided (local MCP path) */
    firstName?: string;
    lastName?: string;
    ssn?: string;
    spouseFirstName?: string;
    spouseLastName?: string;
    spouseSsn?: string;
    address?: { street: string; city: string; state: string; zip: string };
    /** Required fields — no PII */
    filingStatus: FilingStatus;
    stateOfResidence?: string;
    dependentCount?: number;
    dependents?: Array<{
      firstName: string;
      lastName: string;
      ssn: string;
      relationship: string;
    }>;
  };
  documents: Array<{
    type: DocumentType;
    redactedText: string;
    rawText?: string;
    fields: Record<string, string | number>;
    fileName?: string;
    fileData?: string;
    pdfBase64?: string;
  }>;
  overrides?: CalculateTaxesInput;
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sendJSON(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// ── Load documents into MCP session ─────────────────────────────

function loadIntoSession(body: AnalyzeRequest): Session {
  const session = createSession();

  // Set profile — PII fields are optional (extension doesn't send them)
  const p = body.profile;
  const sessionProfile: SessionProfile = {
    firstName: p.firstName ?? 'Taxpayer',
    lastName: p.lastName ?? '',
    ssn: p.ssn ?? '000-00-0000',
    address: p.address ?? { street: '', city: '', state: p.stateOfResidence ?? '', zip: '' },
    filingStatus: p.filingStatus,
    stateOfResidence: p.stateOfResidence ?? '',
    dependents: p.dependents ?? Array.from({ length: p.dependentCount ?? 0 }, () => ({
      firstName: '', lastName: '', ssn: '', relationship: '',
    })),
  };
  setProfile(session, sessionProfile);

  // Add documents
  for (let i = 0; i < body.documents.length; i++) {
    const doc = body.documents[i];
    const text = doc.rawText || doc.redactedText;
    addDocument(session, {
      id: `doc-${i}`,
      fileName: doc.fileName ?? `${doc.type}-${i}`,
      mimeType: 'application/octet-stream',
      rawText: text,
      redactedText: doc.redactedText,
      piiDetections: [],
      fields: doc.fields,
      documentType: doc.type,
    });
  }

  return session;
}

// ── Extract server-side files (XLS, PDF that browser couldn't parse) ──

async function extractServerSideFiles(documents: AnalyzeRequest['documents']): Promise<AnalyzeRequest['documents']> {
  const result = [...documents];
  for (let i = 0; i < result.length; i++) {
    const doc = result[i];
    if (!doc.redactedText && doc.fileData) {
      console.log(`  Extracting server-side: ${doc.fileName ?? 'unknown'}`);
      try {
        const buf = Buffer.from(doc.fileData, 'base64');
        const ext = (doc.fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
        const tmpDir = mkdtempSync(join(tmpdir(), 'selftax-'));
        const tmpFile = join(tmpDir, doc.fileName ?? `doc.${ext}`);
        writeFileSync(tmpFile, buf);
        let text = '';
        if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
          const { parseSpreadsheet, spreadsheetToText } = await import('./extraction/spreadsheetParser.js');
          const parsed = await parseSpreadsheet(tmpFile);
          text = spreadsheetToText(parsed);
        } else if (ext === 'pdf') {
          const { extractTextFromPDF } = await import('./extraction/pdfExtractor.js');
          text = await extractTextFromPDF(tmpFile);
        }
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
        if (text) {
          result[i] = { ...doc, redactedText: text, rawText: text };
          console.log(`  → Extracted ${text.length} chars from ${doc.fileName}`);
        }
      } catch (err) {
        console.error(`  → Failed to extract ${doc.fileName}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return result;
}

// ── Pipeline: extract from documents → merge → calculate ──

async function getOverridesViaPipeline(
  _session: Session,
  documents: AnalyzeRequest['documents'],
): Promise<CalculateTaxesInput | null> {
  const pipelineStart = Date.now();

  // Separate documents with browser-extracted fields from those needing LLM
  const browserExtractions: Array<Record<string, unknown>> = [];
  const docsNeedingLlm: AnalyzeRequest['documents'] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const fieldCount = Object.keys(doc.fields).filter((k) => k !== 'sourceDocument').length;
    if (fieldCount > 0) {
      const fileName = doc.fileName ?? `${doc.type}-${i}`;
      const extraction = { sourceDocument: fileName, ...doc.fields };
      const fieldSummary = Object.entries(doc.fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      console.log(`[Structured] --- ${fileName} --- ${fieldSummary}`);
      browserExtractions.push(extraction);
    } else {
      docsNeedingLlm.push(doc);
    }
  }

  if (browserExtractions.length > 0) {
    console.log(`[Pipeline] ${browserExtractions.length} doc(s) from structured extraction (no LLM), ${docsNeedingLlm.length} doc(s) need LLM`);
  }

  // Extract from LLM-requiring docs (if any)
  let llmExtractions: Array<Record<string, unknown>> = [];
  if (docsNeedingLlm.length > 0) {
    const { isClaudeAvailable } = await import('./claudeRunner.js');
    if (!(await isClaudeAvailable())) {
      if (browserExtractions.length === 0) {
        console.error('[Pipeline] Claude CLI not available and no structured data');
        return null;
      }
      console.warn('[Pipeline] Claude CLI not available — using structured data only');
    } else {
      const { extractDocuments } = await import('./docDistiller.js');
      const docsToExtract = docsNeedingLlm
        .filter((d) => d.redactedText || d.pdfBase64)
        .map((d, i) => ({
          fileName: d.fileName ?? `${d.type}-${i}`,
          redactedText: d.redactedText,
          documentType: (d.type as string) !== 'unknown' ? d.type as string : undefined,
          pdfBase64: d.pdfBase64,
        }));
      for (const d of docsToExtract) {
        console.log(`[Extract] ${d.fileName}: type=${d.documentType ?? 'none'}`);
      }
      console.log(`[Extract] LLM docs: ${docsToExtract.map(d => d.fileName).join(', ')}`);

      const extractResult = await extractDocuments(docsToExtract);

      for (const r of extractResult.results) {
        const fields = Object.entries(r.extraction)
          .filter(([k, v]) => v != null && k !== 'sourceDocument')
          .map(([k, v]) => Array.isArray(v) ? `${k}[${v.length}]` : `${k}: ${v}`)
          .join(', ');
        console.log(`[Extract] --- ${r.fileName} --- ${fields}`);
      }

      llmExtractions = extractResult.results.map((r) => r.extraction as unknown as Record<string, unknown>);

      const pipelineCost = extractResult.stats.totalCost.toFixed(4);
      console.log(`[Pipeline] LLM extraction: ${extractResult.stats.calls} calls, $${pipelineCost}`);
    }
  }

  // Merge all extractions (structured + LLM)
  console.log(`[Pipeline] Merging: ${browserExtractions.length} structured + ${llmExtractions.length} LLM = ${browserExtractions.length + llmExtractions.length} total`);
  const allExtractions = [...browserExtractions, ...llmExtractions];

  if (allExtractions.length === 0) {
    console.error('[Pipeline] All extractions failed');
    return null;
  }

  const { mergeExtractions } = await import('./extractionMerger.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overrides = mergeExtractions(allExtractions as any);

  if (Object.keys(overrides).length === 0) {
    console.error('[Pipeline] Merge produced no overrides');
    return null;
  }

  const pipelineElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`[Pipeline] Complete in ${pipelineElapsed}s`);
  console.log('[Pipeline] Overrides:', JSON.stringify(overrides, null, 2));
  return overrides;
}


// ── /extract handler — extraction only, no calculation ─────────

async function handleExtract(body: AnalyzeRequest) {
  // 1. Extract server-side files (XLS, PDF)
  body.documents = await extractServerSideFiles(body.documents);

  // 2. Load into session (needed by pipeline)
  const session = loadIntoSession(body);

  // 3. Run distill → orchestrate to get structured fields
  const calcInput = await getOverridesViaPipeline(session, body.documents);
  if (calcInput === null) {
    throw new Error(
      'Extraction failed: Claude could not analyze your documents. ' +
      'Please check that Claude CLI is installed and try again.',
    );
  }

  // 4. Return extracted fields — NO calculation, NO buildTaxReturn
  return { extractedFields: calcInput };
}


// ── Main /analyze handler ───────────────────────────────────────

async function handleAnalyze(body: AnalyzeRequest) {
  const { profile } = body;

  // 1. Extract server-side files (XLS, PDF)
  body.documents = await extractServerSideFiles(body.documents);

  // 2. Load everything into an MCP session
  const session = loadIntoSession(body);

  // 3. Determine calculate_taxes overrides
  //    Either from explicit overrides or Claude analysis
  let calcInput: CalculateTaxesInput;
  if (body.overrides && Object.keys(body.overrides).length > 0) {
    calcInput = body.overrides;
    console.log('[Analyze] Using explicit overrides from request');
  } else {
    const orchestratorResult = await getOverridesViaPipeline(session, body.documents);
    if (orchestratorResult === null) {
      throw new Error(
        'Tax analysis failed: Claude could not analyze your documents. ' +
        'Please check that Claude CLI is installed and try again, or provide manual overrides.',
      );
    }
    calcInput = orchestratorResult;
  }

  // Cache overrides for /recalculate
  lastOverrides = calcInput;

  // 4. Run calculation through handleCalculateTaxes (THE MCP TOOL)
  //    This ensures the HTTP path uses the exact same code as the MCP path.
  const calcResult = handleCalculateTaxes(session, calcInput);
  const calcData = JSON.parse(
    (calcResult.content as Array<{ text: string }>)[0].text,
  );

  // Log the full calculation result
  console.log('[Calculate] Form 1040:', JSON.stringify(calcData.form1040, null, 2));
  if (calcData.form540) {
    console.log('[Calculate] CA 540:', JSON.stringify(calcData.form540, null, 2));
  }

  // Log regex-extracted baselines for comparison
  const w2Docs = body.documents.filter((d) => d.type === 'w2');
  const w2FieldsList = w2Docs.map((d) => mapW2Fields(d.rawText || d.redactedText));
  const w2Agg = aggregateW2s(w2FieldsList);
  const parsedDocs: ParsedDocument[] = [];
  for (const doc of body.documents) {
    const text = doc.rawText || doc.redactedText;
    if (doc.type === '1098') {
      const f = map1098Fields(text);
      parsedDocs.push({ type: '1098', fields: { mortgageInterest: f.mortgageInterest ?? 0, pointsPaid: f.pointsPaid ?? 0, mortgageInsurancePremiums: f.mortgageInsurancePremiums ?? 0, propertyTax: f.propertyTax ?? 0 } });
    } else if (doc.type === '1099-int') {
      const f = map1099INTFields(text);
      parsedDocs.push({ type: '1099-int', fields: { interestIncome: f.interestIncome ?? 0, federalTaxWithheld: f.federalTaxWithheld ?? 0 } });
    } else if (doc.type === '1099-div') {
      const f = map1099DIVFields(text);
      parsedDocs.push({ type: '1099-div', fields: { ordinaryDividends: f.ordinaryDividends ?? 0, qualifiedDividends: f.qualifiedDividends ?? 0, federalTaxWithheld: f.federalTaxWithheld ?? 0 } });
    } else if (doc.type === '1099-nec') {
      const f = map1099NECFields(text);
      parsedDocs.push({ type: '1099-nec', fields: { nonemployeeCompensation: f.nonemployeeCompensation ?? 0, federalTaxWithheld: f.federalTaxWithheld ?? 0 } });
    } else if (doc.type === '1099-b') {
      const f = map1099BFields(text);
      parsedDocs.push({ type: '1099-b', fields: { proceeds: f.proceeds ?? 0, costBasis: f.costBasis ?? 0, federalTaxWithheld: f.federalTaxWithheld ?? 0 } });
    }
  }
  const docAgg = aggregateAllDocuments(parsedDocs);
  console.log('[Regex baseline] W-2:', JSON.stringify({ wages: w2Agg.totalWages, fedWith: w2Agg.totalFederalWithholding, stateWith: w2Agg.totalStateTax }));
  console.log('[Regex baseline] Docs:', JSON.stringify(docAgg));

  // 5. Build the full TaxReturnData for form filling
  const form1040Output = calcData.form1040;
  const scheduleEInput = calcInput.scheduleEInput as ScheduleEInput | undefined;

  // Build Schedule A from calc results
  const primaryMortgage = calcInput.primaryMortgageInterest
    ? irsRound(calcInput.primaryMortgageInterest)
    : undefined;
  const scheduleAInput = {
    filingStatus: profile.filingStatus,
    stateIncomeTax: calcInput.stateWithholding ?? (w2Agg.totalStateTax || undefined),
    mortgageInterest: primaryMortgage && primaryMortgage > 0 ? primaryMortgage : undefined,
    primaryPropertyTax: calcInput.primaryPropertyTax || undefined,
  };
  const scheduleAOutput = calculateScheduleA(scheduleAInput);

  // CA Form 540
  let form540Output = undefined;
  const caWithholding = calcInput.stateWithholding ?? (w2Agg.totalStateTax || undefined);
  if (profile.stateOfResidence?.toUpperCase() === 'CA') {
    form540Output = calculateForm540({
      filingStatus: profile.filingStatus,
      federalAGI: form1040Output.agi,
      caWithholding,
      dependentCount: profile.dependents?.length ?? profile.dependentCount ?? 0,
      primaryPropertyTax: calcInput.primaryPropertyTax,
      primaryMortgageInterest: calcInput.primaryMortgageInterest ? irsRound(calcInput.primaryMortgageInterest) : undefined,
    });
  }

  // Dependent care
  let form2441Output = undefined;
  if (calcInput.dependentCareExpenses && calcInput.dependentCareExpenses > 0) {
    form2441Output = calculateForm2441({
      qualifyingExpenses: calcInput.dependentCareExpenses,
      qualifyingPersons: Math.max(1, profile.dependents?.length ?? profile.dependentCount ?? 0),
      agi: form1040Output.agi,
    });
  }

  // Capital loss: mirror the cap from calculateForm1040 for line 7
  const capitalLossDeduction = calcInput.capitalLossCarryforward
    ? Math.min(calcInput.capitalLossCarryforward, 3000)
    : undefined;

  const seOutput = scheduleEInput ? calculateScheduleE(scheduleEInput) : undefined;
  const depCount = profile.dependents?.length ?? profile.dependentCount ?? 0;

  const taxReturn = buildTaxReturn({
    taxYear: 2025,
    filingStatus: profile.filingStatus,
    pii: {
      primary: { firstName: profile.firstName ?? '', lastName: profile.lastName ?? '', ssn: profile.ssn ?? '' },
      occupation: (calcInput as Record<string, unknown>).occupation as string | undefined,
      spouse: profile.spouseSsn ? {
        firstName: profile.spouseFirstName ?? '',
        lastName: profile.spouseLastName ?? '',
        ssn: profile.spouseSsn,
      } : undefined,
      dependents: profile.dependents ?? [],
      address: profile.address ?? { street: '', city: '', state: '', zip: '' },
      filingStatus: profile.filingStatus,
    },
    form1040: form1040Output,
    wages: calcInput.wages ?? w2Agg.totalWages,
    taxableInterest: calcInput.otherIncome ?? docAgg.totalInterestIncome,
    qualifiedDividends: calcInput.qualifiedDividends ?? docAgg.totalQualifiedDividends,
    ordinaryDividends: calcInput.ordinaryDividends ?? docAgg.totalOrdinaryDividends,
    capitalLossDeduction,
    qbiDeduction: form1040Output.qbiDeduction,
    qbiIncome: calcInput.qbiIncome,
    scheduleA: scheduleAOutput.shouldItemize ? { input: scheduleAInput, output: scheduleAOutput } : undefined,
    rentalProperties: scheduleEInput && seOutput ? [{
      address: 'Rental Property',
      propertyType: '2',
      fairRentalDays: 365,
      personalUseDays: 0,
      input: scheduleEInput,
      output: seOutput,
    }] : undefined,
    scheduleEAggregate: seOutput,
    form2441: form2441Output || undefined,
    form540: form540Output,
    totalDepreciation: scheduleEInput?.depreciation,
    w2Withholding: calcInput.federalWithholding ?? (w2Agg.totalFederalWithholding || undefined),
    caWithholding,
    qualifyingChildren: depCount > 0 ? depCount : undefined,
  });

  // Pre-compute Free File field maps
  const allFormKeys: FormKey[] = [
    'form1040', 'schedule1', 'schedule2', 'schedule3',
    'scheduleA', 'scheduleC', 'scheduleD', 'scheduleE', 'scheduleSE',
    'form2441', 'form4562', 'form6251',
    'form8812', 'form8863', 'form8880',
    'form8959', 'form8960', 'form8995', 'form5695',
    'ca540',
  ];
  const fieldMaps: Record<string, Record<string, string | number>> = {};
  for (const fk of allFormKeys) {
    const map = toFreeFileFieldMap(taxReturn, fk);
    if (Object.keys(map).length > 0) fieldMaps[fk] = map;
  }

  const summary = {
    taxYear: 2025,
    name: profile.firstName ? `${profile.firstName} ${profile.lastName}` : 'Taxpayer',
    filingStatus: profile.filingStatus,
    refundOrOwed: form1040Output.refundOrOwed,
    isRefund: form1040Output.isRefund,
    forms: Object.keys(fieldMaps),
    totalIncome: form1040Output.totalIncome,
    agi: form1040Output.agi,
    totalTax: form1040Output.totalTax,
  };

  return { taxReturn, fieldMaps, summary };
}

// Cache last analysis so /recalculate can regenerate field maps without re-extracting
let lastAnalyzeRequest: AnalyzeRequest | null = null;
let lastOverrides: CalculateTaxesInput | null = null;

export function startHttpServer(port = 3742): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJSON(res, 204, null);
      return;
    }

    if (req.method === 'POST' && req.url === '/analyze') {
      try {
        const rawBody = await parseBody(req);
        const body = JSON.parse(rawBody) as AnalyzeRequest;

        const requestStart = Date.now();
        console.log('\n=== /analyze request ===');
        console.log('Profile: Filing:', body.profile.filingStatus,
          '| State:', body.profile.stateOfResidence ?? 'N/A',
          '| Dependents:', body.profile.dependentCount ?? body.profile.dependents?.length ?? 0);
        console.log('Documents:', body.documents.length);
        for (const doc of body.documents) {
          const fieldCount = Object.keys(doc.fields).length;
          const label = fieldCount > 0
            ? `${fieldCount} structured fields`
            : `${doc.redactedText.length} chars`;
          console.log(`  - ${doc.fileName ?? doc.type}: ${label} (type: ${doc.type})`);
        }

        const result = await handleAnalyze(body);
        lastAnalyzeRequest = body;

        const totalSeconds = ((Date.now() - requestStart) / 1000).toFixed(1);
        console.log('[Result] Summary:', JSON.stringify(result.summary, null, 2));
        console.log('[Result] Field maps for extension:');
        for (const [form, fields] of Object.entries(result.fieldMaps)) {
          console.log(`  ${form}: ${Object.keys(fields).length} fields`);
          for (const [field, value] of Object.entries(fields)) {
            console.log(`    ${field}: ${value}`);
          }
        }
        console.log(`=== Complete in ${totalSeconds}s ===\n`);

        sendJSON(res, 200, result);
      } catch (err) {
        console.error('Error in /analyze:', err);
        sendJSON(res, 400, {
          error: err instanceof Error ? err.message : 'Invalid request',
        });
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/recalculate') {
      try {
        if (!lastAnalyzeRequest || !lastOverrides) {
          sendJSON(res, 400, { error: 'No previous analysis to recalculate. Run /analyze first.' });
          return;
        }
        console.log('\n=== /recalculate (reusing cached overrides) ===');
        // Re-run with cached overrides — skips the $2 extraction pipeline
        const body = { ...lastAnalyzeRequest, overrides: lastOverrides };
        const result = await handleAnalyze(body);
        console.log('[Result] Summary:', JSON.stringify(result.summary, null, 2));
        console.log('[Result] Field maps:', Object.entries(result.fieldMaps).map(([k, v]) => `${k}: ${Object.keys(v).length}`).join(', '));
        console.log('=== Recalculate complete ===\n');
        sendJSON(res, 200, result);
      } catch (err) {
        console.error('Error in /recalculate:', err);
        sendJSON(res, 400, { error: err instanceof Error ? err.message : 'Recalculation failed' });
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/extract') {
      try {
        const rawBody = await parseBody(req);
        const body = JSON.parse(rawBody) as AnalyzeRequest;

        const requestStart = Date.now();
        console.log('\n=== /extract request (extraction only, no calculation) ===');
        console.log('Documents:', body.documents.length);

        const result = await handleExtract(body);

        const totalSeconds = ((Date.now() - requestStart) / 1000).toFixed(1);
        console.log(`[Extract] Returned ${Object.keys(result.extractedFields).length} fields in ${totalSeconds}s`);
        console.log('=== Extract complete ===\n');

        sendJSON(res, 200, result);
      } catch (err) {
        console.error('Error in /extract:', err);
        sendJSON(res, 400, {
          error: err instanceof Error ? err.message : 'Extraction failed',
        });
      }
      return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      sendJSON(res, 200, { status: 'ok', service: 'selftax-api' });
      return;
    }

    sendJSON(res, 404, { error: 'Not found' });
  });

  server.listen(port, () => {
    console.log(`[SelfTax] HTTP API server running on http://localhost:${port}`);
  });

  return server;
}
