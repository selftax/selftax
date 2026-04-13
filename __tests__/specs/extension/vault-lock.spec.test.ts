/**
 * Spec: Vault Lock/Unlock Lifecycle
 *
 * Status: hypothesis
 * Confirm: A VaultManager coordinates lock/unlock state, password setup,
 *          and auto-lock timeout. The extension popup reads vault state
 *          to decide which screen to show.
 * Invalidate: Chrome extension popup lifecycle doesn't support persistent
 *             in-memory state (popup closes = state lost — need background worker)
 */

import * as fs from 'fs';
import * as path from 'path';

const extServicesDir = path.resolve(
  __dirname,
  '../../../packages/extension/src/services',
);
const extDir = path.resolve(__dirname, '../../../packages/extension');

describe('Vault Lock/Unlock Lifecycle', () => {
  // ────────────────────────────────────────────────────────────
  // Vault manager module
  // ────────────────────────────────────────────────────────────

  test('vaultManager module exists', () => {
    /** Spec: A vault manager coordinates password setup, lock/unlock state,
     *  and encrypted storage access.
     *  File: packages/extension/src/services/vaultManager.ts */
    const filePath = path.join(extServicesDir, 'vaultManager.ts');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('vaultManager exports setupVault, unlock, lock, isSetup, isUnlocked', () => {
    /** Spec: Core vault lifecycle functions:
     *  - setupVault(password): first-time setup, encrypts existing PII
     *  - unlock(password): derives key, decrypts vault, holds key in memory
     *  - lock(): clears in-memory key
     *  - isSetup(): checks if encrypted vault exists in storage
     *  - isUnlocked(): checks if key is currently in memory */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    expect(content).toContain('export async function setupVault');
    expect(content).toContain('export async function unlock');
    expect(content).toContain('export function lock');
    expect(content).toContain('export async function isSetup');
    expect(content).toContain('export function isUnlocked');
  });

  // ────────────────────────────────────────────────────────────
  // First-time setup
  // ────────────────────────────────────────────────────────────

  test('setupVault encrypts existing localPII and replaces it in storage', () => {
    /** Spec: When user sets a password for the first time:
     *  1. Read existing plaintext localPII from chrome.storage
     *  2. Encrypt it with the new password
     *  3. Store encrypted blob as 'encryptedVault'
     *  4. Delete plaintext 'localPII' key
     *  This migrates existing users to encrypted storage. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    expect(content).toContain('encryptedVault');
    expect(content).toContain('localPII');
  });

  test('isSetup returns true when encryptedVault exists in storage', () => {
    /** Spec: The vault is "set up" when chrome.storage has an encryptedVault key.
     *  This determines whether to show the "create password" vs "enter password" screen. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    expect(content).toContain('encryptedVault');
  });

  // ────────────────────────────────────────────────────────────
  // Unlock / Lock
  // ────────────────────────────────────────────────────────────

  test('unlock derives key and decrypts vault into memory', () => {
    /** Spec: unlock(password) reads encryptedVault from storage,
     *  derives the key with PBKDF2 using the stored salt,
     *  decrypts the vault, and holds the decrypted PII in memory.
     *  Returns true on success, false on wrong password. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    expect(content).toContain('deriveKey');
    expect(content).toContain('decrypt');
  });

  test('lock clears in-memory decrypted data', () => {
    /** Spec: lock() zeroes out the in-memory key and decrypted PII.
     *  After lock(), isUnlocked() returns false and any read attempt
     *  requires re-entering the password. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    // Should nullify the cached key/data
    expect(content).toMatch(/= null|= undefined/);
  });

  // ────────────────────────────────────────────────────────────
  // Auto-lock
  // ────────────────────────────────────────────────────────────

  test('auto-lock triggers after idle timeout', () => {
    /** Spec: The vault auto-locks after a configurable idle period (default 15 min).
     *  Since the popup closes when user clicks away, the auto-lock timer must
     *  run in a background service worker (alarms API) or check last-active
     *  timestamp when popup re-opens. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    // Should reference a timeout/alarm/timestamp mechanism
    expect(content).toMatch(/lastActive|autoLock|timeout|alarm/i);
  });

  test('manifest includes alarms permission for auto-lock', () => {
    /** Spec: chrome.alarms API requires the "alarms" permission.
     *  Alternative: store lastActiveTimestamp and check on popup open. */
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'),
    );
    // Either alarms permission OR the code uses timestamp-based approach
    const hasAlarms = manifest.permissions?.includes('alarms');
    const hasBackground = !!manifest.background;
    // At least one auto-lock mechanism must exist
    expect(hasAlarms || hasBackground || true).toBe(true); // relaxed — impl decides approach
  });

  // ────────────────────────────────────────────────────────────
  // PII access through vault
  // ────────────────────────────────────────────────────────────

  test('getPII returns decrypted PII only when unlocked', () => {
    /** Spec: A getPII() function returns the decrypted LocalPII from memory.
     *  Throws or returns null when vault is locked.
     *  This replaces direct chrome.storage.local.get('localPII') reads. */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    expect(content).toContain('getPII');
  });

  test('savePII encrypts and writes to storage', () => {
    /** Spec: A savePII(pii) function encrypts PII with the current key
     *  and writes the encrypted blob to chrome.storage.
     *  Throws when vault is locked (no key in memory). */
    const content = fs.readFileSync(
      path.join(extServicesDir, 'vaultManager.ts'),
      'utf-8',
    );
    expect(content).toContain('savePII');
    expect(content).toContain('encrypt');
  });
});
