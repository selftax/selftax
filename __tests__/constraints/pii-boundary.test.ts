/**
 * Constraint: PII Boundary
 *
 * Scope: packages/tax-core/src/, packages/web/src/
 *
 * Decision: PII (SSN, names, addresses) never leaves the device.
 * Only redacted/anonymized data is sent to external APIs (Claude).
 * Rejected: Server-side storage (TurboTax model) — unnecessary liability.
 *
 * REQUIRE: Any function that calls an external API must accept RedactedDocument, never TaxDocument
 * REQUIRE: PII types (UserProfile, SSN, address) only imported in local-storage and form-filling modules
 * DENY: fetch/axios calls in tax-core (all API calls go through web layer with PII check)
 * DENY: SSN, UserProfile in any file that imports from an API/fetch module
 *
 * Why: User trust + GDPR-like data minimization. Tax data is the most sensitive PII.
 */
describe('Constraint: PII Boundary', () => {
  test('placeholder — constraint tests will be implemented as code grows', () => {
    expect(true).toBe(true);
  });
});
