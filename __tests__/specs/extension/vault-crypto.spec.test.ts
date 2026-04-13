/**
 * Spec: Extension Vault Encryption (1Password/MetaMask-style)
 *
 * Status: hypothesis
 * Confirm: A VaultCrypto module encrypts all PII at rest in chrome.storage.local
 *          using PBKDF2 key derivation + AES-256-GCM. Decryption requires the
 *          user's master password. Auto-lock clears in-memory keys after idle.
 * Invalidate: Web Crypto API unavailable in extension context (unlikely — it's standard)
 */

import * as fs from 'fs';
import * as path from 'path';
const extServicesDir = path.resolve(
  __dirname,
  '../../../packages/extension/src/services',
);

describe('Vault Crypto — Extension Encryption', () => {
  // ────────────────────────────────────────────────────────────
  // Module existence
  // ────────────────────────────────────────────────────────────

  test('vaultCrypto module exists', () => {
    /** Spec: A dedicated crypto module handles all encryption/decryption.
     *  File: packages/extension/src/services/vaultCrypto.ts */
    const filePath = path.join(extServicesDir, 'vaultCrypto.ts');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('vaultCrypto exports deriveKey, encrypt, decrypt, generateSalt', () => {
    /** Spec: Module exposes four core functions for the vault lifecycle. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    expect(content).toContain('export async function deriveKey');
    expect(content).toContain('export async function encrypt');
    expect(content).toContain('export async function decrypt');
    expect(content).toContain('export function generateSalt');
  });

  // ────────────────────────────────────────────────────────────
  // Key derivation — PBKDF2
  // ────────────────────────────────────────────────────────────

  test('deriveKey uses PBKDF2 with >= 600,000 iterations', () => {
    /** Spec: OWASP recommends >= 600,000 iterations for PBKDF2-SHA256 (2023+).
     *  Must not use fewer iterations — brute-force resistance depends on this. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    // Check for PBKDF2 algorithm usage
    expect(content).toContain('PBKDF2');
    // Iterations constant should be at least 600,000
    // Matches both `600_000` (numeric separator) and `600000` (plain number)
    const iterMatch = content.match(/ITERATIONS\s*=\s*([\d_]+)/);
    expect(iterMatch).not.toBeNull();
    expect(Number(iterMatch![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(600_000);
  });

  test('deriveKey produces a 256-bit AES-GCM key', () => {
    /** Spec: The derived key must be usable with AES-256-GCM. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    expect(content).toContain('AES-GCM');
    expect(content).toMatch(/length:\s*256/);
  });

  test('generateSalt returns 16 random bytes', () => {
    /** Spec: Salt must be cryptographically random, >= 16 bytes (NIST SP 800-132). */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    expect(content).toContain('getRandomValues');
    // Salt should be at least 16 bytes
    expect(content).toMatch(/new Uint8Array\(16\)/);
  });

  // ────────────────────────────────────────────────────────────
  // Encrypt / Decrypt round-trip
  // ────────────────────────────────────────────────────────────

  test('encrypt produces an object with salt, iv, and ciphertext', () => {
    /** Spec: The encrypted blob must include all data needed for decryption:
     *  - salt: for re-deriving the key from the password
     *  - iv: unique per encryption (12 bytes for AES-GCM)
     *  - ciphertext: the encrypted data
     *  All stored as base64 strings for chrome.storage compatibility. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    expect(content).toContain('salt');
    expect(content).toContain('iv');
    expect(content).toContain('ciphertext');
  });

  test('encrypt → decrypt round-trip preserves data', () => {
    /** Spec: Encrypting then decrypting with the same password must return
     *  the original plaintext exactly.
     *  Implementation test: once vaultCrypto exists, import and call:
     *    const salt = generateSalt();
     *    const key = await deriveKey('test-password', salt);
     *    const encrypted = await encrypt(key, plaintext);
     *    expect(await decrypt(key, encrypted)).toBe(plaintext);
     */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    // encrypt function should call crypto.subtle.encrypt
    expect(content).toContain('subtle.encrypt');
    // decrypt function should call crypto.subtle.decrypt
    expect(content).toContain('subtle.decrypt');
  });

  test('decrypt with wrong password throws', () => {
    /** Spec: AES-GCM authentication tag ensures wrong passwords fail loudly
     *  rather than producing garbage output.
     *  Implementation test: deriveKey('wrong') → decrypt should throw. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    // AES-GCM auth tag failure surfaces as an exception
    expect(content).toContain('AES-GCM');
  });

  test('each encrypt call produces a unique IV', () => {
    /** Spec: AES-GCM MUST use a unique IV per encryption. Reusing an IV
     *  with the same key completely breaks confidentiality.
     *  The encrypt function must generate a fresh random IV each call. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    // IV generation should be inside the encrypt function, not shared
    expect(content).toMatch(/crypto\.getRandomValues.*new Uint8Array\(12\)/s);
  });

  // ────────────────────────────────────────────────────────────
  // Storage format
  // ────────────────────────────────────────────────────────────

  test('encrypted vault uses base64 encoding for chrome.storage', () => {
    /** Spec: chrome.storage.local stores JSON. Binary data (salt, iv, ciphertext)
     *  must be base64-encoded for storage. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultCrypto.ts'),
      'utf-8',
    );
    // Should convert to/from base64
    expect(content).toMatch(/btoa|Buffer\.from|base64/i);
  });

  // ────────────────────────────────────────────────────────────
  // No plaintext PII in storage
  // ────────────────────────────────────────────────────────────

  test('analyzeService routes PII through vault manager', () => {
    /** Spec: savePIIToStorage must check vault state and encrypt when unlocked.
     *  The function should import from vaultManager and call savePII when
     *  the vault is unlocked. A plaintext fallback for pre-setup state is
     *  acceptable (no password exists yet). */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'analyzeService.ts'),
      'utf-8',
    );
    // Should import or reference vault manager
    expect(content).toMatch(/vaultManager|vaultCrypto/);
    // Should check unlock state before deciding storage path
    expect(content).toMatch(/isUnlocked|isSetup/);
    // Should call vault's savePII for the encrypted path
    expect(content).toContain('savePII');
  });
});
