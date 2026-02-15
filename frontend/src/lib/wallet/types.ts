
export type WalletType = "near";

export interface WalletState {
  connected: boolean;
  type: WalletType | null;
  /** NEAR account ID (e.g. alice.testnet) */
  address: string | null;
  /** Network ID (testnet / mainnet) */
  chainId: string | null;
}

export interface SignatureResult {
  success: boolean;
  signature?: string;
  message?: string;
  error?: string;
}
