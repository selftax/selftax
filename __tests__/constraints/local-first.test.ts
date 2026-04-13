/**
 * Constraint: Local-First Architecture
 *
 * Scope: packages/
 *
 * Decision: All user data stored in browser (IndexedDB). No server database.
 * The only external call is to the LLM API with anonymized data.
 * Rejected: Cloud storage, backend database — adds liability, latency, cost.
 *
 * REQUIRE: tax-core has zero network dependencies (no fetch, no axios, no http)
 * REQUIRE: web layer uses IndexedDB (Dexie.js) for persistence, not server APIs
 * DENY: Any server-side storage of user tax data
 *
 * Why: Same philosophy as Borderly — your data, your device.
 */
describe('Constraint: Local-First Architecture', () => {
  test('placeholder — constraint tests will be implemented as code grows', () => {
    expect(true).toBe(true);
  });
});
