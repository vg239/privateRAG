
import { useState, useEffect, useCallback } from "react";
import {
  isWalletReady,
  setupNearWallet,
  connectNearWallet,
  disconnectNearWallet,
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
  // signTOC: (tocHash: string) => Promise<string | null>;
  /** Whether the NEAR wallet selector is initialised */
  isWalletAvailable: boolean;
}

/**
 * Hook for managing NEAR wallet connection and encryption key derivation
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

  const [walletAvailable, setWalletAvailable] = useState(false);

  // Initialise the NEAR wallet selector on mount
  useEffect(() => {
    setupNearWallet()
      .then(() => {
        setWalletAvailable(true);

        // Check for existing connection
        const accountId = getConnectedAccount();
        if (accountId) {
          setWallet({
            connected: true,
            type: "near",
            address: accountId,
            chainId: "testnet",
          });
        }
      })
      .catch((err) => {
        console.error("Failed to initialise NEAR wallet selector:", err);
      });
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (!isWalletReady()) return;

    const unsubscribe = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        // Wallet disconnected
        setWallet({
          connected: false,
          type: null,
          address: null,
          chainId: null,
        });
        setCryptoKey(null);
      } else {
        // Account changed - key must be re-derived
        setWallet({
          connected: true,
          type: "near",
          address: accounts[0],
          chainId: "testnet",
        });
        setCryptoKey(null);
      }
    });

    return unsubscribe;
  }, [walletAvailable]);

  /**
   * Connect to NEAR wallet
   */
  const connect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      const state = await connectNearWallet();
      setWallet(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async () => {
    try {
      await disconnectNearWallet();
    } catch {
      // Ignore disconnect errors
    }
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
   * Uses NEP-413 signMessage with a deterministic message.
   * The signature is hashed (SHA-256) to derive an AES-256 key.
   */
  const deriveKey = useCallback(async (): Promise<CryptoKey | null> => {
    if (!wallet.connected || !wallet.address) {
      setError("Wallet not connected");
      return null;
    }

    setError(null);

    try {
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
    // signTOC,
    isWalletAvailable: walletAvailable,
  };
}
