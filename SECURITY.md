# Security Issues — Critical

## 1. PII Leaks Through LLM Debug Scripts
**Severity: CRITICAL**

When the LLM runs Bash/Read commands to debug document parsing, raw PII (including SSNs) bypasses the MCP redaction boundary and enters the conversation context.

**Root cause**: The MCP tool properly redacts, but the LLM can read files directly via Bash/Read tools.

**Fix options**:
- Claude Code hook that blocks Bash/Read access to the tax folder
- MCP tool creates a redacted folder; LLM only gets that path
- Sandboxed agent that only has access to redacted copies

## 2. Incomplete PII Redaction
**Severity: HIGH**

The PII detector misses:
- Names (especially on first scan before profile exists)
- Addresses (not caught by pattern without profile)
- Employer names
- Property addresses
- Filenames containing PII

**Fix**: Run PII detection in two passes — first pass extracts profile, second pass uses profile for comprehensive redaction. Redact filenames before returning to LLM.

## 3. PII Profile Extraction Fragile
**Severity: MEDIUM**

The regex-based PII field parsers don't reliably extract dependent SSNs, filing status, or addresses from PDF-extracted text. Real PDF layouts differ from expected patterns.

**Fix**: Use the existing PIIDetection[] results (which already found the SSNs during redaction) to build the profile, instead of re-parsing raw text with separate regex. Associate SSNs to names by text proximity.

## 4. Dollar Amounts Not Redacted
**Severity: LOW (by design)**

Wages, mortgage amounts, rental income are visible to the LLM. This is intentional — the LLM needs financial data to calculate taxes. But combined with leaked names/addresses, it constitutes a sensitive profile.

**Mitigation**: Ensure names/addresses are fully redacted so financial data alone isn't identifiable.
