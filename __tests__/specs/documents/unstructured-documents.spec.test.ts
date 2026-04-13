/**
 * Spec: Unstructured Document Processing (LLM-Powered)
 *
 * Status: confirmed
 * Confirm: LLM correctly categorizes rental expenses from messy spreadsheets/receipts
 * Invalidate: LLM miscategorizes repairs vs improvements too often
 *
 * Tests the categorization types, prompt building, response parsing,
 * and expense aggregation. Actual LLM calls tested in integration.
 */

import {
  buildCategorizationPrompt,
  aggregateExpenses,
  parseCategorizedExpenses,
  detectPII,
  redactText,
  CATEGORY_TO_LINE,
} from '@selftax/core';
import type { CategorizedExpense } from '@selftax/core';

describe('Unstructured Document Processing', () => {
  test('sends only redacted document content to LLM', () => {
    const receiptText = 'John Smith, 123 Main St\nABC Plumbing - pipe repair - $3,200';
    const profile = { firstName: 'John', lastName: 'Smith', address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' } };
    const detections = detectPII(receiptText, profile);
    const redacted = redactText(receiptText, detections);

    // Build prompt with redacted text
    const prompt = buildCategorizationPrompt(redacted);

    // Prompt should not contain PII
    expect(prompt).not.toContain('John Smith');
    expect(prompt).not.toContain('123 Main St');
    // But should contain the expense data
    expect(prompt).toContain('$3,200');
    expect(prompt).toContain('pipe repair');
  });

  test('LLM categorizes rental expenses into Schedule E lines', () => {
    const llmResponse = JSON.stringify([
      { description: 'ABC Plumbing - emergency pipe repair', amount: 3200, category: 'repairs', capitalize: false },
    ]);
    const expenses = parseCategorizedExpenses(llmResponse);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].category).toBe('repairs');
    expect(expenses[0].scheduleELine).toBe(14);
    expect(expenses[0].amount).toBe(3200);
  });

  test('LLM distinguishes repairs (deduct now) from improvements (capitalize)', () => {
    const llmResponse = JSON.stringify([
      { description: 'New roof installation', amount: 15000, category: 'improvement', capitalize: true },
      { description: 'Fixed leaking faucet', amount: 200, category: 'repairs', capitalize: false },
    ]);
    const expenses = parseCategorizedExpenses(llmResponse);

    const roof = expenses.find((e) => e.description.includes('roof'));
    expect(roof!.capitalize).toBe(true);
    expect(roof!.category).toBe('improvement');
    expect(CATEGORY_TO_LINE['improvement']).toBeNull(); // Not a line item

    const faucet = expenses.find((e) => e.description.includes('faucet'));
    expect(faucet!.capitalize).toBe(false);
    expect(faucet!.category).toBe('repairs');
  });

  test('LLM asks clarifying questions when ambiguous', () => {
    const llmResponse = JSON.stringify([
      {
        description: 'Kitchen work',
        amount: 8000,
        category: 'other',
        capitalize: false,
        needsClarification: true,
        clarificationQuestion: 'Was this a renovation/remodel (capitalize) or repair of existing fixtures (deduct)?',
      },
    ]);
    const expenses = parseCategorizedExpenses(llmResponse);
    expect(expenses[0].needsClarification).toBe(true);
    expect(expenses[0].clarificationQuestion).toContain('renovation');
  });

  test('processes Excel spreadsheet rows as expense line items', () => {
    // Simulated LLM response from spreadsheet data
    const llmResponse = JSON.stringify([
      { description: 'Monthly rent collection', amount: 2000, category: 'other', capitalize: false },
      { description: 'Plumber - fix sink', amount: 450, category: 'repairs', capitalize: false },
      { description: 'Property insurance annual', amount: 1800, category: 'insurance', capitalize: false },
      { description: 'Property management fee', amount: 200, category: 'management_fees', capitalize: false },
    ]);
    const expenses = parseCategorizedExpenses(llmResponse);
    expect(expenses).toHaveLength(4);
    expect(expenses.map((e) => e.category)).toContain('repairs');
    expect(expenses.map((e) => e.category)).toContain('insurance');
    expect(expenses.map((e) => e.category)).toContain('management_fees');
  });

  test('aggregates categorized expenses into Schedule E totals', () => {
    const expenses: CategorizedExpense[] = [
      { description: 'Plumbing repair', amount: 3200, category: 'repairs', capitalize: false, scheduleELine: 14 },
      { description: 'Electrical repair', amount: 2200, category: 'repairs', capitalize: false, scheduleELine: 14 },
      { description: 'Landlord insurance', amount: 1800, category: 'insurance', capitalize: false, scheduleELine: 9 },
      { description: 'Property manager', amount: 2400, category: 'management_fees', capitalize: false, scheduleELine: 11 },
      { description: 'New roof', amount: 15000, category: 'improvement', capitalize: true },
    ];

    const totals = aggregateExpenses(expenses);
    expect(totals.repairs).toBe(5400);
    expect(totals.insurance).toBe(1800);
    expect(totals.managementFees).toBe(2400);
    // Improvement is NOT included in deductible totals
    expect(totals.otherExpenses).toBeUndefined();
  });
});
