/**
 * Send a full /analyze request to the local server, simulating what
 * the extension does after pre-merging structured fields.
 *
 * Run: npx tsx scripts/send-to-server.ts
 */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import {
  extractStructuredFields,
  mergeStructuredExtractions,
} from '../packages/tax-core/src/forms';
import type { StructuredExtraction } from '../packages/tax-core/src/forms/structuredExtractor';

const DOC_DIR = resolve(process.env.HOME!, 'Downloads/2025taxesCopy');
const SERVER = 'http://localhost:3742';

async function extractText(filePath: string): Promise<string> {
  const { extractTextFromPDF } = await import('../packages/mcp/src/extraction/pdfExtractor.js');
  const td = mkdtempSync(join(tmpdir(), 'st-'));
  const tf = join(td, 'test.pdf');
  writeFileSync(tf, readFileSync(filePath));
  const text = await extractTextFromPDF(tf);
  unlinkSync(tf);
  return text;
}

async function main() {
  const files = readdirSync(DOC_DIR).sort();
  const structured: StructuredExtraction[] = [];
  const unstructuredDocs: Array<{ type: string; redactedText: string; fields: Record<string, string | number>; fileName?: string; fileData?: string }> = [];

  console.log('=== Phase 1: Extract + classify ===');
  for (const file of files) {
    const filePath = join(DOC_DIR, file);

    if (file.endsWith('.pdf')) {
      const text = await extractText(filePath);
      const result = extractStructuredFields(text);
      if (result && Object.keys(result).filter(k => k !== 'formType').length >= 1) {
        console.log(`  ✓ ${file} → structured (${result.formType})`);
        structured.push(result);
      } else {
        // Send tokenized text (for this test, send raw — PII is in the server's hands)
        const type = file.toLowerCase().includes('property') ? 'property-tax-bill'
          : file.toLowerCase().includes('child') ? 'daycare-statement'
          : file.toLowerCase().includes('1095') ? 'other'
          : file.toLowerCase().includes('tip') ? 'other'
          : file.toLowerCase().includes('de_minimis') ? 'other'
          : 'other';
        console.log(`  ○ ${file} → LLM (${type})`);
        unstructuredDocs.push({ type, redactedText: text, fields: {} });
      }
    } else if (file.endsWith('.xls') || file.endsWith('.xlsx')) {
      // Send as base64 for server-side extraction
      const fileData = readFileSync(filePath).toString('base64');
      console.log(`  ○ ${file} → server XLS`);
      unstructuredDocs.push({ type: 'other', redactedText: '', fields: {}, fileName: file, fileData });
    }
  }

  console.log(`\nStructured: ${structured.length} | Unstructured: ${unstructuredDocs.length}`);

  // Phase 2: Pre-merge structured (same as browser)
  console.log('\n=== Phase 2: Pre-merge structured ===');
  const merged = mergeStructuredExtractions(structured, 'mfj', 2025);

  const mergedFields: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (k === 'filingStatus' || k === 'taxYear' || k === 'scheduleEInput') continue;
    if (v != null && typeof v !== 'object') {
      const fieldName = k === 'otherIncome' ? 'taxableInterest' : k;
      mergedFields[fieldName] = v;
    }
  }
  const se = merged.scheduleEInput;
  if (se) {
    if (se.mortgageInterest) mergedFields['rentalMortgageInterest'] = se.mortgageInterest;
    if (se.propertyTaxes) mergedFields['rentalPropertyTax'] = se.propertyTaxes;
    if (se.insurance) mergedFields['rentalInsurance'] = se.insurance;
    if (se.depreciation) mergedFields['depreciation'] = se.depreciation;
    if (se.priorYearUnallowedLoss) mergedFields['priorYearUnallowedLoss'] = se.priorYearUnallowedLoss;
  }

  console.log('Pre-merged fields:');
  for (const [k, v] of Object.entries(mergedFields)) {
    console.log(`  ${k}: ${v}`);
  }

  // Mark as current tax year so server doesn't treat as prior-year
  mergedFields['documentTaxYear'] = 2025;

  // Build the full document array
  const documents = [
    { type: 'w2', redactedText: '', fields: mergedFields },
    ...unstructuredDocs,
  ];

  // Phase 3: Send to server
  console.log(`\n=== Phase 3: POST /analyze (${documents.length} docs) ===`);
  const body = {
    profile: {
      filingStatus: 'mfj',
      stateOfResidence: 'CA',
      dependentCount: 2,
    },
    documents,
  };

  const start = Date.now();
  const response = await fetch(`${SERVER}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!response.ok) {
    console.error(`Server error: ${response.status}`);
    const text = await response.text();
    console.error(text.slice(0, 500));
    return;
  }

  const result = await response.json();
  console.log(`\n=== Result (${elapsed}s) ===`);
  console.log('Summary:', JSON.stringify(result.summary, null, 2));

  console.log('\nField maps:');
  for (const [form, fields] of Object.entries(result.fieldMaps as Record<string, Record<string, unknown>>)) {
    console.log(`  ${form}: ${Object.keys(fields).length} fields`);
    for (const [field, value] of Object.entries(fields)) {
      console.log(`    ${field}: ${value}`);
    }
  }
}

main().catch(console.error);
