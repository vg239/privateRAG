
export interface EncryptedBlob {
  iv: string;
  ciphertext: string;
  authTag: string;
  algorithm: "AES-256-GCM";
  version: 1;
}

/**
 * Decryption result
 */
export interface DecryptionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Key derivation info (for debugging, never store the actual key!)
 */
export interface KeyDerivationInfo {
  /** The wallet address used */
  walletAddress: string;
  /** The message that was signed */
  message: string;
  /** Timestamp of derivation */
  timestamp: number;
}

