/**
 * Spec: Year-Aware Tax Constants
 * Status: confirmed — TaxYearConfig bundles all year-varying values per year
 * Confirm: getTaxYearConfig(year) returns correct TCJA vs OBBBA values
 * Invalidate: constants revert to single-year hardcoding
 */

import { getTaxYearConfig, SUPPORTED_TAX_YEARS } from '@selftax/core';
import type { TaxYearConfig } from '@selftax/core';

describe('Year-Aware Tax Constants', () => {

  test('TaxYearConfig type contains all year-varying federal constants', () => {
    const config: TaxYearConfig = getTaxYearConfig(2025);

    // Federal constants
    expect(config.taxBrackets).toBeDefined();
    expect(config.taxBrackets.mfj).toBeDefined();
    expect(config.taxBrackets.single).toBeDefined();
    expect(config.standardDeduction).toBeDefined();
    expect(config.standardDeduction.mfj).toBeGreaterThan(0);
    expect(typeof config.childTaxCredit).toBe('number');
    expect(typeof config.childTaxCreditRefundableMax).toBe('number');
    expect(typeof config.saltCap).toBe('number');
    expect(config.additionalDeduction65Blind).toBeDefined();
    expect(typeof config.seniorBonusDeduction).toBe('number');
    expect(config.dependentCareExpenseLimits).toBeDefined();
    expect(config.dependentCareExpenseLimits.one).toBe(3000);
    expect(config.dependentCareExpenseLimits.twoOrMore).toBe(6000);
  });

  test('TaxYearConfig contains all year-varying CA constants', () => {
    const config = getTaxYearConfig(2025);

    expect(config.caTaxBrackets).toBeDefined();
    expect(config.caTaxBrackets.mfj).toBeDefined();
    expect(config.caStandardDeduction).toBeDefined();
    expect(config.caStandardDeduction.mfj).toBeGreaterThan(0);
    expect(config.caPersonalExemptionCredit).toBeDefined();
    expect(typeof config.caMentalHealthThreshold).toBe('number');
    expect(typeof config.caMentalHealthRate).toBe('number');
  });

  test('2024 config has pre-OBBBA values', () => {
    const config = getTaxYearConfig(2024);

    expect(config.childTaxCredit).toBe(2000);
    expect(config.saltCap).toBe(10000);
    expect(config.standardDeduction.mfj).toBe(29200);
    expect(config.seniorBonusDeduction).toBe(0);
    expect(config.taxBrackets.mfj[0].max).toBe(23200);
  });

  test('2025 config has OBBBA values', () => {
    const config = getTaxYearConfig(2025);

    expect(config.childTaxCredit).toBe(2200);
    expect(config.saltCap).toBe(40000);
    expect(config.standardDeduction.mfj).toBe(30950);
    expect(config.seniorBonusDeduction).toBe(4000);
    expect(config.taxBrackets.mfj[0].max).toBe(24300);
  });

  test('2023 config exists for historical verification', () => {
    const config = getTaxYearConfig(2023);

    expect(config.standardDeduction.mfj).toBe(27700);
    expect(config.saltCap).toBe(10000);
    expect(config.childTaxCredit).toBe(2000);
    expect(config.taxBrackets.mfj[0].max).toBe(22000);
  });

  test('unsupported year throws descriptive error', () => {
    expect(() => getTaxYearConfig(2019)).toThrow('2019');
    expect(() => getTaxYearConfig(2030)).toThrow('2030');
  });

  test('all year configs share the same TaxYearConfig shape', () => {
    const configs = SUPPORTED_TAX_YEARS.map((y) => getTaxYearConfig(y));
    const keySet = (c: TaxYearConfig) => Object.keys(c).sort().join(',');

    for (let i = 1; i < configs.length; i++) {
      expect(keySet(configs[i])).toBe(keySet(configs[0]));
    }
  });
});
