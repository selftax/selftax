/**
 * Spec: Preferential Capital Gains and Qualified Dividend Tax Rates
 * Status: confirmed — LTCG and qualified dividends taxed at 0%/15%/20%
 * Confirm: calculateTaxWithPreferentialRates produces lower tax than ordinary rates
 * Invalidate: preferential rates removed or broken
 */

import {
  calculateForm1040,
  calculateTax,
  calculateTaxWithPreferentialRates,
  getTaxYearConfig,
  irsRound,
} from '@selftax/core';
import type { Form1040Input } from '@selftax/core';

describe('Preferential Capital Gains and Qualified Dividend Rates', () => {

  // ── Config: capital gains brackets exist per year ──

  test('TaxYearConfig includes capital gains rate thresholds', () => {
    const c2025 = getTaxYearConfig(2025);
    expect(c2025.capitalGainsBrackets.mfj.zeroMax).toBe(96700);
    expect(c2025.capitalGainsBrackets.mfj.fifteenMax).toBe(600050);

    const c2024 = getTaxYearConfig(2024);
    expect(c2024.capitalGainsBrackets.mfj.zeroMax).toBe(94050);

    const c2023 = getTaxYearConfig(2023);
    expect(c2023.capitalGainsBrackets.mfj.zeroMax).toBe(89250);
  });

  // ── Form1040Input: new fields for LTCG/STCG ──

  test('Form1040Input accepts longTermCapitalGains and shortTermCapitalGains', () => {
    // These should compile and produce valid results
    const r1 = calculateForm1040({ filingStatus: 'mfj', wages: 50000, longTermCapitalGains: 20000 });
    expect(r1.totalIncome).toBe(70000);

    const r2 = calculateForm1040({ filingStatus: 'mfj', wages: 50000, shortTermCapitalGains: 5000 });
    expect(r2.totalIncome).toBe(55000);

    // Backward compat: capitalGains still works
    const r3 = calculateForm1040({ filingStatus: 'mfj', wages: 50000, capitalGains: 10000 });
    expect(r3.totalIncome).toBe(60000);
  });

  // ── Core: preferential rate calculation ──

  test('LTCG in 0% bracket pays zero capital gains tax', () => {
    // MFJ 2025: wages $50,000 + $20,000 LTCG
    // Taxable = $70,000 - $30,950 = $39,050
    // Ordinary portion = $39,050 - $20,000 = $19,050
    // LTCG $20,000 stacks from $19,050 to $39,050 — all below $96,700 → 0% rate
    // Tax = ordinary on $19,050 = $1,905
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 50000,
      longTermCapitalGains: 20000,
    });

    expect(result.tax).toBe(1905);
    // Must be less than straight ordinary rates
    expect(result.tax).toBeLessThan(calculateTax(39050, 'mfj', 2025));
  });

  test('LTCG spanning 0% and 15% brackets', () => {
    // MFJ 2025: wages $80,000 + $50,000 LTCG
    // Taxable = $130,000 - $30,950 = $99,050
    // Ordinary = $99,050 - $50,000 = $49,050
    // LTCG stacks from $49,050 to $99,050
    // 0% portion: $49,050 to $96,700 = $47,650 at 0%
    // 15% portion: $96,700 to $99,050 = $2,350 at 15% = $353
    // Ordinary tax on $49,050: 10% on $24,300 = $2,430; 12% on $24,750 = $2,970 → $5,400
    // Total = $5,400 + $0 + $353 = $5,753
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 80000,
      longTermCapitalGains: 50000,
    });

    expect(result.tax).toBe(5753);
    expect(result.tax).toBeLessThan(calculateTax(99050, 'mfj', 2025));
  });

  test('qualified dividends use same preferential rates as LTCG', () => {
    // Same scenario but with QD instead of LTCG → same tax
    const resultLTCG = calculateForm1040({
      filingStatus: 'mfj',
      wages: 50000,
      longTermCapitalGains: 20000,
    });
    const resultQD = calculateForm1040({
      filingStatus: 'mfj',
      wages: 50000,
      qualifiedDividends: 20000,
      ordinaryDividends: 20000, // QD is a subset of ordinary dividends
    });

    expect(resultQD.tax).toBe(resultLTCG.tax);
  });

  test('qualified dividends + LTCG stack together in preferential brackets', () => {
    // MFJ 2025: wages $80,000, QD $30,000, LTCG $30,000
    // Total preferential = $60,000
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 80000,
      qualifiedDividends: 30000,
      ordinaryDividends: 30000,
      longTermCapitalGains: 30000,
    });

    // Taxable = $80k + $30k(div) + $30k(ltcg) - $30,950 = $109,050
    // Must be less than straight bracket calculation
    const straightTax = calculateTax(109050, 'mfj', 2025);
    expect(result.tax).toBeLessThan(straightTax);
  });

  test('20% rate applies above the 15% threshold', () => {
    // Single 2025: wages $500,000, LTCG $200,000
    // Taxable = $700,000 - $15,475 = $684,525
    // Ordinary = $684,525 - $200,000 = $484,525
    // LTCG stacks from $484,525 to $684,525
    // $533,400 is the 15% threshold for single
    // 15% portion: $484,525 to $533,400 = $48,875 at 15% = $7,331
    // 20% portion: $533,400 to $684,525 = $151,125 at 20% = $30,225
    const result = calculateForm1040({
      filingStatus: 'single',
      wages: 500000,
      longTermCapitalGains: 200000,
    });

    // Verify it's less than straight rates
    const straightTax = calculateTax(684525, 'single', 2025);
    expect(result.tax).toBeLessThan(straightTax);

    // The tax should include a 20% component — verify by checking it's
    // more than if everything were 15%
    const allAt15 = calculateTax(484525, 'single', 2025) + irsRound(200000 * 0.15);
    expect(result.tax).toBeGreaterThan(allAt15);
  });

  // ── Backward compatibility ──

  test('existing capitalGains field treated as short-term (ordinary rates)', () => {
    // capitalGains without longTermCapitalGains → ordinary rates (no preferential)
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 100000,
      capitalGains: 10000,
    });

    // Should equal straight bracket calculation on $110,000 - $30,950 = $79,050
    const expectedTax = calculateTax(79050, 'mfj', 2025);
    expect(result.tax).toBe(expectedTax);
  });

  test('no LTCG or QD → calculateForm1040 uses ordinary rates (no regression)', () => {
    const result = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    expect(result.tax).toBe(10852);
    expect(result.deduction).toBe(30950);
  });

  // ── Year-aware: different thresholds per year ──

  test('2024 vs 2025 capital gains brackets produce different tax', () => {
    const input: Form1040Input = {
      filingStatus: 'mfj',
      wages: 80000,
      longTermCapitalGains: 50000,
    };

    const r2024 = calculateForm1040({ ...input, taxYear: 2024 });
    const r2025 = calculateForm1040({ ...input, taxYear: 2025 });

    expect(r2024.tax).not.toBe(r2025.tax);
  });
});
