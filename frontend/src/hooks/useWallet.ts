
import { useState, useEffect, useCallback } from "react";
import {
  isMetaMaskAvailable,
  connectMetaMask,
  getConnectedAccount,
  signForKeyDerivation,
  signTOCForOwnership,
  onAccountsChanged,
  type WalletState,
} from "../lib/wallet";
import { deriveKeyFromSignature } from "../lib/crypto";

interface UseWalletReturn {
  wallet: WalletState;
  isConnecting: boolean;
  hasKey: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  deriveKey: () => Promise<CryptoKey | null>;
  getKey: () => CryptoKey | null;
  signTOC: (tocHash: string) => Promise<string | null>;
  /** Whether MetaMask extension is installed */
  isMetaMaskInstalled: boolean;
}

/**
 * Hook for managing wallet connection and encryption key derivation
 */
export function useWallet(): UseWalletReturn {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    type: null,
    address: null,
    chainId: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Store the derived key in memory (never persisted!)
  // This is intentional - user must re-sign after refresh for security
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  
  const isMetaMaskInstalled = isMetaMaskAvailable();

  // Check for existing connection on mount
  useEffect(() => {
    async function checkConnection() {
      const address = await getConnectedAccount();
      if (address) {
        setWallet({
          connected: true,
          type: "metamask",
          address,
          chainId: null,
        });
      }
    }
    
    if (isMetaMaskInstalled) {
      checkConnection();
    }
  }, [isMetaMaskInstalled]);

  // Listen for account changes (user switches accounts in MetaMask)
  useEffect(() => {
    if (!isMetaMaskInstalled) return;
    
    const unsubscribe = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        // Wallet disconnected
        setWallet({
          connected: false,
          type: null,
          address: null,
          chainId: null,
        });
        setCryptoKey(null); // Clear key on disconnect
      } else {
        // Account changed - key must be re-derived for new account
        setWallet((prev) => ({
          ...prev,
          address: accounts[0].toLowerCase(),
        }));
        setCryptoKey(null); // Clear key - different account = different key
      }
    });
    
    return unsubscribe;
  }, [isMetaMaskInstalled]);

  /**
   * Connect to MetaMask
   */
  const connect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);
    
    try {
      const state = await connectMetaMask();
      setWallet(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  /**
   * Disconnect wallet (client-side only)
   * Note: This doesn't revoke MetaMask connection, just clears our state
   */
  const disconnect = useCallback(() => {
    setWallet({
      connected: false,
      type: null,
      address: null,
      chainId: null,
    });
    setCryptoKey(null);
    setError(null);
  }, []);

  /**
   * Derive encryption key from wallet signature.
   * 
   * SIGNATURE #1 of 2
   * 
   * This prompts the user to sign a deterministic message.
   * The signature is hashed (SHA-256) to derive an AES-256 key.
   * 
   * Why deterministic? Because the same wallet signing the same message
   * always produces the same signature. This means:
   * - We don't need to store the key
   * - User can re-derive it anytime by signing again
   * - If wallet is lost, documents are unrecoverable (by design)
   */
  const deriveKey = useCallback(async (): Promise<CryptoKey | null> => {
    if (!wallet.connected || !wallet.address) {
      setError("Wallet not connected");
      return null;
    }
    
    setError(null);
    
    try {
      // Sign the key derivation message
      const result = await signForKeyDerivation(wallet.address);
      
      if (!result.success || !result.signature) {
        setError(result.error || "Signing failed");
        return null;
      }
      
      // Derive AES key from signature using SHA-256
      const key = await deriveKeyFromSignature(result.signature);
      setCryptoKey(key);
      
      return key;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key derivation failed");
      return null;
    }
  }, [wallet.connected, wallet.address]);

  /**
   * Get the currently derived key (without prompting for signature)
   */
  const getKey = useCallback((): CryptoKey | null => {
    return cryptoKey;
  }, [cryptoKey]);

  /**
   * Sign a TOC hash for ownership verification.
   * 
   * SIGNATURE #2 of 2
   * 
   * This creates a signature proving:
   * 1. This wallet created this specific TOC
   * 2. The TOC hasn't been tampered with
   * 
   * Unlike key derivation, this signature IS stored in the database.
   * It allows anyone to verify ownership without decrypting the TOC.
   * 
   * Verification: recoverAddress(tocHash, signature) === owner_wallet
   * 
   * @param tocHash - SHA-256 hash of the TOC (doc_hash from TOCResult)
   * @returns Signature hex string or null if user rejected
   */
  const signTOC = useCallback(async (tocHash: string): Promise<string | null> => {
    if (!wallet.connected || !wallet.address) {
      setError("Wallet not connected");
      return null;
    }

    try {
      const result = await signTOCForOwnership(tocHash, wallet.address);
      
      if (!result.success || !result.signature) {
        setError(result.error || "TOC signing failed");
        return null;
      }

      return result.signature;
    } catch (err) {
      setError(err instanceof Error ? err.message : "TOC signing failed");
      return null;
    }
  }, [wallet.connected, wallet.address]);

  return {
    wallet,
    isConnecting,
    hasKey: cryptoKey !== null,
    error,
    connect,
    disconnect,
    deriveKey,
    getKey,
    signTOC,
    isMetaMaskInstalled,
  };
}
