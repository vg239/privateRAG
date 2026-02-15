/**
 * AES-256-GCM Encryption/Decryption Utilities
 * 
 * Uses the Web Crypto API for secure, browser-native encryption.
 * All operations happen client-side - keys never leave the browser.
 */

import type { EncryptedBlob, DecryptionResult } from "./types";

// Constants
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (96 bits, recommended for GCM)
const TAG_LENGTH = 128; // bits (16 bytes)

export async function deriveKeyFromSignature(signature: string): Promise<CryptoKey> {
  // Remove 0x prefix if present
  const cleanSig = signature.startsWith("0x") ? signature.slice(2) : signature;
  
  // Convert hex signature to bytes
  const sigBytes = new Uint8Array(
    cleanSig.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  
  // Hash the signature with SHA-256 to get exactly 256 bits
  const keyMaterial = await crypto.subtle.digest("SHA-256", sigBytes);
  
  // Import as AES-GCM key
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable - prevents key leakage
    ["encrypt", "decrypt"]
  );
  
  return key;
}

export async function encrypt<T>(key: CryptoKey, data: T): Promise<EncryptedBlob> {
  // Serialize data to JSON, then to UTF-8 bytes
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  
  // Generate a random IV (MUST be unique per encryption)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Encrypt with AES-GCM
  const ciphertextWithTag = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH,
    },
    key,
    plaintext
  );
  
  // Web Crypto API appends the auth tag to the ciphertext
  // Split them for explicit storage
  const ciphertextBytes = new Uint8Array(ciphertextWithTag);
  const tagStart = ciphertextBytes.length - (TAG_LENGTH / 8);
  const ciphertext = ciphertextBytes.slice(0, tagStart);
  const authTag = ciphertextBytes.slice(tagStart);
  
  // Return as base64-encoded blob
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    authTag: bytesToBase64(authTag),
    algorithm: "AES-256-GCM",
    version: 1,
  };
}

export async function decrypt<T = unknown>(
  key: CryptoKey,
  blob: EncryptedBlob
): Promise<DecryptionResult<T>> {
  try {
    // Validate blob structure
    if (blob.algorithm !== "AES-256-GCM" || blob.version !== 1) {
      return {
        success: false,
        error: `Unsupported encryption format: ${blob.algorithm} v${blob.version}`,
      };
    }
    
    // Decode base64 components
    const iv = base64ToBytes(blob.iv);
    const ciphertext = base64ToBytes(blob.ciphertext);
    const authTag = base64ToBytes(blob.authTag);
    
    // Reconstruct ciphertext + tag (Web Crypto expects them together)
    const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
    ciphertextWithTag.set(ciphertext, 0);
    ciphertextWithTag.set(authTag, ciphertext.length);
    
    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv.buffer as ArrayBuffer,
        tagLength: TAG_LENGTH,
      },
      key,
      ciphertextWithTag.buffer as ArrayBuffer
    );
    
    // Parse JSON
    const text = new TextDecoder().decode(plaintext);
    const data = JSON.parse(text) as T;
    
    return { success: true, data };
  } catch (error) {
    // Decryption failure usually means wrong key or tampered data
    const message = error instanceof Error ? error.message : "Decryption failed";
    return {
      success: false,
      error: message.includes("operation failed")
        ? "Wrong decryption key or data has been tampered with"
        : message,
    };
  }
}

/**
 * Convert Uint8Array to base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper: Compute SHA-256 hash of arbitrary data
 */
export async function sha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

