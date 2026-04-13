/**
 * Vault Crypto — PBKDF2 key derivation + AES-256-GCM encryption for PII at rest.
 *
 * Uses the Web Crypto API (available in Chrome extensions and modern browsers).
 * All binary data is base64-encoded for chrome.storage.local compatibility.
 */

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023+ recommendation

/** Encrypted blob stored in chrome.storage — all fields are base64 strings. */
export interface EncryptedBlob {
  salt: string;
  iv: string;
  ciphertext: string;
}

// ── Helpers: base64 ↔ Uint8Array ────────────────────────────

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Public API ──────────────────────────────────────────────

/** Generate a cryptographically random 16-byte salt. */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Derive an AES-256-GCM key from a password and salt using PBKDF2-SHA256.
 * The returned CryptoKey is non-extractable.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext with AES-256-GCM. Generates a fresh random IV each call.
 * Returns an EncryptedBlob with base64-encoded salt, iv, and ciphertext.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string,
  salt: Uint8Array,
): Promise<EncryptedBlob> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(plaintext),
  );

  return {
    salt: toBase64(salt.buffer as ArrayBuffer),
    iv: toBase64(iv.buffer as ArrayBuffer),
    ciphertext: toBase64(cipherBuf),
  };
}

/**
 * Decrypt an EncryptedBlob with AES-256-GCM.
 * Throws if the key is wrong (GCM auth tag mismatch).
 */
export async function decrypt(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<string> {
  const iv = fromBase64(blob.iv);
  const ciphertext = fromBase64(blob.ciphertext);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );

  return new TextDecoder().decode(plainBuf);
}
