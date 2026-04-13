/**
 * Constraint: Package Boundary
 *
 * Scope: packages/
 *
 * Decision: Monorepo with clean package boundaries.
 * tax-core is pure logic (no UI, no browser APIs).
 * web depends on tax-core, not the other way around.
 * Rejected: Single package — prevents reuse across MCP server and Chrome extension.
 *
 * REQUIRE: tax-core has no React, no DOM, no browser API imports
 * REQUIRE: web imports from @selftax/core, never the reverse
 * DENY: tax-core importing from web
 * DENY: React/DOM imports in tax-core
 *
 * Why: tax-core is shared between the MCP server, Chrome extension, and web scaffold.
 */
describe('Constraint: Package Boundary', () => {
  test('placeholder — constraint tests will be implemented as code grows', () => {
    expect(true).toBe(true);
  });
});
