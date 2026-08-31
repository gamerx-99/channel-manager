/**
 * Phase 01 — SlipOK API key encryption helpers.
 *
 * AES-256-GCM symmetric encryption using Node.js `crypto`.
 * The encryption key is derived from the SLIPOK_ENCRYPTION_KEY env var
 * (a 32-byte hex string, i.e. 64 hex chars). Never stored; read at runtime.
 *
 * Format stored in DB: "<iv_hex>:<ciphertext_hex>:<authTag_hex>"
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const raw = process.env.SLIPOK_ENCRYPTION_KEY ?? '';
  if (raw.length !== 64) {
    throw new Error(
      'SLIPOK_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Encrypt a plaintext SlipOK API key.
 * Returns: "<iv_hex>:<ciphertext_hex>:<authTag_hex>"
 */
export function encryptSlipOkKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Decrypt an encrypted SlipOK API key stored in DB.
 * Throws if the format is invalid or the auth tag doesn't match (tampered).
 */
export function decryptSlipOkKey(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted key format.');
  const [ivHex, ctHex, tagHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct) + decipher.final('utf8');
}

/**
 * SHA-256 hash of the raw API key — stored for existence checks / dedup
 * without needing to decrypt the full ciphertext.
 */
export function hashSlipOkKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}
