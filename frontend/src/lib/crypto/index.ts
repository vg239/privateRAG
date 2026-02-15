/**
 * Crypto module for PrivateRAG
 * 
 * Provides AES-256-GCM encryption using keys derived from wallet signatures.
 * All cryptographic operations happen client-side using Web Crypto API.
 */

export { deriveKeyFromSignature, encrypt, decrypt, sha256 } from "./aes";
export type { EncryptedBlob, DecryptionResult, KeyDerivationInfo } from "./types";

