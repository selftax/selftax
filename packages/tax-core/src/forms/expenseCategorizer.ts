import type { ScheduleEInput } from '../engine/scheduleE';

/** Schedule E line categories for rental expenses */
export type ExpenseCategory =
  | 'advertising'
  | 'auto_travel'
  | 'cleaning_maintenance'
  | 'commissions'
  | 'insurance'
  | 'legal_fees'
  | 'management_fees'
  | 'mortgage_interest'
  | 'other_interest'
  | 'repairs'
  | 'supplies'
  | 'property_taxes'
  | 'utilities'
  | 'depreciation'
  | 'other'
  | 'improvement'; // Capitalize, don't deduct

export interface CategorizedExpense {
  description: string;
  amount: number;
  category: ExpenseCategory;
  scheduleELine?: number;
  capitalize: boolean;
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

/** Schedule E line number mapping */
export const CATEGORY_TO_LINE: Record<ExpenseCategory, number | null> = {
  advertising: 5,
  auto_travel: 6,
  cleaning_maintenance: 7,
  commissions: 8,
  insurance: 9,
  legal_fees: 10,
  management_fees: 11,
  mortgage_interest: 12,
  other_interest: 13,
  repairs: 14,
  supplies: 15,
  property_taxes: 16,
  utilities: 17,
  depreciation: 18,
  other: 19,
  improvement: null, // Not a current-year deduction
};

/**
 * Build the system prompt for expense categorization.
 * This is sent to the LLM along with redacted document content.
 */
export function buildCategorizationPrompt(redactedText: string): string {
  return `You are a tax advisor categorizing rental property expenses for Schedule E (Form 1040).

For each expense item, determine:
1. The category (one of: advertising, auto_travel, cleaning_maintenance, commissions, insurance, legal_fees, management_fees, mortgage_interest, other_interest, repairs, supplies, property_taxes, utilities, other, improvement)
2. Whether it should be capitalized (improvement) or deducted (everything else)
3. The Schedule E line number

Key rules:
- REPAIRS (Line 14): Fix existing items to maintain property. Examples: fixing a leak, patching drywall, replacing a broken window pane.
- IMPROVEMENTS (capitalize): Add value, extend life, or adapt property. Examples: new roof, kitchen remodel, adding a room, new HVAC system.
- De minimis safe harbor: items under $2,500 can be deducted as repairs regardless.
- If unclear whether repair or improvement, ask a clarifying question.

Respond with JSON array of categorized expenses:
[{ "description": "...", "amount": ..., "category": "...", "capitalize": true/false, "scheduleELine": ..., "needsClarification": false }]

If any item needs clarification, set needsClarification: true and include clarificationQuestion.

Document content:
${redactedText}`;
}

/**
 * Aggregate categorized expenses into Schedule E input.
 * Only includes non-capitalized expenses.
 */
export function aggregateExpenses(
  expenses: CategorizedExpense[],
): Partial<ScheduleEInput> {
  const result: Partial<ScheduleEInput> = {};

  for (const expense of expenses) {
    if (expense.capitalize) continue; // Don't deduct improvements

    switch (expense.category) {
      case 'advertising':
        result.advertising = (result.advertising ?? 0) + expense.amount;
        break;
      case 'auto_travel':
        result.autoTravel = (result.autoTravel ?? 0) + expense.amount;
        break;
      case 'cleaning_maintenance':
        result.cleaningMaintenance = (result.cleaningMaintenance ?? 0) + expense.amount;
        break;
      case 'commissions':
        result.commissions = (result.commissions ?? 0) + expense.amount;
        break;
      case 'insurance':
        result.insurance = (result.insurance ?? 0) + expense.amount;
        break;
      case 'legal_fees':
        result.legalFees = (result.legalFees ?? 0) + expense.amount;
        break;
      case 'management_fees':
        result.managementFees = (result.managementFees ?? 0) + expense.amount;
        break;
      case 'mortgage_interest':
        result.mortgageInterest = (result.mortgageInterest ?? 0) + expense.amount;
        break;
      case 'other_interest':
        result.otherInterest = (result.otherInterest ?? 0) + expense.amount;
        break;
      case 'repairs':
        result.repairs = (result.repairs ?? 0) + expense.amount;
        break;
      case 'supplies':
        result.supplies = (result.supplies ?? 0) + expense.amount;
        break;
      case 'property_taxes':
        result.propertyTaxes = (result.propertyTaxes ?? 0) + expense.amount;
        break;
      case 'utilities':
        result.utilities = (result.utilities ?? 0) + expense.amount;
        break;
      case 'other':
        result.otherExpenses = (result.otherExpenses ?? 0) + expense.amount;
        break;
    }
  }

  return result;
}

/**
 * Parse LLM response into CategorizedExpense array.
 * Expects JSON array in the response.
 */
export function parseCategorizedExpenses(llmResponse: string): CategorizedExpense[] {
  // Extract JSON array from response (may be wrapped in markdown code block)
  const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    return parsed.map((item) => ({
      description: String(item.description ?? ''),
      amount: Number(item.amount ?? 0),
      category: (item.category as ExpenseCategory) ?? 'other',
      scheduleELine: CATEGORY_TO_LINE[(item.category as ExpenseCategory) ?? 'other'] ?? undefined,
      capitalize: Boolean(item.capitalize),
      needsClarification: Boolean(item.needsClarification),
      clarificationQuestion: item.clarificationQuestion
        ? String(item.clarificationQuestion)
        : undefined,
    }));
  } catch {
    return [];
  }
}
