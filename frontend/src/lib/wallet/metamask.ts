
import type { WalletState, SignatureResult, EthereumProvider } from "./types";

const KEY_DERIVATION_MESSAGE = "Never gonna give you up";

/**
 * Check if MetaMask is available in the browser
 */
export function isMetaMaskAvailable(): boolean {
  return typeof window !== "undefined" && !!window.ethereum?.isMetaMask;
}

/**
 * Get the Ethereum provider (window.ethereum)
 */
function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export async function connectMetaMask(): Promise<WalletState> {
  const provider = getProvider();
  
  if (!provider) {
    throw new Error("MetaMask not installed. Please install the MetaMask extension.");
  }
  
  try {
    // Request account access - this triggers MetaMask popup if needed
    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[];
    
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts returned from MetaMask");
    }
    
    // Get current chain ID
    const chainId = (await provider.request({
      method: "eth_chainId",
    })) as string;
    
    return {
      connected: true,
      type: "metamask",
      address: accounts[0].toLowerCase(),
      chainId,
    };
  } catch (error) {
    // User clicked "Reject" in MetaMask
    if ((error as { code?: number }).code === 4001) {
      throw new Error("Connection rejected by user");
    }
    throw error;
  }
}


export async function getConnectedAccount(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  
  try {
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    
    return accounts.length > 0 ? accounts[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function buildKeyDerivationMessage(walletAddress: string): string {
  return `${KEY_DERIVATION_MESSAGE} ${walletAddress.toLowerCase()}`;
}


export async function signMessage(
  message: string,
  address: string
): Promise<SignatureResult> {
  const provider = getProvider();
  
  if (!provider) {
    return {
      success: false,
      error: "MetaMask not available",
    };
  }
  
  try {
    // personal_sign expects [hexMessage, address]
    const hexMessage = stringToHex(message);
    
    const signature = (await provider.request({
      method: "personal_sign",
      params: [hexMessage, address],
    })) as string;
    
    return {
      success: true,
      signature,
      message,
    };
  } catch (error) {
    // User clicked "Reject" in MetaMask
    if ((error as { code?: number }).code === 4001) {
      return {
        success: false,
        error: "Signature rejected by user",
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Signing failed",
    };
  }
}

export async function signForKeyDerivation(
  walletAddress: string
): Promise<SignatureResult> {
  const message = buildKeyDerivationMessage(walletAddress);
  return signMessage(message, walletAddress);
}

export async function signTOCForOwnership(
  tocHash: string,
  walletAddress: string
): Promise<SignatureResult> {
  const message = `PrivateRAG-TOC-Ownership:${tocHash}`;
  return signMessage(message, walletAddress);
}

/**
 * Convert string to hex (required by personal_sign)
 */
function stringToHex(str: string): string {
  return (
    "0x" +
    Array.from(new TextEncoder().encode(str))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Subscribe to wallet account changes
 * Called when user switches accounts in MetaMask
 */
export function onAccountsChanged(
  handler: (accounts: string[]) => void
): () => void {
  const provider = getProvider();
  if (!provider) return () => {};
  
  const wrappedHandler = (accounts: unknown) => {
    handler(accounts as string[]);
  };
  
  provider.on("accountsChanged", wrappedHandler);
  
  // Return unsubscribe function
  return () => {
    provider.removeListener("accountsChanged", wrappedHandler);
  };
}

/**
 * Subscribe to chain/network changes
 * Called when user switches networks in MetaMask
 */
export function onChainChanged(handler: (chainId: string) => void): () => void {
  const provider = getProvider();
  if (!provider) return () => {};
  
  const wrappedHandler = (chainId: unknown) => {
    handler(chainId as string);
  };
  
  provider.on("chainChanged", wrappedHandler);
  
  return () => {
    provider.removeListener("chainChanged", wrappedHandler);
  };
}
