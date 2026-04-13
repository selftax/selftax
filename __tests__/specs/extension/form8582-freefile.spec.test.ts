/**
 * Spec: Form 8582 FreeFile three-page split and autofill ordering
 *
 * Status: active
 * Confirm: Form 8582 maps to three separate FreeFile pages (f8582, f8582w15, f8582w6)
 *          with correct field names, and autofill fills Schedule E before Form 8582.
 * Invalidate: FreeFile changes form codes or field naming conventions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FREE_FILE_FIELD_MAPPINGS } from '@selftax/core/forms/freeFileFieldMappings';
import { buildTaxReturn } from '@selftax/core/forms/buildTaxReturn';
import { toFreeFileFieldMap } from '@selftax/core/forms';
import { calculateForm1040 } from '@selftax/core/engine/form1040';
import { calculateScheduleE } from '@selftax/core/engine/scheduleE';
import type { FormKey } from '@selftax/core/forms/pdfFieldMappings';

const contentScriptPath = path.resolve(
  __dirname,
  '../../../packages/extension/src/content/freeFileAutoFill.ts',
);

describe('Form 8582 FreeFile three-page split', () => {
  test('form8582 (page 1) maps to FreeFile code f8582', () => {
    const content = fs.readFileSync(contentScriptPath, 'utf-8');
    expect(content).toMatch(/form8582:\s*'f8582'/);
  });

  test('form8582p2 (page 2, worksheets 1-5) maps to FreeFile code f8582w15', () => {
    const content = fs.readFileSync(contentScriptPath, 'utf-8');
    expect(content).toMatch(/form8582p2:\s*'f8582w15'/);
  });

  test('form8582p3 (page 3, worksheet 6) maps to FreeFile code f8582w6', () => {
    const content = fs.readFileSync(contentScriptPath, 'utf-8');
    expect(content).toMatch(/form8582p3:\s*'f8582w6'/);
  });

  test('page 1 field mappings use txtF8582 prefix (Part I, II, IV)', () => {
    const mapping = FREE_FILE_FIELD_MAPPINGS['form8582' as FormKey];
    const fields = Object.values(mapping);
    expect(fields.length).toBeGreaterThan(0);
    // All page 1 fields should have F8582 prefix
    for (const field of fields) {
      expect(field).toMatch(/^txtF8582/);
    }
  });

  test('page 2 field mappings use txtWkth1 prefix (Worksheet 1)', () => {
    const mapping = FREE_FILE_FIELD_MAPPINGS['form8582p2' as FormKey];
    const fields = Object.values(mapping);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field).toMatch(/^txtWkth1/);
    }
  });

  test('page 3 field mappings use txtWkth6 prefix (Worksheet 6)', () => {
    const mapping = FREE_FILE_FIELD_MAPPINGS['form8582p3' as FormKey];
    const fields = Object.values(mapping);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field).toMatch(/^txt(Wkth6|TotWkth6)/);
    }
  });

  test('page 2 data paths resolve from form8582 in TaxReturnData', () => {
    /** Page 2 FreeFile fields live on a separate page but their data
     *  comes from the same form8582 object in TaxReturnData (ws1* fields). */
    const mapping = FREE_FILE_FIELD_MAPPINGS['form8582p2' as FormKey];
    for (const dataPath of Object.keys(mapping)) {
      expect(dataPath).toMatch(/^form8582\./);
    }
  });

  test('page 3 data paths resolve from form8582 in TaxReturnData', () => {
    const mapping = FREE_FILE_FIELD_MAPPINGS['form8582p3' as FormKey];
    for (const dataPath of Object.keys(mapping)) {
      expect(dataPath).toMatch(/^form8582\./);
    }
  });

  test('buildTaxReturn produces form8582 data that populates all three pages', () => {
    const seInput = {
      grossRentalIncome: 120000,
      insurance: 6000,
      mortgageInterest: 40000,
      propertyTaxes: 17000,
      depreciation: 31000,
      priorYearUnallowedLoss: 508,
    };
    const seOutput = calculateScheduleE(seInput, { agi: 200000, activeParticipant: true });

    const f1040 = calculateForm1040({
      filingStatus: 'mfj',
      wages: 200000,
      rentalIncome: seOutput.amountFor1040,
      federalWithholding: 40000,
    });

    const taxReturn = buildTaxReturn({
      taxYear: 2025,
      filingStatus: 'mfj',
      pii: {
        primary: { firstName: 'Jane', lastName: 'Doe', ssn: '000-00-0000' },
        dependents: [],
        address: { street: '123 Test', city: 'Test', state: 'CA', zip: '90000' },
        filingStatus: 'mfj',
      },
      form1040: f1040,
      wages: 200000,
      rentalProperties: [{
        address: '456 Rental St',
        city: 'Testville',
        state: 'CA',
        zip: '94544',
        propertyType: '2',
        fairRentalDays: 365,
        personalUseDays: 0,
        input: seInput,
        output: seOutput,
      }],
      scheduleEAggregate: seOutput,
    });

    // Page 1 fields
    const p1 = toFreeFileFieldMap(taxReturn, 'form8582' as FormKey);
    expect(Object.keys(p1).length).toBeGreaterThan(0);
    expect(p1.txtF8582CombineParti).toBeDefined();

    // Page 2 fields (Worksheet 1)
    const p2 = toFreeFileFieldMap(taxReturn, 'form8582p2' as FormKey);
    expect(p2.txtWkth1NameActivity1).toBe('456 Rental St');

    // Page 3 fields (Worksheet 6)
    const p3 = toFreeFileFieldMap(taxReturn, 'form8582p3' as FormKey);
    expect(p3.txtWkth6NameActivity1).toBe('456 Rental St');
    expect(p3.txtWkth6SchFormreported1).toBe('Schedule E');
  });

  test('Worksheet 1 col (c) prior year unallowed loss is positive', () => {
    /** IRS Worksheet 1 column (c) is labeled "Unallowed loss" —
     *  the value should be positive (508 not -508) since the column
     *  context already implies it is a loss. */
    const seInput = {
      grossRentalIncome: 120000,
      mortgageInterest: 40000,
      depreciation: 31000,
      priorYearUnallowedLoss: 508,
    };
    const seOutput = calculateScheduleE(seInput, { agi: 200000, activeParticipant: true });
    const f1040 = calculateForm1040({
      filingStatus: 'mfj', wages: 200000,
      rentalIncome: seOutput.amountFor1040, federalWithholding: 40000,
    });
    const taxReturn = buildTaxReturn({
      taxYear: 2025, filingStatus: 'mfj',
      pii: { primary: { firstName: 'J', lastName: 'D', ssn: '000-00-0000' }, dependents: [], address: { street: '', city: '', state: 'CA', zip: '' }, filingStatus: 'mfj' },
      form1040: f1040, wages: 200000,
      rentalProperties: [{ address: 'Rental', propertyType: '2', fairRentalDays: 365, personalUseDays: 0, input: seInput, output: seOutput }],
      scheduleEAggregate: seOutput,
    });

    const p2 = toFreeFileFieldMap(taxReturn, 'form8582p2' as FormKey);
    // Column (c) should be positive 508, not negative
    expect(p2.txtWkth1UnallowedLosse1).toBe(508);
  });
});

describe('Form autofill ordering', () => {
  test('FORM_ORDER places scheduleE before form8582 pages', () => {
    const content = fs.readFileSync(contentScriptPath, 'utf-8');
    const orderMatch = content.match(/const FORM_ORDER[^;]+;/s);
    expect(orderMatch).not.toBeNull();
    const order = orderMatch![0];

    const seIdx = order.indexOf("'scheduleE'");
    const f8582Idx = order.indexOf("'form8582'");
    const f8582p2Idx = order.indexOf("'form8582p2'");
    const f8582p3Idx = order.indexOf("'form8582p3'");

    expect(seIdx).toBeLessThan(f8582Idx);
    expect(f8582Idx).toBeLessThan(f8582p2Idx);
    expect(f8582p2Idx).toBeLessThan(f8582p3Idx);
  });

  test('form1040 is always first in FORM_ORDER', () => {
    const content = fs.readFileSync(contentScriptPath, 'utf-8');
    const orderMatch = content.match(/const FORM_ORDER[^;]+;/s);
    expect(orderMatch).not.toBeNull();
    const order = orderMatch![0];
    const f1040Idx = order.indexOf("'form1040'");
    // form1040 should appear before any other form
    expect(f1040Idx).toBeGreaterThan(0);
    expect(f1040Idx).toBeLessThan(order.indexOf("'schedule"));
  });
});
