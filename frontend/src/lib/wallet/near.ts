/**
 * NEAR Wallet integration using @near-wallet-selector
 *
 * Provides connect, disconnect, message signing, and account change events.
 */

import { setupWalletSelector, type WalletSelector, type AccountState } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import type { WalletState, SignatureResult } from "./types";

// Import modal styles
import "@near-wallet-selector/modal-ui/styles.css";

// ---------- Configuration ----------

const NEAR_NETWORK = "testnet";
const KEY_DERIVATION_MESSAGE = "PrivateRAG-Key-Derivation";

// ---------- Module State ----------

let selector: WalletSelector | null = null;
let modal: WalletSelectorModal | null = null;
let initPromise: Promise<void> | null = null;

// ---------- Initialisation ----------

/**
 * Initialise the wallet selector (idempotent).
 * Call early — e.g. on app mount.
 */
export async function setupNearWallet(): Promise<void> {
    if (selector) return;

    // Deduplicate concurrent init calls
    if (initPromise) return initPromise;

    initPromise = (async () => {
        selector = await setupWalletSelector({
            network: NEAR_NETWORK,
            modules: [setupMyNearWallet()],
        });

        modal = setupModal(selector, {
            contractId: "", // No contract needed for signing
        });
    })();

    await initPromise;
}

/**
 * Whether the wallet selector is initialised and ready.
 */
export function isWalletReady(): boolean {
    return selector !== null;
}

// ---------- Connection ----------

/**
 * Open the wallet-selector modal so the user can pick a wallet and sign in.
 * Resolves once an account is available (or throws on failure).
 */
export async function connectNearWallet(): Promise<WalletState> {
    await setupNearWallet();

    if (!selector || !modal) {
        throw new Error("Wallet selector not initialised");
    }

    // If already signed in, return current state
    const existing = getActiveAccount();
    if (existing) {
        return {
            connected: true,
            type: "near",
            address: existing.accountId,
            chainId: NEAR_NETWORK,
        };
    }

    // Show modal and wait for sign-in
    return new Promise<WalletState>((resolve, reject) => {
        if (!selector) {
            reject(new Error("Wallet selector not initialised"));
            return;
        }

        // Listen for account state changes
        const subscription = selector.store.observable.subscribe((state) => {
            const account = state.accounts.find((a: AccountState) => a.active);
            if (account) {
                subscription.unsubscribe();
                resolve({
                    connected: true,
                    type: "near",
                    address: account.accountId,
                    chainId: NEAR_NETWORK,
                });
            }
        });

        // Show the modal — user picks wallet and signs in
        modal!.show();

        // If user closes modal without connecting, we'll just leave the promise
        // pending — they can retry. The subscription cleans up on success.
    });
}

/**
 * Disconnect the current wallet.
 */
export async function disconnectNearWallet(): Promise<void> {
    if (!selector) return;

    const wallet = await selector.wallet().catch(() => null);
    if (wallet) {
        await wallet.signOut();
    }
}

/**
 * Get the currently connected account ID, or null.
 */
export function getConnectedAccount(): string | null {
    const account = getActiveAccount();
    return account?.accountId ?? null;
}

// ---------- Signing (NEP-413) ----------

/**
 * Build the deterministic message used for key derivation.
 */
export function buildKeyDerivationMessage(accountId: string): string {
    return `${KEY_DERIVATION_MESSAGE} ${accountId}`;
}

/**
 * Sign a message using NEP-413 signMessage.
 * Returns the base64-encoded signature.
 */
/**
 * Sign a message using NEP-413 signMessage.
 * Returns the base64-encoded signature.
 * 
 * @param message The text message to sign
 * @param nonce Optional 32-byte buffer. If not provided, a random nonce is generated.
 */
async function signMessage(message: string, nonce?: Buffer): Promise<SignatureResult> {
    if (!selector) {
        return { success: false, error: "Wallet not initialised" };
    }

    try {
        const wallet = await selector.wallet();

        // Use provided nonce OR generate a random one (standard security practice)
        const actualNonce = nonce || Buffer.from(crypto.getRandomValues(new Uint8Array(32)));

        // NEP-413 signMessage
        const result = await (wallet as any).signMessage({
            message,
            recipient: "privaterag.app",
            nonce: actualNonce,
        });

        if (!result || !result.signature) {
            return { success: false, error: "Signing returned no result" };
        }

        // Convert signature to hex string for key derivation compatibility
        const sigHex = typeof result.signature === "string"
            ? result.signature
            : Array.from(new Uint8Array(result.signature)).map(b => b.toString(16).padStart(2, "0")).join("");

        return {
            success: true,
            signature: sigHex,
            message,
        };
    } catch (error) {
        // User rejected or wallet doesn't support signMessage
        const msg = error instanceof Error ? error.message : "Signing failed";

        if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
            return { success: false, error: "Signature rejected by user" };
        }

        return { success: false, error: msg };
    }
}

/**
 * Sign for key derivation (deterministic message → deterministic signature → AES key).
 * 
 * CRITICAL: We MUST use a deterministic (zero) nonce here. 
 * If we used a random nonce, the signature would change every time, 
 * and the user would derive a different encryption key, making them unable to decrypt valid files.
 */
export async function signForKeyDerivation(accountId: string): Promise<SignatureResult> {
    const message = buildKeyDerivationMessage(accountId);
    // Explicitly using 32 bytes of zeros for deterministic output
    const zeroNonce = Buffer.from(new Uint8Array(32));
    return signMessage(message, zeroNonce);
}

/**
 * Sign a TOC hash for ownership verification.
 * Uses a random nonce for freshness/security.
 */
export async function signTOCForOwnership(
    tocHash: string,
    _accountId: string
): Promise<SignatureResult> {
    const message = `PrivateRAG-TOC-Ownership:${tocHash}`;
    // No nonce passed -> uses random nonce
    return signMessage(message);
}

// ---------- Event Subscriptions ----------

/**
 * Subscribe to account changes (sign-in, sign-out, account switch).
 * Returns an unsubscribe function.
 */
export function onAccountsChanged(
    handler: (accounts: string[]) => void
): () => void {
    if (!selector) return () => { };

    const subscription = selector.store.observable.subscribe((state) => {
        const accountIds = state.accounts.map((a: AccountState) => a.accountId);
        handler(accountIds);
    });

    return () => subscription.unsubscribe();
}

// ---------- Helpers ----------

function getActiveAccount(): AccountState | undefined {
    if (!selector) return undefined;
    const state = selector.store.getState();
    return state.accounts.find((a: AccountState) => a.active);
}
