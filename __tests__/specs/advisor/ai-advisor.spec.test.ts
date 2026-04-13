/**
 * Spec: AI Tax Advisor
 *
 * Status: confirmed
 * Confirm: LLM provides CPA-level guidance on complex tax situations
 * Invalidate: LLM gives incorrect advice on depreciation/passive loss/stock options
 *
 * Tests the deterministic guidance engine and context builder.
 * Actual LLM conversation quality tested in integration/manual testing.
 */

import {
  buildAdvisorContext,
  determineRequiredForms,
  generateGuidance,
} from '@selftax/core';
import type { TaxSituation } from '@selftax/core';

const fullSituation: TaxSituation = {
  filingStatus: 'mfj',
  approximateAGI: 200000,
  hasW2Income: true,
  w2BoxCodes: ['V'],
  hasRentalProperty: true,
  rentalPurchaseYear: 2020,
  rentalBuildingBasis: 250000,
  rentalNetIncome: -4500,
  hasStockSales: true,
  hasISOs: false,
  hasDependentCareFSA: true,
  fsaAmount: 5000,
  dependentCareExpenses: 6000,
  qualifyingChildren: 2,
  primaryPropertyTax: 12000,
  stateIncomeTax: 10000,
  mortgageInterest: 18000,
  charitableContributions: 3000,
};

describe('AI Tax Advisor', () => {
  test('receives only anonymized context (no SSN, name, address)', () => {
    const context = buildAdvisorContext(fullSituation);
    // Should contain financial facts
    expect(context).toContain('Filing status: mfj');
    expect(context).toContain('W-2');
    expect(context).toContain('rental property');
    // Should NOT contain PII patterns
    expect(context).not.toMatch(/\d{3}-\d{2}-\d{4}/); // No SSN
    expect(context).not.toMatch(/\d+ [A-Z][a-z]+ (St|Ave|Blvd|Dr|Ln)/); // No address
  });

  test('determines required forms from user situation', () => {
    const forms = determineRequiredForms(fullSituation);
    expect(forms).toContain('1040');
    expect(forms).toContain('schedule-a');
    expect(forms).toContain('schedule-d');
    expect(forms).toContain('schedule-e');
    expect(forms).toContain('form-8949');
    expect(forms).toContain('form-4562');
    expect(forms).toContain('form-2441');
  });

  test('advises on standard vs itemized deduction', () => {
    const guidance = generateGuidance(fullSituation);
    const deductionAdvice = guidance.find((g) => g.topic.includes('Standard vs Itemized'));
    expect(deductionAdvice).toBeDefined();
    // SALT ($22k capped) + mortgage ($18k) + charitable ($3k) = $43k > $30,950 standard
    expect(deductionAdvice!.advice).toContain('Itemize');
  });

  test('explains rental property depreciation', () => {
    const guidance = generateGuidance(fullSituation);
    const depAdvice = guidance.find((g) => g.topic.includes('Depreciation'));
    expect(depAdvice).toBeDefined();
    expect(depAdvice!.advice).toContain('27.5 years');
    expect(depAdvice!.advice).toContain('$9,091');
  });

  test('identifies passive activity loss limitations', () => {
    const guidance = generateGuidance(fullSituation);
    const passiveAdvice = guidance.find((g) => g.topic.includes('Passive Activity'));
    expect(passiveAdvice).toBeDefined();
    expect(passiveAdvice!.advice).toContain('fully suspended');
    expect(passiveAdvice!.severity).toBe('warning');
  });

  test('distinguishes ISO vs RSU tax treatment', () => {
    const guidance = generateGuidance(fullSituation);
    const stockAdvice = guidance.find((g) => g.topic.includes('Code V'));
    expect(stockAdvice).toBeDefined();
    expect(stockAdvice!.advice).toContain('NQSO/RSU');
    expect(stockAdvice!.advice).toContain('cost basis');
  });

  test('warns about AMT risk for ISO holders', () => {
    const isoSituation: TaxSituation = {
      ...fullSituation,
      hasISOs: true,
      isoExercisedNotSold: true,
      isoSpread: 100000,
    };
    const forms = determineRequiredForms(isoSituation);
    expect(forms).toContain('form-6251');

    const guidance = generateGuidance(isoSituation);
    const amtAdvice = guidance.find((g) => g.topic.includes('AMT'));
    expect(amtAdvice).toBeDefined();
    expect(amtAdvice!.severity).toBe('critical');
    expect(amtAdvice!.advice).toContain('ISO spread');
  });

  test('advises on dependent care FSA vs credit interaction', () => {
    const guidance = generateGuidance(fullSituation);
    const fsaAdvice = guidance.find((g) => g.topic.includes('Dependent Care'));
    expect(fsaAdvice).toBeDefined();
    // $6k expenses, $5k FSA, 2 children → $1k remaining × 20% = $200 credit
    expect(fsaAdvice!.advice).toContain('$200');
  });

  test('provides context-aware guidance based on all uploaded documents', () => {
    const guidance = generateGuidance(fullSituation);
    // Should have guidance for ALL aspects of the situation
    const topics = guidance.map((g) => g.topic);
    expect(topics).toContain('Standard vs Itemized Deduction');
    expect(topics).toContain('Rental Property Depreciation');
    expect(topics).toContain('Passive Activity Loss Limitation');
    expect(topics).toContain('Stock Compensation (Code V)');
    expect(topics).toContain('Dependent Care FSA vs Credit');
    // Holistic: at least 5 pieces of guidance
    expect(guidance.length).toBeGreaterThanOrEqual(5);
  });
});
