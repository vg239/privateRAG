
export {
  isMetaMaskAvailable,
  connectMetaMask,
  getConnectedAccount,
  buildKeyDerivationMessage,
  signMessage,
  signForKeyDerivation,
  signTOCForOwnership,
  onAccountsChanged,
  onChainChanged,
} from "./metamask";

export type {
  WalletType,
  WalletState,
  SignatureResult,
  EthereumProvider,
} from "./types";

