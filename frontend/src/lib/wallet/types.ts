
export type WalletType = "metamask" | "near";

export interface WalletState {
  connected: boolean;
  type: WalletType | null;
  address: string | null;
  chainId: string | null;
}

export interface SignatureResult {
  success: boolean;
  signature?: string;
  message?: string;
  error?: string;
}

/**
 * Ethereum provider interface (MetaMask)
 */
export interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

/**
 * Window with ethereum property
 */
declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

