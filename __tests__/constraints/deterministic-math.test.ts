/**
 * Constraint: Deterministic Tax Math
 *
 * Scope: packages/tax-core/src/engine/
 *
 * Decision: All tax calculations are pure functions — deterministic, auditable, testable.
 * The LLM provides guidance (which forms, which strategy), but never does arithmetic.
 * Rejected: LLM-powered calculations — non-deterministic, hallucination risk on numbers.
 *
 * REQUIRE: Every function in engine/ is pure (same input → same output)
 * REQUIRE: No LLM/API calls from engine/
 * REQUIRE: Rounding follows IRS rules (round to nearest dollar unless specified)
 * DENY: Math.random, Date.now, or any non-deterministic source in engine/
 *
 * Why: Tax math must be 100% correct. LLMs hallucinate numbers. Code doesn't.
 */
describe('Constraint: Deterministic Tax Math', () => {
  test('placeholder — constraint tests will be implemented as code grows', () => {
    expect(true).toBe(true);
  });
});
