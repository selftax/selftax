import type { TaxFormType, RedactedDocument } from '../types';
import type { W2Fields } from '../forms/w2Mapper';
import type { ScheduleAOutput } from '../engine/scheduleA';
import { calculateScheduleA } from '../engine/scheduleA';
import { calculateRentalDepreciation } from '../engine/scheduleE';
import { calculateForm2441 } from '../engine/form2441';

/** Anonymized tax situation — no PII, just financial facts */
export interface TaxSituation {
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh' | 'qw';
  /** Approximate AGI (rounded for anonymity) */
  approximateAGI?: number;
  hasW2Income: boolean;
  w2BoxCodes?: string[]; // e.g. ['V', 'W', 'DD']
  hasRentalProperty: boolean;
  rentalPurchaseYear?: number;
  rentalBuildingBasis?: number;
  rentalNetIncome?: number;
  hasStockSales: boolean;
  hasISOs: boolean;
  isoExercisedNotSold?: boolean;
  isoSpread?: number;
  hasDependentCareFSA: boolean;
  fsaAmount?: number;
  dependentCareExpenses?: number;
  qualifyingChildren?: number;
  primaryPropertyTax?: number;
  stateIncomeTax?: number;
  mortgageInterest?: number;
  charitableContributions?: number;
  /** State of residence (two-letter code, e.g. 'CA') */
  stateOfResidence?: string;
}

/** Build an anonymized context string for the LLM — no PII */
export function buildAdvisorContext(situation: TaxSituation): string {
  const lines: string[] = [
    `Filing status: ${situation.filingStatus}`,
  ];

  if (situation.approximateAGI) {
    lines.push(`Approximate AGI: ~$${Math.round(situation.approximateAGI / 1000) * 1000}`);
  }

  if (situation.hasW2Income) {
    lines.push('Has W-2 income');
    if (situation.w2BoxCodes?.length) {
      lines.push(`W-2 Box 12 codes: ${situation.w2BoxCodes.join(', ')}`);
    }
  }

  if (situation.hasRentalProperty) {
    lines.push('Has rental property');
    if (situation.rentalPurchaseYear) lines.push(`Purchased: ${situation.rentalPurchaseYear}`);
    if (situation.rentalBuildingBasis) lines.push(`Building basis: ~$${situation.rentalBuildingBasis}`);
    if (situation.rentalNetIncome !== undefined) {
      lines.push(`Net rental income/loss: $${situation.rentalNetIncome}`);
    }
  }

  if (situation.hasStockSales) {
    lines.push('Has stock sales (1099-B)');
  }

  if (situation.hasISOs) {
    lines.push('Has incentive stock options (ISOs)');
    if (situation.isoExercisedNotSold) {
      lines.push('ISOs exercised but NOT sold in same year');
      if (situation.isoSpread) lines.push(`ISO spread: ~$${situation.isoSpread}`);
    }
  }

  if (situation.hasDependentCareFSA) {
    lines.push(`Dependent care FSA: $${situation.fsaAmount ?? 0}`);
    if (situation.dependentCareExpenses) {
      lines.push(`Total dependent care expenses: $${situation.dependentCareExpenses}`);
    }
  }

  return lines.join('\n');
}

/** Determine which tax forms are required based on the situation */
export function determineRequiredForms(situation: TaxSituation): TaxFormType[] {
  const forms: TaxFormType[] = ['1040'];

  // Schedule A — if likely to itemize
  if (situation.primaryPropertyTax || situation.mortgageInterest || situation.charitableContributions) {
    forms.push('schedule-a');
  }

  // Schedule D + Form 8949 — stock sales
  if (situation.hasStockSales) {
    forms.push('schedule-d');
    forms.push('form-8949');
  }

  // Schedule E + Form 4562 — rental property
  if (situation.hasRentalProperty) {
    forms.push('schedule-e');
    forms.push('form-4562');
  }

  // Form 2441 — dependent care
  if (situation.hasDependentCareFSA || (situation.dependentCareExpenses && situation.dependentCareExpenses > 0)) {
    forms.push('form-2441');
  }

  // Form 6251 — AMT (ISO holders)
  if (situation.hasISOs && situation.isoExercisedNotSold) {
    forms.push('form-6251');
  }

  // California Form 540 — state income tax
  if (situation.stateOfResidence?.toUpperCase() === 'CA') {
    forms.push('ca-540');
  }

  return forms;
}

export interface TaxGuidance {
  topic: string;
  advice: string;
  severity: 'info' | 'warning' | 'critical';
}

/** Generate deterministic guidance based on the tax situation */
export function generateGuidance(situation: TaxSituation): TaxGuidance[] {
  const guidance: TaxGuidance[] = [];

  // Standard vs itemized
  if (situation.primaryPropertyTax || situation.mortgageInterest) {
    const schedA = calculateScheduleA({
      filingStatus: situation.filingStatus,
      stateIncomeTax: situation.stateIncomeTax,
      primaryPropertyTax: situation.primaryPropertyTax,
      mortgageInterest: situation.mortgageInterest,
      charitableCash: situation.charitableContributions,
    });

    if (schedA.shouldItemize) {
      guidance.push({
        topic: 'Standard vs Itemized Deduction',
        advice: `Itemize — you save $${schedA.savingsOverStandard.toLocaleString()} over the standard deduction ($${schedA.totalItemized.toLocaleString()} itemized vs $${schedA.standardDeduction.toLocaleString()} standard).`,
        severity: 'info',
      });
    } else {
      guidance.push({
        topic: 'Standard vs Itemized Deduction',
        advice: `Take the standard deduction ($${schedA.standardDeduction.toLocaleString()}). Your itemized deductions ($${schedA.totalItemized.toLocaleString()}) are lower.`,
        severity: 'info',
      });
    }
  }

  // Rental depreciation
  if (situation.hasRentalProperty && situation.rentalBuildingBasis) {
    const annualDepreciation = calculateRentalDepreciation(situation.rentalBuildingBasis);
    guidance.push({
      topic: 'Rental Property Depreciation',
      advice: `Depreciate $${situation.rentalBuildingBasis.toLocaleString()} over 27.5 years = $${annualDepreciation.toLocaleString()}/year on Form 4562. Depreciation is mandatory — the IRS requires it whether you claim it or not.`,
      severity: 'info',
    });
  }

  // Passive activity loss
  if (situation.hasRentalProperty && situation.approximateAGI) {
    if (situation.approximateAGI > 150000 && situation.rentalNetIncome !== undefined && situation.rentalNetIncome < 0) {
      guidance.push({
        topic: 'Passive Activity Loss Limitation',
        advice: `Your rental losses are fully suspended — AGI over $150,000. These losses carry forward and are fully deductible when you sell the property.`,
        severity: 'warning',
      });
    } else if (situation.approximateAGI > 100000 && situation.approximateAGI <= 150000) {
      guidance.push({
        topic: 'Passive Activity Loss Limitation',
        advice: `Your rental loss deduction is partially limited. AGI between $100,000-$150,000 means the $25,000 allowance is phased out.`,
        severity: 'warning',
      });
    }
  }

  // ISO / RSU
  if (situation.w2BoxCodes?.includes('V')) {
    guidance.push({
      topic: 'Stock Compensation (Code V)',
      advice: `W-2 Box 12 Code V = NQSO/RSU exercise income. Already included in Box 1 wages. When you sell these shares, check your 1099-B cost basis — brokerages often report $0, but you've already been taxed.`,
      severity: 'warning',
    });
  }

  if (situation.hasISOs && situation.isoExercisedNotSold) {
    guidance.push({
      topic: 'AMT Risk — Incentive Stock Options',
      advice: `ISO spread ($${(situation.isoSpread ?? 0).toLocaleString()}) is an AMT preference item. You may owe Alternative Minimum Tax (Form 6251) even though you haven't sold the shares.`,
      severity: 'critical',
    });
  }

  // Dependent care FSA
  if (situation.hasDependentCareFSA && situation.fsaAmount) {
    const form2441 = calculateForm2441({
      qualifyingExpenses: situation.dependentCareExpenses ?? situation.fsaAmount,
      qualifyingPersons: situation.qualifyingChildren ?? 1,
      fsaExclusion: situation.fsaAmount,
      agi: situation.approximateAGI ?? 0,
    });

    if (form2441.credit === 0) {
      guidance.push({
        topic: 'Dependent Care FSA vs Credit',
        advice: `With $${situation.fsaAmount.toLocaleString()} FSA exclusion, your remaining dependent care credit is $0. The FSA is more beneficial than the credit at your income level.`,
        severity: 'info',
      });
    } else {
      guidance.push({
        topic: 'Dependent Care FSA vs Credit',
        advice: `After $${situation.fsaAmount.toLocaleString()} FSA exclusion, you may still qualify for a $${form2441.credit.toLocaleString()} dependent care credit.`,
        severity: 'info',
      });
    }
  }

  return guidance;
}
