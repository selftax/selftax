import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';
import { calculateNIIT } from './form8960';
import { calculateAdditionalMedicare } from './form8959';
import { calculateScheduleSE } from './scheduleSE';
import { calculateTaxableSocialSecurity } from './socialSecurity';
import { calculateEducationCredit } from './form8863';
import { calculateEITC } from './eitc';
import { calculateSaversCredit } from './form8880';

/** Round to nearest dollar per IRS rules (0.50 rounds up) */
export function irsRound(amount: number): number {
  return Math.round(amount);
}

/** Input data for Form 1040 calculation */
export interface Form1040Input {
  filingStatus: FilingStatus;
  /** Tax year (defaults to 2025) */
  taxYear?: number;
  /** Line 1a: Wages from W-2 */
  wages?: number;
  /** Line 3a: Qualified dividends */
  qualifiedDividends?: number;
  /** Line 3b: Ordinary dividends */
  ordinaryDividends?: number;
  /** Line 7: Capital gain/loss from Schedule D (treated as short-term if LTCG/STCG not specified) */
  capitalGains?: number;
  /** Long-term capital gains (held > 1 year) — taxed at preferential 0%/15%/20% rates */
  longTermCapitalGains?: number;
  /** Short-term capital gains (held <= 1 year) — taxed at ordinary rates */
  shortTermCapitalGains?: number;
  /** Line 8: Other income (Schedule 1) — includes rental from Schedule E */
  rentalIncome?: number;
  otherIncome?: number;
  /** Line 10: Adjustments (Schedule 1, Part II) */
  adjustments?: number;
  /** Schedule A total (if itemizing) */
  itemizedDeductions?: number;
  /** Number of qualifying children for CTC */
  qualifyingChildren?: number;
  /** Dependent care credit (from Form 2441) */
  dependentCareCredit?: number;
  /** Other credits */
  otherCredits?: number;
  /** Federal tax withheld (from W-2 Box 2, 1099s, etc.) */
  federalWithholding?: number;
  /** Estimated tax payments */
  estimatedPayments?: number;
  /** Additional Medicare tax already withheld by employer */
  additionalMedicareWithheld?: number;
  /** Self-employment income (for Additional Medicare Tax calculation) */
  selfEmploymentIncome?: number;
  /** Line 6a: Social Security benefits (gross, from SSA-1099) */
  socialSecurityBenefits?: number;
  /** Tax-exempt interest (for SS combined income calculation) */
  nontaxableInterest?: number;
  /** Line 4a: IRA distributions (total) */
  iraDistributions?: number;
  /** Line 4b: Taxable IRA distributions */
  taxableIraDistributions?: number;
  /** Line 5a: Pension/annuity distributions (total) */
  pensionDistributions?: number;
  /** Line 5b: Taxable pensions/annuities */
  taxablePensions?: number;
  /** HSA deduction (above-the-line, reduces AGI) */
  hsaDeduction?: number;
  /** Student loan interest paid (max $2,500, MAGI phaseout applies) */
  studentLoanInterest?: number;
  /** Education credit: qualified expenses */
  educationExpenses?: number;
  /** Education credit type: 'aotc' or 'llc' */
  educationCreditType?: 'aotc' | 'llc';
  /** Number of students for AOTC (per-student credit) */
  numberOfStudents?: number;
  /** Earned income for EITC (wages + net SE) */
  earnedIncome?: number;
  /** Qualifying children for EITC (0/1/2/3+) */
  qualifyingChildrenForEITC?: number;
  /** Investment income for EITC test */
  investmentIncomeForEITC?: number;
  /** Premium Tax Credit (Form 8962): positive=additional credit, negative=repayment */
  premiumTaxCredit?: number;
  /** Foreign tax credit (Form 1116): nonrefundable, pre-computed */
  foreignTaxCredit?: number;
  /** Retirement contributions for Saver's Credit (Form 8880) */
  retirementContributions?: number;
  /** Form 4797: gain/loss from sale of business property */
  form4797Gain?: number;
  /** K-1 ordinary income (partnerships/S-corps) */
  k1OrdinaryIncome?: number;
  /** K-1 rental income/loss */
  k1RentalIncome?: number;
  /** Clean energy credit (Form 5695 Part I): nonrefundable, pre-computed */
  cleanEnergyCredit?: number;
  /** Energy improvement credit (Form 5695 Part II): nonrefundable, pre-computed */
  energyImprovementCredit?: number;
  /** Educator expenses (above-the-line, max $300) */
  educatorExpenses?: number;
  /** Unemployment compensation (fully taxable) */
  unemploymentCompensation?: number;
  /** Alimony received (pre-2019 agreements) */
  alimonyReceived?: number;
  /** Net farm income/loss (Schedule F) */
  farmIncome?: number;
  /** Qualified business income for Section 199A deduction */
  qbiIncome?: number;
  /** QBI W-2 wages paid by the business (for wage limitation) */
  qbiW2Wages?: number;
  /** QBI unadjusted basis of qualified property */
  qbiPropertyBasis?: number;
  /** Whether QBI is from a Specified Service Trade or Business */
  isQbiSSTB?: boolean;
  /** Capital loss carryforward from prior year (positive number) */
  capitalLossCarryforward?: number;
  /** Is filer 65+ for senior bonus? */
  isSenior?: boolean;
}

export interface Form1040Output {
  /** Line 9: Total income */
  totalIncome: number;
  /** Line 11: Adjusted Gross Income */
  agi: number;
  /** Line 13: Deduction used (standard or itemized) */
  deduction: number;
  deductionType: 'standard' | 'itemized';
  /** Line 13: QBI deduction (Section 199A) */
  qbiDeduction: number;
  /** Line 15: Taxable income */
  taxableIncome: number;
  /** Line 16: Tax from brackets */
  tax: number;
  /** Child tax credit (non-refundable, from Schedule 8812 line 12) */
  childTaxCredit: number;
  /** Total credits applied */
  totalCredits: number;
  /** Line 24: Total tax after credits */
  totalTax: number;
  /** Line 33: Total payments (withholding + estimated) */
  totalPayments: number;
  /** Line 34: Overpayment (refund) or Line 37: Amount owed */
  refundOrOwed: number;
  /** Positive = refund, negative = owed */
  isRefund: boolean;
}

/** Get total capital gains from input (LTCG+STCG or legacy capitalGains) */
function getCapitalGains(input: Form1040Input): number {
  return (input.longTermCapitalGains !== undefined || input.shortTermCapitalGains !== undefined)
    ? (input.longTermCapitalGains ?? 0) + (input.shortTermCapitalGains ?? 0)
    : (input.capitalGains ?? 0);
}

/** Income without Social Security (used to compute SS taxable amount) */
function calculateIncomeWithoutSS(input: Form1040Input): number {
  return irsRound(
    (input.wages ?? 0) +
    (input.ordinaryDividends ?? 0) +
    getCapitalGains(input) +
    (input.selfEmploymentIncome ?? 0) +
    (input.taxableIraDistributions ?? 0) +
    (input.taxablePensions ?? 0) +
    (input.rentalIncome ?? 0) +
    (input.form4797Gain ?? 0) +
    (input.k1OrdinaryIncome ?? 0) +
    (input.k1RentalIncome ?? 0) +
    (input.unemploymentCompensation ?? 0) +
    (input.alimonyReceived ?? 0) +
    (input.farmIncome ?? 0) +
    (input.otherIncome ?? 0) +
    (input.capitalLossCarryforward ? -Math.min(3000, input.capitalLossCarryforward) : 0),
  );
}

/** Calculate total income (Line 9) — includes taxable SS, IRA, pension */
export function calculateTotalIncome(input: Form1040Input): number {
  const incomeWithoutSS = calculateIncomeWithoutSS(input);

  // Compute taxable Social Security if benefits provided
  let taxableSS = 0;
  if (input.socialSecurityBenefits && input.socialSecurityBenefits > 0) {
    // AGI without SS = income without SS - adjustments - SE deductible half
    const seResult = calculateScheduleSE({
      netSEIncome: input.selfEmploymentIncome ?? 0,
      wages: input.wages,
      taxYear: input.taxYear,
    });
    const agiWithoutSS = irsRound(incomeWithoutSS - (input.adjustments ?? 0) - seResult.deductibleHalf);
    const ssResult = calculateTaxableSocialSecurity({
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      socialSecurityBenefits: input.socialSecurityBenefits,
      agiWithoutSS,
      nontaxableInterest: input.nontaxableInterest,
    });
    taxableSS = ssResult.taxableAmount;
  }

  return irsRound(incomeWithoutSS + taxableSS);
}

/** Calculate AGI (Line 11) �� includes all above-the-line deductions */
export function calculateAGI(input: Form1040Input): number {
  const totalIncome = calculateTotalIncome(input);
  const seResult = calculateScheduleSE({
    netSEIncome: input.selfEmploymentIncome ?? 0,
    wages: input.wages,
    taxYear: input.taxYear,
  });
  const hsaDeduction = input.hsaDeduction ?? 0;
  // Student loan phaseout simplified for standalone function (no phaseout applied here)
  const studentLoan = Math.min(input.studentLoanInterest ?? 0, 2500);
  return irsRound(totalIncome - (input.adjustments ?? 0) - seResult.deductibleHalf - hsaDeduction - studentLoan);
}

/** Exported for tests — calculates taxable Social Security amount */
export { calculateTaxableSocialSecurity } from './socialSecurity';

/** Determine deduction (standard vs itemized) */
export function calculateDeduction(
  input: Form1040Input,
): { amount: number; type: 'standard' | 'itemized' } {
  const config = getTaxYearConfig(input.taxYear);
  const standard = config.standardDeduction[input.filingStatus];
  const itemized = input.itemizedDeductions ?? 0;

  if (itemized > standard) {
    return { amount: irsRound(itemized), type: 'itemized' };
  }
  return { amount: standard, type: 'standard' };
}

/** Calculate taxable income (Line 15) */
export function calculateTaxableIncome(input: Form1040Input): number {
  const agi = calculateAGI(input);
  const { amount: deduction } = calculateDeduction(input);
  return Math.max(0, irsRound(agi - deduction));
}

/** Calculate tax from brackets (Line 16) */
export function calculateTax(taxableIncome: number, filingStatus: FilingStatus, taxYear?: number): number {
  const config = getTaxYearConfig(taxYear);
  const brackets = config.taxBrackets[filingStatus];
  let tax = 0;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
    tax += taxableInBracket * bracket.rate;
  }

  return irsRound(tax);
}

/**
 * Calculate tax using preferential rates for LTCG and qualified dividends.
 * Implements the IRS Qualified Dividends and Capital Gain Tax Worksheet.
 *
 * The worksheet stacks income: ordinary income fills from the bottom,
 * then preferential income (QD + LTCG) stacks on top. The preferential
 * portion is taxed at 0%/15%/20% based on where it falls in the thresholds.
 *
 * Returns the lesser of the preferential calculation or straight bracket tax.
 */
export function calculateTaxWithPreferentialRates(
  taxableIncome: number,
  qualifiedDividends: number,
  longTermCapitalGains: number,
  filingStatus: FilingStatus,
  taxYear?: number,
): number {
  const config = getTaxYearConfig(taxYear);
  const thresholds = config.capitalGainsBrackets[filingStatus];

  // Total preferential income (QD + LTCG, but not more than taxable income)
  const preferentialIncome = Math.min(qualifiedDividends + longTermCapitalGains, taxableIncome);

  if (preferentialIncome <= 0) {
    return calculateTax(taxableIncome, filingStatus, taxYear);
  }

  // Ordinary income = taxable income minus preferential portion
  const ordinaryIncome = Math.max(0, taxableIncome - preferentialIncome);

  // Tax on ordinary income at bracket rates
  const ordinaryTax = calculateTax(ordinaryIncome, filingStatus, taxYear);

  // Apply 0%/15%/20% to the preferential portion based on where it stacks
  // The preferential income sits "on top of" ordinary income in the bracket space
  const prefStart = ordinaryIncome; // where preferential income starts stacking
  const prefEnd = taxableIncome; // where it ends

  let prefTax = 0;

  // 0% portion: from prefStart up to zeroMax
  if (prefStart < thresholds.zeroMax) {
    const zeroEnd = Math.min(prefEnd, thresholds.zeroMax);
    // 0% rate — no tax added
    const _zeroPortion = zeroEnd - prefStart;

    // 15% portion: from zeroMax up to fifteenMax
    if (prefEnd > thresholds.zeroMax) {
      const fifteenStart = thresholds.zeroMax;
      const fifteenEnd = Math.min(prefEnd, thresholds.fifteenMax);
      prefTax += (fifteenEnd - fifteenStart) * 0.15;

      // 20% portion: above fifteenMax
      if (prefEnd > thresholds.fifteenMax) {
        prefTax += (prefEnd - thresholds.fifteenMax) * 0.20;
      }
    }
  } else if (prefStart < thresholds.fifteenMax) {
    // All preferential income starts above 0% threshold
    const fifteenEnd = Math.min(prefEnd, thresholds.fifteenMax);
    prefTax += (fifteenEnd - prefStart) * 0.15;

    if (prefEnd > thresholds.fifteenMax) {
      prefTax += (prefEnd - thresholds.fifteenMax) * 0.20;
    }
  } else {
    // All preferential income is in the 20% bracket
    prefTax += preferentialIncome * 0.20;
  }

  const preferentialTotal = irsRound(ordinaryTax + prefTax);

  // IRS worksheet: use the lesser of preferential calculation or straight bracket tax
  const straightTax = calculateTax(taxableIncome, filingStatus, taxYear);
  return Math.min(preferentialTotal, straightTax);
}

/** Calculate child tax credit */
export function calculateChildTaxCredit(
  qualifyingChildren: number,
  tax: number,
  taxYear?: number,
): number {
  const config = getTaxYearConfig(taxYear);
  const maxCredit = qualifyingChildren * config.childTaxCredit;
  // Non-refundable portion limited to tax liability
  return Math.min(maxCredit, tax);
}

/** Full Form 1040 calculation */
export function calculateForm1040(input: Form1040Input): Form1040Output {
  const totalIncome = calculateTotalIncome(input);

  // Compute SE tax early — deductible half reduces AGI
  const seResult = calculateScheduleSE({
    netSEIncome: input.selfEmploymentIncome ?? 0,
    wages: input.wages,
    taxYear: input.taxYear,
  });

  // Above-the-line deductions (Schedule 1 Part II → reduce AGI)
  const hsaDeduction = input.hsaDeduction ?? 0;

  // Student loan interest: cap at $2,500, apply MAGI phaseout
  let studentLoanDeduction = 0;
  if (input.studentLoanInterest && input.studentLoanInterest > 0) {
    const config = getTaxYearConfig(input.taxYear);
    const capped = Math.min(input.studentLoanInterest, config.studentLoanMaxDeduction);
    const phaseout = config.studentLoanPhaseout[input.filingStatus];
    // Preliminary MAGI for phaseout (income before this deduction)
    const prelimMagi = totalIncome - (input.adjustments ?? 0) - seResult.deductibleHalf - hsaDeduction;
    if (prelimMagi < phaseout.start) {
      studentLoanDeduction = capped;
    } else if (prelimMagi >= phaseout.end) {
      studentLoanDeduction = 0;
    } else {
      const fraction = (phaseout.end - prelimMagi) / (phaseout.end - phaseout.start);
      studentLoanDeduction = irsRound(capped * fraction);
    }
  }

  // Educator expenses: above-the-line, capped
  const config = getTaxYearConfig(input.taxYear);
  const educatorDeduction = Math.min(input.educatorExpenses ?? 0, config.educatorExpensesMax);

  const totalAdjustments = (input.adjustments ?? 0) + seResult.deductibleHalf + hsaDeduction + studentLoanDeduction + educatorDeduction;
  const agi = irsRound(totalIncome - totalAdjustments);
  const { amount: deduction, type: deductionType } = calculateDeduction(input);

  // QBI deduction (Section 199A, line 13): 20% of QBI, taken after standard/itemized deduction
  let qbiDeduction = 0;
  if (input.qbiIncome && input.qbiIncome > 0) {
    const qbiConfig = getTaxYearConfig(input.taxYear);
    const threshold = qbiConfig.qbiThreshold[input.filingStatus];
    const phaseIn = qbiConfig.qbiPhaseInRange[input.filingStatus];
    const rawQBI = irsRound(input.qbiIncome * 0.2);

    if (agi <= threshold) {
      // Below threshold: full 20% deduction (simplified)
      qbiDeduction = rawQBI;
    } else if (input.isQbiSSTB && agi >= threshold + phaseIn) {
      // SSTB above phase-in: fully disallowed
      qbiDeduction = 0;
    } else if (agi >= threshold + phaseIn) {
      // Non-SSTB above phase-in: W-2 wage/UBIA limitation
      const wageLimit1 = irsRound((input.qbiW2Wages ?? 0) * 0.5);
      const wageLimit2 = irsRound((input.qbiW2Wages ?? 0) * 0.25 + (input.qbiPropertyBasis ?? 0) * 0.025);
      qbiDeduction = Math.min(rawQBI, Math.max(wageLimit1, wageLimit2));
    } else {
      // In phase-in range: partial reduction
      const excessOverThreshold = agi - threshold;
      const reductionFraction = excessOverThreshold / phaseIn;
      if (input.isQbiSSTB) {
        // SSTB: reduce QBI itself proportionally
        const reducedQBI = irsRound(input.qbiIncome * (1 - reductionFraction));
        qbiDeduction = irsRound(reducedQBI * 0.2);
      } else {
        // Non-SSTB: phase in the wage limitation
        const wageLimit1 = irsRound((input.qbiW2Wages ?? 0) * 0.5);
        const wageLimit2 = irsRound((input.qbiW2Wages ?? 0) * 0.25 + (input.qbiPropertyBasis ?? 0) * 0.025);
        const wageLimited = Math.min(rawQBI, Math.max(wageLimit1, wageLimit2));
        const excessOverWage = rawQBI - wageLimited;
        qbiDeduction = irsRound(rawQBI - excessOverWage * reductionFraction);
      }
    }
  }

  const taxableIncome = Math.max(0, irsRound(agi - deduction - qbiDeduction));

  // Use preferential rates when LTCG or qualified dividends are present
  const qd = input.qualifiedDividends ?? 0;
  const ltcg = input.longTermCapitalGains ?? 0;
  const tax = (qd > 0 || ltcg > 0)
    ? calculateTaxWithPreferentialRates(taxableIncome, qd, ltcg, input.filingStatus, input.taxYear)
    : calculateTax(taxableIncome, input.filingStatus, input.taxYear);

  // Credits
  const ctc = calculateChildTaxCredit(input.qualifyingChildren ?? 0, tax, input.taxYear);
  const dependentCareCredit = input.dependentCareCredit ?? 0;
  const otherCredits = input.otherCredits ?? 0;

  // Education credit (Form 8863)
  let educationNonrefundable = 0;
  let educationRefundable = 0;
  if (input.educationExpenses && input.educationExpenses > 0 && input.educationCreditType) {
    const eduResult = calculateEducationCredit({
      type: input.educationCreditType,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      expenses: input.educationExpenses,
      students: input.numberOfStudents,
      magi: agi,
    });
    educationNonrefundable = eduResult.nonrefundableCredit;
    educationRefundable = eduResult.refundableCredit;
  }

  // Foreign tax credit (nonrefundable)
  const foreignTaxCreditAmount = input.foreignTaxCredit ?? 0;

  // Saver's credit (nonrefundable)
  let saversCreditAmount = 0;
  if (input.retirementContributions && input.retirementContributions > 0) {
    const saversResult = calculateSaversCredit({
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      contributions: input.retirementContributions,
      agi,
    });
    saversCreditAmount = saversResult.credit;
  }

  // Energy credits (nonrefundable, pre-computed)
  const energyCredits = (input.cleanEnergyCredit ?? 0) + (input.energyImprovementCredit ?? 0);

  const totalCredits = irsRound(
    ctc + dependentCareCredit + educationNonrefundable +
    foreignTaxCreditAmount + saversCreditAmount + energyCredits + otherCredits,
  );

  const taxAfterCredits = Math.max(0, irsRound(tax - totalCredits));

  // Surtaxes (Schedule 2 Part II)
  // NIIT: 3.8% on investment income when AGI exceeds threshold
  const capGainsForNIIT = getCapitalGains(input);
  const netInvestmentIncome = Math.max(0,
    (input.ordinaryDividends ?? 0) + capGainsForNIIT + (input.rentalIncome ?? 0),
  );
  const niitResult = calculateNIIT({
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    magi: agi,
    netInvestmentIncome,
  });

  // Additional Medicare: 0.9% on wages exceeding threshold
  const additionalMedicareResult = calculateAdditionalMedicare({
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    wages: input.wages ?? 0,
    selfEmploymentIncome: input.selfEmploymentIncome,
    additionalMedicareWithheld: input.additionalMedicareWithheld,
  });

  // Premium Tax Credit: negative = excess APTC repayment (adds to tax)
  const ptcRepayment = Math.max(0, -(input.premiumTaxCredit ?? 0));
  // Positive PTC is refundable (handled in payments below)
  const ptcRefundable = Math.max(0, input.premiumTaxCredit ?? 0);

  const totalTax = irsRound(
    taxAfterCredits +
    seResult.seTax +
    niitResult.niit +
    additionalMedicareResult.totalAdditionalTax +
    ptcRepayment,
  );

  // EITC (refundable credit)
  let eitcCredit = 0;
  if (input.earnedIncome !== undefined && input.qualifyingChildrenForEITC !== undefined) {
    const eitcResult = calculateEITC({
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
      earnedIncome: input.earnedIncome,
      agi,
      qualifyingChildren: input.qualifyingChildrenForEITC,
      investmentIncome: input.investmentIncomeForEITC,
    });
    eitcCredit = eitcResult.credit;
  }

  // Payments (include refundable credits and excess withholding)
  const totalPayments = irsRound(
    (input.federalWithholding ?? 0) +
    (input.estimatedPayments ?? 0) +
    additionalMedicareResult.excessWithholding +
    educationRefundable +
    eitcCredit +
    ptcRefundable,
  );

  const refundOrOwed = irsRound(totalPayments - totalTax);

  return {
    totalIncome,
    agi,
    deduction,
    deductionType,
    qbiDeduction,
    taxableIncome,
    tax,
    childTaxCredit: ctc,
    totalCredits,
    totalTax,
    totalPayments,
    refundOrOwed,
    isRefund: refundOrOwed >= 0,
  };
}
