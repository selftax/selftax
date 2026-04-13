/**
 * Vault Manager — coordinates password setup, lock/unlock, and encrypted PII access.
 *
 * PII is encrypted at rest in chrome.storage.local under the 'encryptedVault' key.
 * Decrypted PII is held in memory only while the vault is unlocked.
 * Auto-lock uses a lastActive timestamp checked on popup open (no background worker needed).
 */

import type { EncryptedBlob } from './vaultCrypto';
import { generateSalt, deriveKey, encrypt, decrypt } from './vaultCrypto';
import type { LocalPII } from './analyzeService';

const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

// ── In-memory state (cleared on lock or popup close) ────────

let cachedKey: CryptoKey | null = null;
let cachedSalt: Uint8Array | null = null;
let cachedPII: LocalPII | null = null;

// ── Public API ──────────────────────────────────────────────

/** Check if a vault has been created (encrypted blob exists in storage). */
export async function isSetup(): Promise<boolean> {
  const stored = await chrome.storage.local.get('encryptedVault');
  return stored.encryptedVault != null;
}

/** Check if the vault is currently unlocked (key in memory). */
export function isUnlocked(): boolean {
  return cachedKey != null && cachedPII != null;
}

/**
 * First-time setup: create an encrypted vault from a new password.
 * If plaintext localPII exists in storage, migrates it to encrypted form.
 */
export async function setupVault(password: string): Promise<void> {
  // Read existing plaintext PII (migration path)
  const stored = await chrome.storage.local.get('localPII');
  const pii: LocalPII = stored.localPII ?? {
    primary: { firstName: '', lastName: '', ssn: '' },
    address: { street: '', city: '', state: '', zip: '' },
    dependents: [],
    filingStatus: 'single',
  };

  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const blob = await encrypt(key, JSON.stringify(pii), salt);

  // Store encrypted vault + remove plaintext
  await chrome.storage.local.set({
    encryptedVault: blob,
    lastActive: Date.now(),
  });
  await chrome.storage.local.remove('localPII');

  // Cache in memory
  cachedKey = key;
  cachedSalt = salt;
  cachedPII = pii;
}

/**
 * Unlock the vault with the user's password.
 * Returns true on success, false on wrong password.
 */
export async function unlock(password: string): Promise<boolean> {
  const stored = await chrome.storage.local.get(['encryptedVault', 'lastActive']);
  const blob = stored.encryptedVault as EncryptedBlob | undefined;
  if (!blob) return false;

  // Check autoLock timeout
  const lastActive = stored.lastActive as number | undefined;
  if (lastActive && Date.now() - lastActive > AUTO_LOCK_MS) {
    // Vault timed out — still allow unlock, just note the gap
    lock();
  }

  const salt = fromBase64(blob.salt);
  const key = await deriveKey(password, salt);

  try {
    const json = await decrypt(key, blob);
    cachedKey = key;
    cachedSalt = salt;
    cachedPII = JSON.parse(json);

    // Reset activity timer
    await chrome.storage.local.set({ lastActive: Date.now() });
    return true;
  } catch {
    // Wrong password — AES-GCM auth tag mismatch
    return false;
  }
}

/** Lock the vault — clear all in-memory data. */
export function lock(): void {
  cachedKey = null;
  cachedSalt = null;
  cachedPII = null;
}

/**
 * Get decrypted PII. Returns null when locked.
 * Call this instead of reading chrome.storage.local directly.
 */
export function getPII(): LocalPII | null {
  if (!isUnlocked()) return null;
  // Touch activity timer (fire-and-forget)
  chrome.storage.local.set({ lastActive: Date.now() });
  return cachedPII;
}

/**
 * Save updated PII — encrypts and writes to storage.
 * Throws when vault is locked (no key in memory).
 */
export async function savePII(pii: LocalPII): Promise<void> {
  if (!cachedKey || !cachedSalt) {
    throw new Error('Vault is locked — unlock before saving PII');
  }

  const blob = await encrypt(cachedKey, JSON.stringify(pii), cachedSalt);
  await chrome.storage.local.set({ encryptedVault: blob });
  cachedPII = pii;
}

/**
 * Check if the vault should be auto-locked based on lastActive timestamp.
 * Call this when the popup opens to enforce idle timeout.
 */
export async function checkAutoLock(): Promise<void> {
  const stored = await chrome.storage.local.get('lastActive');
  const lastActive = stored.lastActive as number | undefined;
  if (lastActive && Date.now() - lastActive > AUTO_LOCK_MS) {
    lock();
  }
}

// ── Helper ──────────────────────────────────────────────────

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
