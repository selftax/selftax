/**
 * Schedule C — Profit or Loss From Business (Sole Proprietorship)
 *
 * Calculates net business income from gross receipts minus expenses.
 * Net profit flows to Schedule 1 line 3 → Form 1040 line 8.
 * Net profit also feeds Schedule SE for self-employment tax.
 */

import { irsRound } from './form1040';

export interface ScheduleCInput {
  /** Line 1: Gross receipts or sales */
  grossReceipts: number;
  /** Line 2: Returns and allowances */
  returnsAndAllowances?: number;
  /** Line 4: Cost of goods sold */
  costOfGoodsSold?: number;

  // Expenses (Lines 8-27)
  advertising?: number;
  carAndTruck?: number;
  commissions?: number;
  contractLabor?: number;
  depreciation?: number;
  employeeBenefits?: number;
  insurance?: number;
  interestMortgage?: number;
  interestOther?: number;
  legalAndProfessional?: number;
  office?: number;
  pensionProfitSharing?: number;
  rentLease?: number;
  repairs?: number;
  supplies?: number;
  taxesAndLicenses?: number;
  travel?: number;
  /** Meals (only 50% is deductible) */
  meals?: number;
  utilities?: number;
  wages?: number;
  otherExpenses?: number;

  /** Simplified home office: square footage (max 300, $5/sqft) */
  homeOfficeSquareFeet?: number;
}

export interface ScheduleCOutput {
  /** Line 7: Gross income */
  grossIncome: number;
  /** Total deductible expenses (meals at 50%) */
  totalExpenses: number;
  /** Line 31: Net profit or loss */
  netProfit: number;
  /** Home office deduction amount (may be limited) */
  homeOfficeDeduction: number;
}

export function calculateScheduleC(input: ScheduleCInput): ScheduleCOutput {
  const grossIncome = irsRound(
    input.grossReceipts -
    (input.returnsAndAllowances ?? 0) -
    (input.costOfGoodsSold ?? 0),
  );

  // Sum all expenses (meals at 50%)
  const deductibleMeals = irsRound((input.meals ?? 0) * 0.5);

  const expensesBeforeHomeOffice = irsRound(
    (input.advertising ?? 0) +
    (input.carAndTruck ?? 0) +
    (input.commissions ?? 0) +
    (input.contractLabor ?? 0) +
    (input.depreciation ?? 0) +
    (input.employeeBenefits ?? 0) +
    (input.insurance ?? 0) +
    (input.interestMortgage ?? 0) +
    (input.interestOther ?? 0) +
    (input.legalAndProfessional ?? 0) +
    (input.office ?? 0) +
    (input.pensionProfitSharing ?? 0) +
    (input.rentLease ?? 0) +
    (input.repairs ?? 0) +
    (input.supplies ?? 0) +
    (input.taxesAndLicenses ?? 0) +
    (input.travel ?? 0) +
    deductibleMeals +
    (input.utilities ?? 0) +
    (input.wages ?? 0) +
    (input.otherExpenses ?? 0),
  );

  // Simplified home office: $5/sqft, max 300 sqft = $1,500
  let homeOfficeDeduction = 0;
  if (input.homeOfficeSquareFeet && input.homeOfficeSquareFeet > 0) {
    const sqft = Math.min(input.homeOfficeSquareFeet, 300);
    const rawDeduction = sqft * 5;
    // Home office cannot create or increase a net loss
    const profitBeforeHomeOffice = grossIncome - expensesBeforeHomeOffice;
    homeOfficeDeduction = irsRound(
      profitBeforeHomeOffice > 0
        ? Math.min(rawDeduction, profitBeforeHomeOffice)
        : 0,
    );
  }

  const totalExpenses = expensesBeforeHomeOffice + homeOfficeDeduction;
  const netProfit = irsRound(grossIncome - totalExpenses);

  return {
    grossIncome,
    totalExpenses,
    netProfit,
    homeOfficeDeduction,
  };
}
