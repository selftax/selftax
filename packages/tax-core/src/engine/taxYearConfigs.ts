/**
 * Year-aware tax configurations.
 *
 * Each tax year has its own TaxYearConfig bundling ALL year-varying constants
 * (federal + CA). Adding a new year = adding one config block.
 *
 * Sources:
 * - 2023: IRS Rev. Proc. 2022-38, FTB 2023 Tax Rate Schedules
 * - 2024: IRS Rev. Proc. 2023-34, FTB 2024 Tax Rate Schedules
 * - 2025: IRS Rev. Proc. 2024-40 + OBBBA (signed July 4, 2025), FTB 2025 estimates
 */

import type { FilingStatus, TaxBracket } from './taxConstants';

// ── TaxYearConfig type ──────────────────────────────────────────

export interface CapitalGainsThresholds {
  /** Maximum taxable income for 0% LTCG rate */
  zeroMax: number;
  /** Maximum taxable income for 15% LTCG rate (above this = 20%) */
  fifteenMax: number;
}

export interface TaxYearConfig {
  // Federal
  taxBrackets: Record<FilingStatus, TaxBracket[]>;
  standardDeduction: Record<FilingStatus, number>;
  childTaxCredit: number;
  childTaxCreditRefundableMax: number;
  saltCap: number;
  additionalDeduction65Blind: Record<'single' | 'married', number>;
  seniorBonusDeduction: number;
  dependentCareExpenseLimits: { one: number; twoOrMore: number };
  /** 0%/15%/20% thresholds for long-term capital gains and qualified dividends */
  capitalGainsBrackets: Record<FilingStatus, CapitalGainsThresholds>;
  /** Net Investment Income Tax (Form 8960) — statutory, not indexed */
  niitRate: number;
  niitThreshold: Record<FilingStatus, number>;
  /** Additional Medicare Tax (Form 8959) — statutory, not indexed */
  additionalMedicareRate: number;
  additionalMedicareThreshold: Record<FilingStatus, number>;
  /** QBI deduction thresholds (Form 8995-A) */
  qbiThreshold: Record<FilingStatus, number>;
  qbiPhaseInRange: Record<FilingStatus, number>;
  /** Educator expenses max deduction */
  educatorExpensesMax: number;
  /** Saver's Credit (Form 8880) AGI tiers: [50% max, 20% max, 10% max] */
  saversCredit: Record<FilingStatus, { fifty: number; twenty: number; ten: number }>;
  /** Saver's Credit max contributions per person */
  saversCreditMaxContribPerPerson: number;
  /** Medical deduction floor (percentage of AGI) */
  medicalDeductionFloor: number;
  /** HSA contribution limits */
  hsaLimits: { selfOnly: number; family: number; catchUp55: number };
  /** Student loan interest deduction phaseout */
  studentLoanPhaseout: Record<FilingStatus, { start: number; end: number }>;
  /** Student loan interest deduction max */
  studentLoanMaxDeduction: number;
  /** Education credit phaseout thresholds (Form 8863) */
  educationCreditPhaseout: Record<FilingStatus, { start: number; end: number }>;
  /** EITC parameters per qualifying child count (0/1/2/3+) */
  eitcTable: Record<number, { creditRate: number; earnedIncomeAmount: number; phaseoutStart: Record<FilingStatus, number>; phaseoutRate: number }>;
  /** EITC investment income limit */
  eitcInvestmentIncomeLimit: number;
  /** Social Security benefits taxability thresholds (statutory, not indexed) */
  ssTaxabilityThresholds: Record<FilingStatus, { lower: number; upper: number }>;
  /** Self-employment tax (Schedule SE) */
  socialSecurityWageBase: number;
  socialSecurityRate: number;
  medicareRate: number;
  selfEmploymentTaxMultiplier: number;

  // California
  caTaxBrackets: Record<FilingStatus, TaxBracket[]>;
  caStandardDeduction: Record<FilingStatus, number>;
  caPersonalExemptionCredit: Record<FilingStatus, number>;
  caMentalHealthThreshold: number;
  caMentalHealthRate: number;
  /** CA dependent exemption credit per dependent */
  caDependentExemptionCredit: number;
}

// ── 2023 config (TCJA) ──────────────────────────────────────────

const config2023: TaxYearConfig = {
  taxBrackets: {
    mfj: [
      { min: 0, max: 22000, rate: 0.10 },
      { min: 22000, max: 89450, rate: 0.12 },
      { min: 89450, max: 190750, rate: 0.22 },
      { min: 190750, max: 364200, rate: 0.24 },
      { min: 364200, max: 462500, rate: 0.32 },
      { min: 462500, max: 693750, rate: 0.35 },
      { min: 693750, max: Infinity, rate: 0.37 },
    ],
    single: [
      { min: 0, max: 11000, rate: 0.10 },
      { min: 11000, max: 44725, rate: 0.12 },
      { min: 44725, max: 95375, rate: 0.22 },
      { min: 95375, max: 182100, rate: 0.24 },
      { min: 182100, max: 231250, rate: 0.32 },
      { min: 231250, max: 578125, rate: 0.35 },
      { min: 578125, max: Infinity, rate: 0.37 },
    ],
    mfs: [
      { min: 0, max: 11000, rate: 0.10 },
      { min: 11000, max: 44725, rate: 0.12 },
      { min: 44725, max: 95375, rate: 0.22 },
      { min: 95375, max: 182100, rate: 0.24 },
      { min: 182100, max: 231250, rate: 0.32 },
      { min: 231250, max: 346875, rate: 0.35 },
      { min: 346875, max: Infinity, rate: 0.37 },
    ],
    hoh: [
      { min: 0, max: 15700, rate: 0.10 },
      { min: 15700, max: 59850, rate: 0.12 },
      { min: 59850, max: 95350, rate: 0.22 },
      { min: 95350, max: 182100, rate: 0.24 },
      { min: 182100, max: 231250, rate: 0.32 },
      { min: 231250, max: 578100, rate: 0.35 },
      { min: 578100, max: Infinity, rate: 0.37 },
    ],
    qw: [
      { min: 0, max: 22000, rate: 0.10 },
      { min: 22000, max: 89450, rate: 0.12 },
      { min: 89450, max: 190750, rate: 0.22 },
      { min: 190750, max: 364200, rate: 0.24 },
      { min: 364200, max: 462500, rate: 0.32 },
      { min: 462500, max: 693750, rate: 0.35 },
      { min: 693750, max: Infinity, rate: 0.37 },
    ],
  },
  standardDeduction: { single: 13850, mfj: 27700, mfs: 13850, hoh: 20800, qw: 27700 },
  childTaxCredit: 2000,
  childTaxCreditRefundableMax: 1600,
  saltCap: 10000,
  additionalDeduction65Blind: { single: 1850, married: 1500 },
  seniorBonusDeduction: 0,
  dependentCareExpenseLimits: { one: 3000, twoOrMore: 6000 },
  capitalGainsBrackets: {
    single: { zeroMax: 44625, fifteenMax: 492300 },
    mfj: { zeroMax: 89250, fifteenMax: 553850 },
    mfs: { zeroMax: 44625, fifteenMax: 276900 },
    hoh: { zeroMax: 59750, fifteenMax: 523050 },
    qw: { zeroMax: 89250, fifteenMax: 553850 },
  },
  niitRate: 0.038,
  niitThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qw: 250000 },
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qw: 250000 },
  qbiThreshold: { single: 170050, mfj: 340100, mfs: 170050, hoh: 170050, qw: 340100 },
  qbiPhaseInRange: { single: 50000, mfj: 100000, mfs: 50000, hoh: 50000, qw: 100000 },
  educatorExpensesMax: 300,
  saversCredit: {
    single: { fifty: 21750, twenty: 23750, ten: 36500 },
    mfj: { fifty: 43500, twenty: 47500, ten: 73000 },
    mfs: { fifty: 21750, twenty: 23750, ten: 36500 },
    hoh: { fifty: 32625, twenty: 35625, ten: 54750 },
    qw: { fifty: 43500, twenty: 47500, ten: 73000 },
  },
  saversCreditMaxContribPerPerson: 2000,
  medicalDeductionFloor: 0.075,
  hsaLimits: { selfOnly: 3850, family: 7750, catchUp55: 1000 },
  studentLoanPhaseout: {
    single: { start: 75000, end: 90000 }, mfj: { start: 145000, end: 175000 },
    mfs: { start: 0, end: 0 }, hoh: { start: 75000, end: 90000 }, qw: { start: 75000, end: 90000 },
  },
  studentLoanMaxDeduction: 2500,
  educationCreditPhaseout: {
    single: { start: 80000, end: 90000 }, mfj: { start: 160000, end: 180000 },
    mfs: { start: 0, end: 0 }, hoh: { start: 80000, end: 90000 }, qw: { start: 80000, end: 90000 },
  },
  eitcTable: {
    0: { creditRate: 0.0765, earnedIncomeAmount: 7320, phaseoutStart: { single: 9160, mfj: 15290, mfs: 9160, hoh: 9160, qw: 15290 }, phaseoutRate: 0.0765 },
    1: { creditRate: 0.34, earnedIncomeAmount: 10980, phaseoutStart: { single: 20130, mfj: 26260, mfs: 20130, hoh: 20130, qw: 26260 }, phaseoutRate: 0.1598 },
    2: { creditRate: 0.40, earnedIncomeAmount: 15410, phaseoutStart: { single: 20130, mfj: 26260, mfs: 20130, hoh: 20130, qw: 26260 }, phaseoutRate: 0.2106 },
    3: { creditRate: 0.45, earnedIncomeAmount: 15410, phaseoutStart: { single: 20130, mfj: 26260, mfs: 20130, hoh: 20130, qw: 26260 }, phaseoutRate: 0.2106 },
  },
  eitcInvestmentIncomeLimit: 10300,
  ssTaxabilityThresholds: {
    single: { lower: 25000, upper: 34000 },
    mfj: { lower: 32000, upper: 44000 },
    mfs: { lower: 0, upper: 0 },
    hoh: { lower: 25000, upper: 34000 },
    qw: { lower: 25000, upper: 34000 },
  },
  socialSecurityWageBase: 160200,
  socialSecurityRate: 0.124,
  medicareRate: 0.029,
  selfEmploymentTaxMultiplier: 0.9235,

  // CA 2023
  caTaxBrackets: {
    single: [
      { min: 0, max: 10099, rate: 0.01 },
      { min: 10099, max: 23942, rate: 0.02 },
      { min: 23942, max: 37788, rate: 0.04 },
      { min: 37788, max: 52455, rate: 0.06 },
      { min: 52455, max: 66295, rate: 0.08 },
      { min: 66295, max: 338639, rate: 0.093 },
      { min: 338639, max: 406364, rate: 0.103 },
      { min: 406364, max: 677275, rate: 0.113 },
      { min: 677275, max: Infinity, rate: 0.123 },
    ],
    mfj: [
      { min: 0, max: 20198, rate: 0.01 },
      { min: 20198, max: 47884, rate: 0.02 },
      { min: 47884, max: 75576, rate: 0.04 },
      { min: 75576, max: 104910, rate: 0.06 },
      { min: 104910, max: 132590, rate: 0.08 },
      { min: 132590, max: 677278, rate: 0.093 },
      { min: 677278, max: 812728, rate: 0.103 },
      { min: 812728, max: 1354550, rate: 0.113 },
      { min: 1354550, max: Infinity, rate: 0.123 },
    ],
    mfs: [
      { min: 0, max: 10099, rate: 0.01 },
      { min: 10099, max: 23942, rate: 0.02 },
      { min: 23942, max: 37788, rate: 0.04 },
      { min: 37788, max: 52455, rate: 0.06 },
      { min: 52455, max: 66295, rate: 0.08 },
      { min: 66295, max: 338639, rate: 0.093 },
      { min: 338639, max: 406364, rate: 0.103 },
      { min: 406364, max: 677275, rate: 0.113 },
      { min: 677275, max: Infinity, rate: 0.123 },
    ],
    hoh: [
      { min: 0, max: 20198, rate: 0.01 },
      { min: 20198, max: 47884, rate: 0.02 },
      { min: 47884, max: 75576, rate: 0.04 },
      { min: 75576, max: 104910, rate: 0.06 },
      { min: 104910, max: 132590, rate: 0.08 },
      { min: 132590, max: 677278, rate: 0.093 },
      { min: 677278, max: 812728, rate: 0.103 },
      { min: 812728, max: 1354550, rate: 0.113 },
      { min: 1354550, max: Infinity, rate: 0.123 },
    ],
    qw: [
      { min: 0, max: 20198, rate: 0.01 },
      { min: 20198, max: 47884, rate: 0.02 },
      { min: 47884, max: 75576, rate: 0.04 },
      { min: 75576, max: 104910, rate: 0.06 },
      { min: 104910, max: 132590, rate: 0.08 },
      { min: 132590, max: 677278, rate: 0.093 },
      { min: 677278, max: 812728, rate: 0.103 },
      { min: 812728, max: 1354550, rate: 0.113 },
      { min: 1354550, max: Infinity, rate: 0.123 },
    ],
  },
  caStandardDeduction: { single: 5202, mfj: 10404, mfs: 5202, hoh: 10404, qw: 10404 },
  caPersonalExemptionCredit: { single: 140, mfj: 280, mfs: 140, hoh: 140, qw: 140 },
  caMentalHealthThreshold: 1000000,
  caMentalHealthRate: 0.01,
  caDependentExemptionCredit: 421,
};

// ── 2024 config (TCJA) ──────────────────────────────────────────

const config2024: TaxYearConfig = {
  taxBrackets: {
    mfj: [
      { min: 0, max: 23200, rate: 0.10 },
      { min: 23200, max: 94300, rate: 0.12 },
      { min: 94300, max: 201050, rate: 0.22 },
      { min: 201050, max: 383900, rate: 0.24 },
      { min: 383900, max: 487450, rate: 0.32 },
      { min: 487450, max: 731200, rate: 0.35 },
      { min: 731200, max: Infinity, rate: 0.37 },
    ],
    single: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 },
    ],
    mfs: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 365600, rate: 0.35 },
      { min: 365600, max: Infinity, rate: 0.37 },
    ],
    hoh: [
      { min: 0, max: 16550, rate: 0.10 },
      { min: 16550, max: 63100, rate: 0.12 },
      { min: 63100, max: 100500, rate: 0.22 },
      { min: 100500, max: 191950, rate: 0.24 },
      { min: 191950, max: 243700, rate: 0.32 },
      { min: 243700, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 },
    ],
    qw: [
      { min: 0, max: 23200, rate: 0.10 },
      { min: 23200, max: 94300, rate: 0.12 },
      { min: 94300, max: 201050, rate: 0.22 },
      { min: 201050, max: 383900, rate: 0.24 },
      { min: 383900, max: 487450, rate: 0.32 },
      { min: 487450, max: 731200, rate: 0.35 },
      { min: 731200, max: Infinity, rate: 0.37 },
    ],
  },
  standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900, qw: 29200 },
  childTaxCredit: 2000,
  childTaxCreditRefundableMax: 1700,
  saltCap: 10000,
  additionalDeduction65Blind: { single: 1950, married: 1550 },
  seniorBonusDeduction: 0,
  dependentCareExpenseLimits: { one: 3000, twoOrMore: 6000 },
  capitalGainsBrackets: {
    single: { zeroMax: 47025, fifteenMax: 518900 },
    mfj: { zeroMax: 94050, fifteenMax: 583750 },
    mfs: { zeroMax: 47025, fifteenMax: 291850 },
    hoh: { zeroMax: 63000, fifteenMax: 551350 },
    qw: { zeroMax: 94050, fifteenMax: 583750 },
  },
  niitRate: 0.038,
  niitThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qw: 250000 },
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qw: 250000 },
  qbiThreshold: { single: 182100, mfj: 364200, mfs: 182100, hoh: 182100, qw: 364200 },
  qbiPhaseInRange: { single: 50000, mfj: 100000, mfs: 50000, hoh: 50000, qw: 100000 },
  educatorExpensesMax: 300,
  saversCredit: {
    single: { fifty: 23000, twenty: 25000, ten: 38250 },
    mfj: { fifty: 46000, twenty: 50000, ten: 76500 },
    mfs: { fifty: 23000, twenty: 25000, ten: 38250 },
    hoh: { fifty: 34500, twenty: 37500, ten: 57375 },
    qw: { fifty: 46000, twenty: 50000, ten: 76500 },
  },
  saversCreditMaxContribPerPerson: 2000,
  medicalDeductionFloor: 0.075,
  hsaLimits: { selfOnly: 4150, family: 8300, catchUp55: 1000 },
  studentLoanPhaseout: {
    single: { start: 75000, end: 90000 }, mfj: { start: 150000, end: 180000 },
    mfs: { start: 0, end: 0 }, hoh: { start: 75000, end: 90000 }, qw: { start: 75000, end: 90000 },
  },
  studentLoanMaxDeduction: 2500,
  educationCreditPhaseout: {
    single: { start: 80000, end: 90000 }, mfj: { start: 160000, end: 180000 },
    mfs: { start: 0, end: 0 }, hoh: { start: 80000, end: 90000 }, qw: { start: 80000, end: 90000 },
  },
  eitcTable: {
    0: { creditRate: 0.0765, earnedIncomeAmount: 7840, phaseoutStart: { single: 9800, mfj: 16370, mfs: 9800, hoh: 9800, qw: 16370 }, phaseoutRate: 0.0765 },
    1: { creditRate: 0.34, earnedIncomeAmount: 11750, phaseoutStart: { single: 21560, mfj: 28120, mfs: 21560, hoh: 21560, qw: 28120 }, phaseoutRate: 0.1598 },
    2: { creditRate: 0.40, earnedIncomeAmount: 16510, phaseoutStart: { single: 21560, mfj: 28120, mfs: 21560, hoh: 21560, qw: 28120 }, phaseoutRate: 0.2106 },
    3: { creditRate: 0.45, earnedIncomeAmount: 16510, phaseoutStart: { single: 21560, mfj: 28120, mfs: 21560, hoh: 21560, qw: 28120 }, phaseoutRate: 0.2106 },
  },
  eitcInvestmentIncomeLimit: 11000,
  ssTaxabilityThresholds: {
    single: { lower: 25000, upper: 34000 },
    mfj: { lower: 32000, upper: 44000 },
    mfs: { lower: 0, upper: 0 },
    hoh: { lower: 25000, upper: 34000 },
    qw: { lower: 25000, upper: 34000 },
  },
  socialSecurityWageBase: 168600,
  socialSecurityRate: 0.124,
  medicareRate: 0.029,
  selfEmploymentTaxMultiplier: 0.9235,

  // CA 2024
  caTaxBrackets: {
    single: [
      { min: 0, max: 10412, rate: 0.01 },
      { min: 10412, max: 24684, rate: 0.02 },
      { min: 24684, max: 38959, rate: 0.04 },
      { min: 38959, max: 54081, rate: 0.06 },
      { min: 54081, max: 68350, rate: 0.08 },
      { min: 68350, max: 349137, rate: 0.093 },
      { min: 349137, max: 418961, rate: 0.103 },
      { min: 418961, max: 698271, rate: 0.113 },
      { min: 698271, max: Infinity, rate: 0.123 },
    ],
    mfj: [
      { min: 0, max: 20824, rate: 0.01 },
      { min: 20824, max: 49368, rate: 0.02 },
      { min: 49368, max: 77918, rate: 0.04 },
      { min: 77918, max: 108162, rate: 0.06 },
      { min: 108162, max: 136700, rate: 0.08 },
      { min: 136700, max: 698274, rate: 0.093 },
      { min: 698274, max: 837922, rate: 0.103 },
      { min: 837922, max: 1396542, rate: 0.113 },
      { min: 1396542, max: Infinity, rate: 0.123 },
    ],
    mfs: [
      { min: 0, max: 10412, rate: 0.01 },
      { min: 10412, max: 24684, rate: 0.02 },
      { min: 24684, max: 38959, rate: 0.04 },
      { min: 38959, max: 54081, rate: 0.06 },
      { min: 54081, max: 68350, rate: 0.08 },
      { min: 68350, max: 349137, rate: 0.093 },
      { min: 349137, max: 418961, rate: 0.103 },
      { min: 418961, max: 698271, rate: 0.113 },
      { min: 698271, max: Infinity, rate: 0.123 },
    ],
    hoh: [
      { min: 0, max: 20824, rate: 0.01 },
      { min: 20824, max: 49368, rate: 0.02 },
      { min: 49368, max: 77918, rate: 0.04 },
      { min: 77918, max: 108162, rate: 0.06 },
      { min: 108162, max: 136700, rate: 0.08 },
      { min: 136700, max: 698274, rate: 0.093 },
      { min: 698274, max: 837922, rate: 0.103 },
      { min: 837922, max: 1396542, rate: 0.113 },
      { min: 1396542, max: Infinity, rate: 0.123 },
    ],
    qw: [
      { min: 0, max: 20824, rate: 0.01 },
      { min: 20824, max: 49368, rate: 0.02 },
      { min: 49368, max: 77918, rate: 0.04 },
      { min: 77918, max: 108162, rate: 0.06 },
      { min: 108162, max: 136700, rate: 0.08 },
      { min: 136700, max: 698274, rate: 0.093 },
      { min: 698274, max: 837922, rate: 0.103 },
      { min: 837922, max: 1396542, rate: 0.113 },
      { min: 1396542, max: Infinity, rate: 0.123 },
    ],
  },
  caStandardDeduction: { single: 5363, mfj: 10726, mfs: 5363, hoh: 10726, qw: 10726 },
  caPersonalExemptionCredit: { single: 144, mfj: 288, mfs: 144, hoh: 144, qw: 144 },
  caMentalHealthThreshold: 1000000,
  caMentalHealthRate: 0.01,
  caDependentExemptionCredit: 433,
};

// ── 2025 config (OBBBA) ─────────────────────────────────────────

const config2025: TaxYearConfig = {
  taxBrackets: {
    mfj: [
      { min: 0, max: 24300, rate: 0.10 },
      { min: 24300, max: 98750, rate: 0.12 },
      { min: 98750, max: 201050, rate: 0.22 },
      { min: 201050, max: 383900, rate: 0.24 },
      { min: 383900, max: 487450, rate: 0.32 },
      { min: 487450, max: 731200, rate: 0.35 },
      { min: 731200, max: Infinity, rate: 0.37 },
    ],
    single: [
      { min: 0, max: 12150, rate: 0.10 },
      { min: 12150, max: 49375, rate: 0.12 },
      { min: 49375, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 },
    ],
    mfs: [
      { min: 0, max: 12150, rate: 0.10 },
      { min: 12150, max: 49375, rate: 0.12 },
      { min: 49375, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 365600, rate: 0.35 },
      { min: 365600, max: Infinity, rate: 0.37 },
    ],
    hoh: [
      { min: 0, max: 17400, rate: 0.10 },
      { min: 17400, max: 70000, rate: 0.12 },
      { min: 70000, max: 113800, rate: 0.22 },
      { min: 113800, max: 205250, rate: 0.24 },
      { min: 205250, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 },
    ],
    qw: [
      { min: 0, max: 24300, rate: 0.10 },
      { min: 24300, max: 98750, rate: 0.12 },
      { min: 98750, max: 201050, rate: 0.22 },
      { min: 201050, max: 383900, rate: 0.24 },
      { min: 383900, max: 487450, rate: 0.32 },
      { min: 487450, max: 731200, rate: 0.35 },
      { min: 731200, max: Infinity, rate: 0.37 },
    ],
  },
  standardDeduction: { single: 15475, mfj: 30950, mfs: 15475, hoh: 23225, qw: 30950 },
  childTaxCredit: 2200,
  childTaxCreditRefundableMax: 1900,
  saltCap: 40000,
  additionalDeduction65Blind: { single: 2050, married: 1650 },
  seniorBonusDeduction: 4000,
  dependentCareExpenseLimits: { one: 3000, twoOrMore: 6000 },
  capitalGainsBrackets: {
    single: { zeroMax: 48350, fifteenMax: 533400 },
    mfj: { zeroMax: 96700, fifteenMax: 600050 },
    mfs: { zeroMax: 48350, fifteenMax: 300025 },
    hoh: { zeroMax: 64750, fifteenMax: 566700 },
    qw: { zeroMax: 96700, fifteenMax: 600050 },
  },
  niitRate: 0.038,
  niitThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qw: 250000 },
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000, qw: 250000 },
  qbiThreshold: { single: 191950, mfj: 383900, mfs: 191950, hoh: 191950, qw: 383900 },
  qbiPhaseInRange: { single: 50000, mfj: 100000, mfs: 50000, hoh: 50000, qw: 100000 },
  educatorExpensesMax: 300,
  saversCredit: {
    single: { fifty: 23750, twenty: 25500, ten: 39500 },
    mfj: { fifty: 47500, twenty: 51000, ten: 79000 },
    mfs: { fifty: 23750, twenty: 25500, ten: 39500 },
    hoh: { fifty: 35625, twenty: 38250, ten: 59250 },
    qw: { fifty: 47500, twenty: 51000, ten: 79000 },
  },
  saversCreditMaxContribPerPerson: 2000,
  medicalDeductionFloor: 0.075,
  hsaLimits: { selfOnly: 4300, family: 8550, catchUp55: 1000 },
  studentLoanPhaseout: {
    single: { start: 75000, end: 90000 }, mfj: { start: 155000, end: 180000 },
    mfs: { start: 0, end: 0 }, hoh: { start: 75000, end: 90000 }, qw: { start: 75000, end: 90000 },
  },
  studentLoanMaxDeduction: 2500,
  educationCreditPhaseout: {
    single: { start: 80000, end: 90000 }, mfj: { start: 160000, end: 180000 },
    mfs: { start: 0, end: 0 }, hoh: { start: 80000, end: 90000 }, qw: { start: 80000, end: 90000 },
  },
  eitcTable: {
    0: { creditRate: 0.0765, earnedIncomeAmount: 8490, phaseoutStart: { single: 10620, mfj: 17730, mfs: 10620, hoh: 10620, qw: 17730 }, phaseoutRate: 0.0765 },
    1: { creditRate: 0.34, earnedIncomeAmount: 12730, phaseoutStart: { single: 23350, mfj: 30470, mfs: 23350, hoh: 23350, qw: 30470 }, phaseoutRate: 0.1598 },
    2: { creditRate: 0.40, earnedIncomeAmount: 17880, phaseoutStart: { single: 23350, mfj: 30470, mfs: 23350, hoh: 23350, qw: 30470 }, phaseoutRate: 0.2106 },
    3: { creditRate: 0.45, earnedIncomeAmount: 17880, phaseoutStart: { single: 23350, mfj: 30470, mfs: 23350, hoh: 23350, qw: 30470 }, phaseoutRate: 0.2106 },
  },
  eitcInvestmentIncomeLimit: 11600,
  ssTaxabilityThresholds: {
    single: { lower: 25000, upper: 34000 },
    mfj: { lower: 32000, upper: 44000 },
    mfs: { lower: 0, upper: 0 },
    hoh: { lower: 25000, upper: 34000 },
    qw: { lower: 25000, upper: 34000 },
  },
  socialSecurityWageBase: 176100,
  socialSecurityRate: 0.124,
  medicareRate: 0.029,
  selfEmploymentTaxMultiplier: 0.9235,

  // CA 2025 (inflation-adjusted brackets from FTB/CalFile)
  caTaxBrackets: {
    single: [
      { min: 0, max: 11079, rate: 0.01 },
      { min: 11079, max: 26264, rate: 0.02 },
      { min: 26264, max: 41452, rate: 0.04 },
      { min: 41452, max: 57542, rate: 0.06 },
      { min: 57542, max: 72724, rate: 0.08 },
      { min: 72724, max: 371479, rate: 0.093 },
      { min: 371479, max: 445771, rate: 0.103 },
      { min: 445771, max: 742953, rate: 0.113 },
      { min: 742953, max: Infinity, rate: 0.123 },
    ],
    mfj: [
      { min: 0, max: 22158, rate: 0.01 },
      { min: 22158, max: 52528, rate: 0.02 },
      { min: 52528, max: 82905, rate: 0.04 },
      { min: 82905, max: 115084, rate: 0.06 },
      { min: 115084, max: 145448, rate: 0.08 },
      { min: 145448, max: 742958, rate: 0.093 },
      { min: 742958, max: 891541, rate: 0.103 },
      { min: 891541, max: 1485907, rate: 0.113 },
      { min: 1485907, max: Infinity, rate: 0.123 },
    ],
    mfs: [
      { min: 0, max: 11079, rate: 0.01 },
      { min: 11079, max: 26264, rate: 0.02 },
      { min: 26264, max: 41452, rate: 0.04 },
      { min: 41452, max: 57542, rate: 0.06 },
      { min: 57542, max: 72724, rate: 0.08 },
      { min: 72724, max: 371479, rate: 0.093 },
      { min: 371479, max: 445771, rate: 0.103 },
      { min: 445771, max: 742953, rate: 0.113 },
      { min: 742953, max: Infinity, rate: 0.123 },
    ],
    hoh: [
      { min: 0, max: 22158, rate: 0.01 },
      { min: 22158, max: 52528, rate: 0.02 },
      { min: 52528, max: 82905, rate: 0.04 },
      { min: 82905, max: 115084, rate: 0.06 },
      { min: 115084, max: 145448, rate: 0.08 },
      { min: 145448, max: 742958, rate: 0.093 },
      { min: 742958, max: 891541, rate: 0.103 },
      { min: 891541, max: 1485907, rate: 0.113 },
      { min: 1485907, max: Infinity, rate: 0.123 },
    ],
    qw: [
      { min: 0, max: 22158, rate: 0.01 },
      { min: 22158, max: 52528, rate: 0.02 },
      { min: 52528, max: 82905, rate: 0.04 },
      { min: 82905, max: 115084, rate: 0.06 },
      { min: 115084, max: 145448, rate: 0.08 },
      { min: 145448, max: 742958, rate: 0.093 },
      { min: 742958, max: 891541, rate: 0.103 },
      { min: 891541, max: 1485907, rate: 0.113 },
      { min: 1485907, max: Infinity, rate: 0.123 },
    ],
  },
  caStandardDeduction: { single: 5706, mfj: 11412, mfs: 5706, hoh: 11412, qw: 11412 },
  caPersonalExemptionCredit: { single: 153, mfj: 306, mfs: 153, hoh: 153, qw: 153 },
  caMentalHealthThreshold: 1000000,
  caMentalHealthRate: 0.01,
  caDependentExemptionCredit: 475,
};

// ── Registry ────────────────────────────────────────────────────

const TAX_YEAR_CONFIGS: Record<number, TaxYearConfig> = {
  2023: config2023,
  2024: config2024,
  2025: config2025,
};

export const DEFAULT_TAX_YEAR = 2025;

export const SUPPORTED_TAX_YEARS = Object.keys(TAX_YEAR_CONFIGS).map(Number).sort();

/** Get the tax configuration for a given year. Throws for unsupported years. */
export function getTaxYearConfig(taxYear: number = DEFAULT_TAX_YEAR): TaxYearConfig {
  const config = TAX_YEAR_CONFIGS[taxYear];
  if (!config) {
    throw new Error(
      `Unsupported tax year: ${taxYear}. Supported years: ${SUPPORTED_TAX_YEARS.join(', ')}`,
    );
  }
  return config;
}
