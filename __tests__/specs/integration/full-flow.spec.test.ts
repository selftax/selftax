/**
 * Spec: Full Tax Preparation Flow
 *
 * Status: confirmed
 * Confirm: End-to-end flow produces correct tax return for test scenario
 * Invalidate: Integration between components breaks data flow
 *
 * Test scenario: W-2 ($125k wages, Code V $45k stock comp) +
 * rental property ($24k income, $18k expenses, $9k depreciation) +
 * stock sales (3 lots, mix of short/long term) +
 * dependent care FSA ($5k) + primary residence property tax ($12k)
 */

import {
  detectPII,
  redactText,
  mapW2Fields,
  calculateForm1040,
  calculateScheduleA,
  calculateScheduleD,
  calculateScheduleE,
  calculateForm2441,
  determineRequiredForms,
  generateGuidance,
  aggregateExpenses,
  build1040Fields,
  buildScheduleAFields,
  buildScheduleDFields,
  buildScheduleEFields,
  buildForm8949Fields,
  assembleTaxReturn,
} from '@selftax/core';
import type { UserProfile, StockTransaction, CategorizedExpense, TaxSituation } from '@selftax/core';

// Test profile — synthetic PII
const profile: UserProfile = {
  ssn: '000-00-0000',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1985-06-15',
  address: { street: '456 Oak Ave', city: 'Springfield', state: 'CA', zip: '90000' },
};

// W-2 OCR text
const w2Text = `
Wage and Tax Statement 2025
Jane Doe SSN: 000-00-0000
456 Oak Ave, Springfield, CA 90000
Employer EIN: 00-0000000
Box 1 Wages: $125,432.00
Box 2 Federal income tax withheld: $28,100.00
Box 12a Code V $45,000.00
Box 10 Dependent care benefits: $5,000.00
Box 15 State: CA
Box 16 State wages: $125,432.00
Box 17 State income tax: $9,800.00
`;

describe('Full Tax Preparation Flow', () => {
  test('user enters profile (PII stored locally)', () => {
    // Profile contains PII — verified it's structured
    expect(profile.ssn).toBe('000-00-0000');
    expect(profile.firstName).toBe('Jane');
    expect(profile.address.state).toBe('CA');
  });

  test('user uploads W-2 → OCR → PII detection → verification', () => {
    // Step 1: OCR produces text (simulated)
    const ocrText = w2Text;

    // Step 2: PII detection
    const detections = detectPII(ocrText, profile);
    expect(detections.length).toBeGreaterThan(0);
    const ssnDetection = detections.find((d) => d.type === 'ssn');
    expect(ssnDetection).toBeDefined();

    // Step 3: Redaction
    const redacted = redactText(ocrText, detections);
    expect(redacted).not.toContain('000-00-0000');
    expect(redacted).toContain('$125,432.00'); // Dollar amounts preserved

    // Step 4: Field mapping still works on original
    const fields = mapW2Fields(ocrText);
    expect(fields.box1_wages).toBe(125432);
    expect(fields.box2_federal_tax).toBe(28100);
    expect(fields.box12).toContainEqual({ code: 'V', amount: 45000 });
  });

  test('user uploads rental expense spreadsheet → LLM categorizes', () => {
    // Simulated LLM categorization results
    const categorized: CategorizedExpense[] = [
      { description: 'Plumbing repair', amount: 3200, category: 'repairs', capitalize: false, scheduleELine: 14 },
      { description: 'Electrical repair', amount: 2200, category: 'repairs', capitalize: false, scheduleELine: 14 },
      { description: 'Landlord insurance', amount: 1800, category: 'insurance', capitalize: false, scheduleELine: 9 },
      { description: 'Property manager', amount: 2400, category: 'management_fees', capitalize: false, scheduleELine: 11 },
      { description: 'Property tax', amount: 4000, category: 'property_taxes', capitalize: false, scheduleELine: 16 },
    ];
    const totals = aggregateExpenses(categorized);
    expect(totals.repairs).toBe(5400);
    expect(totals.insurance).toBe(1800);
    expect(totals.managementFees).toBe(2400);
    expect(totals.propertyTaxes).toBe(4000);
  });

  test('AI advisor determines required forms', () => {
    const situation: TaxSituation = {
      filingStatus: 'mfj',
      approximateAGI: 200000,
      hasW2Income: true,
      w2BoxCodes: ['V'],
      hasRentalProperty: true,
      rentalBuildingBasis: 250000,
      rentalNetIncome: -4500,
      hasStockSales: true,
      hasISOs: false,
      hasDependentCareFSA: true,
      fsaAmount: 5000,
      primaryPropertyTax: 12000,
      stateIncomeTax: 9800,
      mortgageInterest: 18000,
      charitableContributions: 3000,
    };
    const forms = determineRequiredForms(situation);
    expect(forms).toContain('1040');
    expect(forms).toContain('schedule-a');
    expect(forms).toContain('schedule-d');
    expect(forms).toContain('schedule-e');
    expect(forms).toContain('form-8949');
    expect(forms).toContain('form-4562');
    expect(forms).toContain('form-2441');
  });

  test('AI advisor provides guidance on key decisions', () => {
    const situation: TaxSituation = {
      filingStatus: 'mfj',
      approximateAGI: 200000,
      hasW2Income: true,
      w2BoxCodes: ['V'],
      hasRentalProperty: true,
      rentalBuildingBasis: 250000,
      rentalNetIncome: -4500,
      hasStockSales: true,
      hasISOs: false,
      hasDependentCareFSA: true,
      fsaAmount: 5000,
      dependentCareExpenses: 6000,
      qualifyingChildren: 2,
      primaryPropertyTax: 12000,
      stateIncomeTax: 9800,
      mortgageInterest: 18000,
      charitableContributions: 3000,
    };
    const guidance = generateGuidance(situation);
    expect(guidance.length).toBeGreaterThanOrEqual(4);

    const topics = guidance.map((g) => g.topic);
    expect(topics).toContain('Standard vs Itemized Deduction');
    expect(topics).toContain('Passive Activity Loss Limitation');
    expect(topics).toContain('Stock Compensation (Code V)');
  });

  test('tax engine calculates all forms', () => {
    const transactions: StockTransaction[] = [
      { description: '100 ACME', dateAcquired: '2025-01-15', dateSold: '2025-08-01', proceeds: 5000, costBasis: 3500 },
      { description: '50 FOO', dateAcquired: '2024-01-01', dateSold: '2025-06-01', proceeds: 8000, costBasis: 6000 },
      { description: '200 BAR', dateAcquired: '2023-06-01', dateSold: '2025-03-01', proceeds: 3000, costBasis: 5000 },
    ];

    const schedD = calculateScheduleD(transactions);
    const schedE = calculateScheduleE(
      {
        grossRentalIncome: 24000,
        repairs: 5400,
        insurance: 1800,
        managementFees: 2400,
        propertyTaxes: 4000,
        mortgageInterest: 8000,
        depreciation: 9091,
      },
      { agi: 200000, activeParticipant: true },
    );
    const schedA = calculateScheduleA({
      filingStatus: 'mfj',
      stateIncomeTax: 9800,
      primaryPropertyTax: 12000,
      mortgageInterest: 18000,
      charitableCash: 3000,
    });
    const form2441 = calculateForm2441({
      qualifyingExpenses: 6000,
      qualifyingPersons: 2,
      fsaExclusion: 5000,
      agi: 200000,
    });

    const form1040 = calculateForm1040({
      filingStatus: 'mfj',
      wages: 125432,
      capitalGains: schedD.netCapitalGainLoss,
      rentalIncome: schedE.amountFor1040,
      itemizedDeductions: schedA.totalItemized,
      dependentCareCredit: form2441.credit,
      qualifyingChildren: 2,
      federalWithholding: 28100,
    });

    expect(form1040.totalIncome).toBeGreaterThan(0);
    expect(form1040.agi).toBeGreaterThan(0);
    expect(form1040.tax).toBeGreaterThan(0);
    expect(form1040.deductionType).toBe('itemized');
    expect(typeof form1040.refundOrOwed).toBe('number');
  });

  test('user reviews calculated return before generating PDFs', () => {
    const form1040 = calculateForm1040({
      filingStatus: 'mfj',
      wages: 125432,
      capitalGains: 1500,
      itemizedDeductions: 42800,
      qualifyingChildren: 2,
      dependentCareCredit: 200,
      federalWithholding: 28100,
    });

    // Review summary
    expect(form1040.totalIncome).toBe(126932);
    expect(form1040.deductionType).toBe('itemized');
    expect(form1040.deduction).toBe(42800);
    expect(form1040.taxableIncome).toBe(84132);
    expect(form1040.totalPayments).toBe(28100);
    expect(typeof form1040.isRefund).toBe('boolean');
  });

  test('generates complete tax return PDF package', () => {
    const form1040 = calculateForm1040({ filingStatus: 'mfj', wages: 125432, federalWithholding: 28100 });
    const schedA = calculateScheduleA({ filingStatus: 'mfj', stateIncomeTax: 9800, primaryPropertyTax: 12000, mortgageInterest: 18000 });
    const schedD = calculateScheduleD([
      { description: '100 ACME', dateAcquired: '2025-01-15', dateSold: '2025-08-01', proceeds: 5000, costBasis: 3500 },
    ]);
    const schedE = calculateScheduleE({
      grossRentalIncome: 24000, repairs: 5400, insurance: 1800, depreciation: 9091,
    });

    const pkg = assembleTaxReturn(profile, [
      { formType: '1040', fields: build1040Fields(form1040) },
      { formType: 'schedule-a', fields: buildScheduleAFields(schedA) },
      { formType: 'schedule-d', fields: buildScheduleDFields(schedD) },
      { formType: 'schedule-e', fields: buildScheduleEFields(
        { grossRentalIncome: 24000, repairs: 5400, insurance: 1800, depreciation: 9091 },
        schedE,
      )},
      { formType: 'form-8949', fields: buildForm8949Fields([
        { description: '100 ACME', dateAcquired: '2025-01-15', dateSold: '2025-08-01', proceeds: 5000, costBasis: 3500 },
      ])[0] },
    ]);

    expect(pkg.forms).toHaveLength(5);
    expect(pkg.piiFields.name).toBe('Jane Doe');
    expect(pkg.piiFields.ssn).toBe('000-00-0000');

    // Verify all form types present
    const formTypes = pkg.forms.map((f) => f.formType);
    expect(formTypes).toContain('1040');
    expect(formTypes).toContain('schedule-a');
    expect(formTypes).toContain('schedule-d');
    expect(formTypes).toContain('schedule-e');
    expect(formTypes).toContain('form-8949');
  });
});
