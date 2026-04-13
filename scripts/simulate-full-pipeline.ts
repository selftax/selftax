/**
 * Simulate the full extension + server pipeline locally.
 * - Extract text from all PDFs in the tax folder
 * - Run structured extraction (same as browser)
 * - Hardcode LLM-extracted values from the last successful server run
 * - Merge all → calculate → show results
 *
 * Run: npx tsx scripts/simulate-full-pipeline.ts
 */

import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import {
  extractStructuredFields,
  mergeStructuredExtractions,
  buildTaxReturn,
  toFreeFileFieldMap,
} from '../packages/tax-core/src/forms';
import { calculateForm1040 as calcF1040 } from '../packages/tax-core/src/engine/form1040';
import { calculateScheduleA } from '../packages/tax-core/src/engine/scheduleA';
import { calculateScheduleE } from '../packages/tax-core/src/engine/scheduleE';
import { calculateForm2441 } from '../packages/tax-core/src/engine/form2441';
import { calculateForm540 } from '../packages/tax-core/src/engine/form540';
import { irsRound } from '../packages/tax-core/src/engine/form1040';
import type { StructuredExtraction } from '../packages/tax-core/src/forms/structuredExtractor';
import type { FormKey } from '../packages/tax-core/src/forms/pdfFieldMappings';

const DOC_DIR = resolve(process.env.HOME!, 'Downloads/2025taxesCopy');

async function extractText(filePath: string): Promise<string> {
  const { extractTextFromPDF } = await import('../packages/mcp/src/extraction/pdfExtractor.js');
  const tmpDir = mkdtempSync(join(tmpdir(), 'st-'));
  const tmpFile = join(tmpDir, 'test.pdf');
  writeFileSync(tmpFile, readFileSync(filePath));
  const text = await extractTextFromPDF(tmpFile);
  unlinkSync(tmpFile);
  return text;
}

// Verified values from actual documents (manually extracted)
const VERIFIED = {
  // childchare2025.pdf: sum of ACH payments in calendar year 2025
  // $1,555 + $1,555 + $1,555 + $2,330 + $1,820.05 + $3,210 = $12,025.05
  dependentCareExpenses: 12025.05,
  // DoloresPropertyTax.pdf: 2025-2026 total = $13,528.08 (primary residence)
  primaryPropertyTax: 13528.08,
  // 4x rental spreadsheets — tallied from DEC summary sheets:
  // #1: $26,700 | #2: $31,500 | #3: $28,500 | #4: $34,500 = $121,200
  grossRentalIncome: 121200,
  // #1: $1,602 | #2: $1,890 | #3: $1,710 | #4: $2,070 = $7,272
  managementFees: 7272,
  // #1: $2,325 | #2: $100 | #3: $0 | #4: $0 = $2,425
  repairs: 2425,
  // #1: $10,004.09 | #2-4: $0 = $10,004.09
  utilities: 10004.09,
};

async function main() {
  console.log('=== PHASE 1: Extract text + structured extraction (browser side) ===\n');

  const files = readdirSync(DOC_DIR).filter((f) => f.endsWith('.pdf')).sort();
  const structured: StructuredExtraction[] = [];
  const unstructured: string[] = [];

  for (const file of files) {
    const filePath = join(DOC_DIR, file);
    const text = await extractText(filePath);
    const result = extractStructuredFields(text);

    if (result && Object.keys(result).filter((k) => k !== 'formType').length >= 1) {
      console.log(`  ✓ ${file} → ${result.formType} (${Object.keys(result).length - 1} fields)`);
      structured.push(result);
    } else {
      console.log(`  ○ ${file} → LLM needed`);
      unstructured.push(file);
    }
  }

  console.log(`\nStructured: ${structured.length} docs | LLM needed: ${unstructured.length} docs`);

  console.log('\n=== PHASE 2: Merge structured extractions ===\n');

  const merged = mergeStructuredExtractions(structured, 'mfj', 2025);
  console.log('Merged (structured only):');
  for (const [k, v] of Object.entries(merged)) {
    if (k === 'filingStatus' || k === 'taxYear') continue;
    if (v != null && typeof v !== 'object') console.log(`  ${k}: ${v}`);
    if (v != null && typeof v === 'object') {
      console.log(`  ${k}:`);
      for (const [k2, v2] of Object.entries(v)) {
        if (v2 != null) console.log(`    ${k2}: ${v2}`);
      }
    }
  }

  console.log('\n=== PHASE 3: Add LLM-extracted values ===\n');

  // Build the full CalculateTaxesInput equivalent
  const fullInput = { ...merged };

  // Add LLM values that structured extraction can't get
  fullInput.primaryPropertyTax = fullInput.primaryPropertyTax ?? VERIFIED.primaryPropertyTax;

  // Build Schedule E from structured carryforwards + LLM rental data
  const seInput = {
    grossRentalIncome: VERIFIED.grossRentalIncome,
    insurance: fullInput.scheduleEInput?.insurance ?? 0,
    mortgageInterest: fullInput.scheduleEInput?.mortgageInterest ?? 0,
    propertyTaxes: fullInput.scheduleEInput?.propertyTaxes ?? 0,
    depreciation: fullInput.scheduleEInput?.depreciation ?? 0,
    priorYearUnallowedLoss: fullInput.scheduleEInput?.priorYearUnallowedLoss,
    managementFees: VERIFIED.managementFees,
    repairs: VERIFIED.repairs,
    utilities: VERIFIED.utilities,
    otherExpenses: 0,
  };

  console.log('Schedule E input:');
  for (const [k, v] of Object.entries(seInput)) {
    if (v != null) console.log(`  ${k}: ${v}`);
  }

  console.log('\n=== PHASE 4: Calculate ===\n');

  // Schedule E
  const seOutput = calculateScheduleE(seInput);
  const rentalIncome = seOutput.amountFor1040;
  console.log(`Schedule E: net rental income = ${rentalIncome}`);

  // Schedule A
  const saInput = {
    filingStatus: 'mfj' as const,
    stateIncomeTax: fullInput.stateWithholding || undefined,
    primaryPropertyTax: fullInput.primaryPropertyTax || undefined,
    mortgageInterest: fullInput.primaryMortgageInterest ? irsRound(fullInput.primaryMortgageInterest) : undefined,
  };
  const saOutput = calculateScheduleA(saInput);
  console.log(`Schedule A: total itemized = ${saOutput.totalItemized}, should itemize = ${saOutput.shouldItemize}`);

  // Form 2441
  const roughAgi = irsRound((fullInput.wages ?? 0) + rentalIncome + (fullInput.otherIncome ?? 0));
  const form2441 = calculateForm2441({
    qualifyingExpenses: VERIFIED.dependentCareExpenses,
    qualifyingPersons: 2,
    agi: roughAgi,
  });
  console.log(`Form 2441: dependent care credit = ${form2441.credit}`);

  // QBI from rental
  const qbiIncome = fullInput.qbiIncome ?? (rentalIncome > 0 ? rentalIncome : undefined);

  // Form 1040
  const f1040 = calcF1040({
    filingStatus: 'mfj',
    taxYear: 2025,
    wages: fullInput.wages,
    otherIncome: fullInput.otherIncome,
    rentalIncome,
    capitalLossCarryforward: fullInput.capitalLossCarryforward,
    qbiIncome,
    itemizedDeductions: saOutput.shouldItemize ? saOutput.totalItemized : undefined,
    federalWithholding: fullInput.federalWithholding,
    qualifyingChildren: 2,
    dependentCareCredit: form2441.credit,
  });

  console.log('\nForm 1040:');
  console.log(`  Total Income: $${f1040.totalIncome.toLocaleString()}`);
  console.log(`  AGI: $${f1040.agi.toLocaleString()}`);
  console.log(`  Deduction: $${f1040.deduction.toLocaleString()} (${f1040.deductionType})`);
  console.log(`  Taxable Income: $${f1040.taxableIncome.toLocaleString()}`);
  console.log(`  Tax: $${f1040.tax.toLocaleString()}`);
  console.log(`  Total Credits: $${f1040.totalCredits.toLocaleString()}`);
  console.log(`  Total Tax: $${f1040.totalTax.toLocaleString()}`);
  console.log(`  Total Payments: $${f1040.totalPayments.toLocaleString()}`);
  console.log(`  ${f1040.isRefund ? 'REFUND' : 'OWED'}: $${Math.abs(f1040.refundOrOwed).toLocaleString()}`);

  // CA 540
  const ca540 = calculateForm540({
    filingStatus: 'mfj',
    federalAGI: f1040.agi,
    caWithholding: fullInput.stateWithholding || undefined,
  });
  console.log(`\nCA 540: ${ca540.isRefund ? 'Refund' : 'Owed'} $${Math.abs(ca540.refundOrOwed).toLocaleString()}`);

  // Build tax return and field maps
  const taxReturn = buildTaxReturn({
    taxYear: 2025,
    filingStatus: 'mfj',
    pii: {
      primary: { firstName: 'Taxpayer', lastName: '', ssn: '' },
      occupation: fullInput.occupation,
      dependents: [{ firstName: '', lastName: '', ssn: '', relationship: '' }, { firstName: '', lastName: '', ssn: '', relationship: '' }],
      address: { street: '', city: '', state: 'CA', zip: '' },
      filingStatus: 'mfj',
    },
    form1040: f1040,
    wages: fullInput.wages ?? 0,
    taxableInterest: fullInput.otherIncome,
    scheduleA: saOutput.shouldItemize ? { input: saInput, output: saOutput } : undefined,
    rentalProperties: [{
      address: 'Rental Property',
      propertyType: '2',
      fairRentalDays: 365,
      personalUseDays: 0,
      input: seInput,
      output: seOutput,
    }],
    scheduleEAggregate: seOutput,
    form2441: form2441,
    form540: ca540,
    w2Withholding: fullInput.federalWithholding,
    caWithholding: fullInput.stateWithholding,
  });

  const allFormKeys: FormKey[] = [
    'form1040', 'schedule1', 'schedule2', 'schedule3',
    'scheduleA', 'scheduleD', 'scheduleE',
    'form2441', 'form8995', 'ca540',
  ];
  const fieldMaps: Record<string, Record<string, string | number>> = {};
  for (const fk of allFormKeys) {
    const map = toFreeFileFieldMap(taxReturn, fk);
    if (Object.keys(map).length > 0) fieldMaps[fk] = map;
  }

  console.log('\n=== FIELD MAPS ===');
  for (const [form, fields] of Object.entries(fieldMaps)) {
    console.log(`  ${form}: ${Object.keys(fields).length} fields`);
    for (const [field, value] of Object.entries(fields)) {
      console.log(`    ${field}: ${value}`);
    }
  }
}

main().catch(console.error);
