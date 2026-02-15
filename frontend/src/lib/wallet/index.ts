
export {
  setupNearWallet,
  isWalletReady,
  connectNearWallet,
  disconnectNearWallet,
  getConnectedAccount,
  buildKeyDerivationMessage,
  signForKeyDerivation,
  signTOCForOwnership,
  onAccountsChanged,
} from "./near";

export type {
  WalletType,
  WalletState,
  SignatureResult,
} from "./types";
