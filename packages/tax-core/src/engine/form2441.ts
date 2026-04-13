import { irsRound } from './form1040';

export interface Form2441Input {
  /** Total qualifying dependent care expenses */
  qualifyingExpenses: number;
  /** Number of qualifying persons (1 or 2+) */
  qualifyingPersons: number;
  /** Dependent care FSA exclusion used */
  fsaExclusion?: number;
  /** Taxpayer's AGI */
  agi: number;
}

export interface Form2441Output {
  /** Max qualifying expenses allowed */
  maxExpenses: number;
  /** Expenses after FSA reduction */
  expensesAfterFSA: number;
  /** Credit percentage based on AGI */
  creditPercentage: number;
  /** Final dependent care credit */
  credit: number;
}

/** Get credit percentage based on AGI */
export function getDependentCarePercentage(agi: number): number {
  if (agi <= 15000) return 0.35;
  if (agi >= 43000) return 0.20;
  // Decreases by 1% for each $2,000 (or fraction) over $15,000
  const stepsOver = Math.ceil((agi - 15000) / 2000);
  return Math.max(0.20, 0.35 - stepsOver * 0.01);
}

export function calculateForm2441(input: Form2441Input): Form2441Output {
  // Max qualifying expenses: $3,000 for 1 person, $6,000 for 2+
  const maxExpenses = input.qualifyingPersons >= 2 ? 6000 : 3000;

  // Actual expenses, capped at max
  const cappedExpenses = Math.min(input.qualifyingExpenses, maxExpenses);

  // Reduce by FSA exclusion
  const expensesAfterFSA = Math.max(0, cappedExpenses - (input.fsaExclusion ?? 0));

  const creditPercentage = getDependentCarePercentage(input.agi);
  const credit = irsRound(expensesAfterFSA * creditPercentage);

  return {
    maxExpenses,
    expensesAfterFSA,
    creditPercentage,
    credit,
  };
}
