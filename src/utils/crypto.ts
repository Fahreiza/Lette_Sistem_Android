import * as Crypto from 'expo-crypto';

// Salt for Desktop-compatible PIN hashing
const DESKTOP_PIN_SALT = "lette_roti_bakar_pos_salt_v1";

/**
 * Desktop-compatible 128-bit multi-round hash for PINs synced from PC Desktop.
 */
export function hashPinDesktop(pin: string): string {
  const str = pin.trim() + DESKTOP_PIN_SALT;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x811c9dc5, h4 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ (ch << 2), 1597334677);
    h3 = Math.imul(h3 ^ (ch << 4), 3812015801);
    h4 = Math.imul(h4 ^ (ch << 6), 2718281829);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const part3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const part4 = (h4 >>> 0).toString(16).padStart(8, '0');
  return part1 + part2 + part3 + part4;
}

/**
 * Hash a plain text PIN (4-6 digits) with Desktop-compatible 128-bit hash.
 * This guarantees 100% hash parity between Mobile and Desktop.
 */
export async function hashPin(pin: string): Promise<string> {
  return hashPinDesktop(pin);
}

/**
 * Verify if raw input PIN matches stored PIN hash.
 * Supports both Desktop unified hash and legacy Mobile SHA-256 hash.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  
  // 1. Check primary Desktop unified hash (instant)
  const desktopHash = hashPinDesktop(pin);
  if (desktopHash === storedHash) return true;

  // 2. Check legacy mobile SHA-256 fallback
  try {
    const sha256Hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `lette_salt_${pin.trim()}`
    );
    if (sha256Hash === storedHash) return true;
  } catch {}

  return false;
}
