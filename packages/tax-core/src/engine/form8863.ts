/**
 * Form 8863 — Education Credits (AOTC and Lifetime Learning)
 *
 * AOTC: 100% of first $2k + 25% of next $2k = max $2,500/student. 40% refundable.
 * LLC: 20% of first $10k = max $2,000/return. Nonrefundable.
 * Both phase out at MAGI $80k-$90k single, $160k-$180k MFJ.
 */

import { irsRound } from './form1040';
import type { FilingStatus } from './taxConstants';
import { getTaxYearConfig } from './taxYearConfigs';

export interface EducationCreditInput {
  type: 'aotc' | 'llc';
  filingStatus: FilingStatus;
  taxYear?: number;
  /** Total qualified expenses */
  expenses: number;
  /** Number of students (AOTC is per-student; LLC is per-return) */
  students?: number;
  /** MAGI for phaseout calculation */
  magi: number;
}

export interface EducationCreditOutput {
  /** Total credit before phaseout */
  totalCredit: number;
  /** Credit after MAGI phaseout */
  creditAfterPhaseout: number;
  /** Nonrefundable portion (reduces tax, floored at 0) */
  nonrefundableCredit: number;
  /** Refundable portion (AOTC only — 40% of credit, adds to payments) */
  refundableCredit: number;
}

export function calculateEducationCredit(input: EducationCreditInput): EducationCreditOutput {
  const config = getTaxYearConfig(input.taxYear);
  const phaseout = config.educationCreditPhaseout[input.filingStatus];

  let totalCredit: number;
  if (input.type === 'aotc') {
    const students = input.students ?? 1;
    const perStudent = Math.min(input.expenses / students, 4000);
    const creditPerStudent = irsRound(Math.min(perStudent, 2000) + Math.max(0, perStudent - 2000) * 0.25);
    totalCredit = creditPerStudent * students;
  } else {
    // LLC: 20% of first $10,000 per return
    totalCredit = irsRound(Math.min(input.expenses, 10000) * 0.20);
  }

  // MAGI phaseout
  let phaseoutFraction = 1;
  if (input.magi > phaseout.start) {
    if (input.magi >= phaseout.end) {
      phaseoutFraction = 0;
    } else {
      phaseoutFraction = (phaseout.end - input.magi) / (phaseout.end - phaseout.start);
    }
  }

  const creditAfterPhaseout = irsRound(totalCredit * phaseoutFraction);

  // AOTC: 40% refundable, 60% nonrefundable
  // LLC: fully nonrefundable
  let refundableCredit = 0;
  let nonrefundableCredit = creditAfterPhaseout;
  if (input.type === 'aotc') {
    refundableCredit = irsRound(creditAfterPhaseout * 0.40);
    nonrefundableCredit = creditAfterPhaseout - refundableCredit;
  }

  return { totalCredit, creditAfterPhaseout, nonrefundableCredit, refundableCredit };
}
