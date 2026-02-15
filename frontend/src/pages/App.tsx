/**
 * PrivateRAG App - Main Application Page
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Download, X, Lock, FileText, Cpu, Send, Database, Shield, CheckCircle, ExternalLink } from "lucide-react";
import { LocalPdfIndexer } from "../components/LocalPdfIndexer";
import { TreeView } from "../components/TreeView";
import type { TOCResult } from "../lib/pyodide";
import { useWallet } from "../hooks/useWallet";
import { encrypt, decrypt, type EncryptedBlob } from "../lib/crypto";
import { createVault, type VaultResponse } from "../services/vault";
import { uploadToNova, type NovaUploadResult } from "../services/nova";
import "./App.page.css";

type ViewMode = "tree" | "json" | "encrypted";
type SigningState = "idle" | "awaiting-signature" | "deriving-key" | "encrypting" | "uploading-nova" | "storing" | "done";

export function AppPage() {
  const navigate = useNavigate();
  const [localTOC, setLocalTOC] = useState<TOCResult | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Encryption state
  const [encryptedBlob, setEncryptedBlob] = useState<EncryptedBlob | null>(null);
  const [signingState, setSigningState] = useState<SigningState>("idle");
  const [encryptionError, setEncryptionError] = useState<string | null>(null);
  const [novaApiKey, setNovaApiKey] = useState("");
  const [novaResult, setNovaResult] = useState<NovaUploadResult | null>(null);

  // Vault storage state
  const [savedVault, setSavedVault] = useState<VaultResponse | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Wallet hook
  const {
    wallet,
    isConnecting,
    hasKey,
    error: walletError,
    connect,
    disconnect,
    deriveKey,
    getKey,
    // signTOC,
    isWalletAvailable,
  } = useWallet();

  function handleTOCGenerated(toc: TOCResult, file: File) {
    setLocalTOC(toc);
    setCurrentFile(file);
    setEncryptedBlob(null);
    setEncryptionError(null);
    setSavedVault(null);
    setStorageError(null);
    setNovaResult(null);
    setViewMode("tree");
    console.log("TOC generated:", toc);
  }

  async function handleEncrypt() {
    if (!localTOC) {
      setEncryptionError("No TOC to encrypt");
      return;
    }

    setEncryptionError(null);
    setEncryptionError(null);
    setStorageError(null);
    setNovaResult(null);

    try {
      let key = getKey();

      if (!key) {
        setSigningState("awaiting-signature");
        key = await deriveKey();

        if (!key) {
          setSigningState("idle");
          setEncryptionError("Signature rejected - please try again");
          return;
        }
        setSigningState("deriving-key");
      }

      setSigningState("encrypting");
      const blob = await encrypt(key, localTOC);
      setEncryptedBlob(blob);

      console.log("Encrypted:", blob);

      // Upload to NOVA if API key is present
      if (novaApiKey && currentFile) {
        setSigningState("uploading-nova");
        try {
          const result = await uploadToNova(currentFile, novaApiKey);
          setNovaResult(result);
          console.log("Uploaded to NOVA:", result);
        } catch (novaErr) {
          console.error("NOVA Upload failed:", novaErr);
          // Don't block the rest of the flow, but maybe show a warning?
          // For now, we'll continue 
          setEncryptionError("NOVA Upload failed: " + (novaErr instanceof Error ? novaErr.message : String(novaErr)));
          return;
        }
      }

      // Auto-store in database
      if (wallet.address) {
        setSigningState("storing");
        try {
          // Sign TOC hash for ownership verification (REMOVED per user request to avoid double-signing)
          // const tocSignature = await signTOC(localTOC.doc_hash);

          const vaultResponse = await createVault({
            owner_wallet: wallet.address.toLowerCase(),
            doc_hash: localTOC.doc_hash,
            title: localTOC.doc_name,
            num_pages: localTOC.num_pages,
            encrypted_toc: JSON.stringify(blob),
            // toc_signature: tocSignature || undefined,
          });
          setSavedVault(vaultResponse);
          console.log("Vault saved:", vaultResponse);
        } catch (storageErr) {
          console.error("Storage error:", storageErr);
          setStorageError(storageErr instanceof Error ? storageErr.message : "Failed to save to database");
        }
      }

      setViewMode("encrypted");
      setSigningState("done");

      setTimeout(() => setSigningState("idle"), 2000);
    } catch (err) {
      setSigningState("idle");
      setEncryptionError(err instanceof Error ? err.message : "Encryption failed");
    }
  }

  async function handleDecrypt() {
    if (!encryptedBlob) return;

    setEncryptionError(null);
    setSigningState("encrypting");

    try {
      let key = getKey();
      if (!key) {
        setSigningState("awaiting-signature");
        key = await deriveKey();
        if (!key) {
          setSigningState("idle");
          setEncryptionError("Signature required for decryption");
          return;
        }
      }

      const result = await decrypt<TOCResult>(key, encryptedBlob);

      if (result.success && result.data) {
        setLocalTOC(result.data);
        setViewMode("tree");
        setSigningState("idle");
      } else {
        setEncryptionError(result.error || "Decryption failed");
        setSigningState("idle");
      }
    } catch (err) {
      setEncryptionError(err instanceof Error ? err.message : "Decryption failed");
      setSigningState("idle");
    }
  }

  function handleDownloadJSON() {
    if (!localTOC) return;
    const blob = new Blob([JSON.stringify(localTOC, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${localTOC.doc_name.replace(".pdf", "")}_toc.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadEncrypted() {
    if (!encryptedBlob) return;
    const blob = new Blob([JSON.stringify(encryptedBlob, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `encrypted_vault.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getButtonText(): string {
    switch (signingState) {
      case "awaiting-signature":
        return "Approve in wallet...";
      case "deriving-key":
        return "Deriving key...";
      case "encrypting":
        return "Encrypting...";
      case "uploading-nova":
        return "Uploading to NOVA...";
      case "storing":
        return "Saving to database...";
      case "done":
        return savedVault ? "Saved" : "Encrypted";
      default:
        return hasKey ? "Encrypt & Save" : "Sign & Encrypt";
    }
  }

  const displayError = walletError || encryptionError || storageError;
  const isProcessing = signingState !== "idle" && signingState !== "done";

  return (
    <div className="app-page">
      {/* Background */}
      <div className="app-bg">
        <div className="bg-gradient" />
      </div>

      {/* Header */}
      <header className="app-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Home
        </button>

        <div className="header-center">
          <span className="header-logo">PrivateRAG</span>
        </div>

        <div className="header-wallet">
          {!isWalletAvailable ? (
            <span className="wallet-status">Loading wallet...</span>
          ) : wallet.connected ? (
            <div className="wallet-connected">
              <span className="wallet-address">
                {wallet.address}
              </span>
              {hasKey && <span className="key-badge" title="Encryption key active">Key Active</span>}
              <button className="disconnect-btn" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="connect-btn" onClick={connect} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <div className="main-container">
          {/* Left Panel - Controls */}
          <aside className="control-panel">
            {/* PDF Upload */}
            <div className="panel-section">
              <h2 className="section-label">
                <span className="label-icon">1</span>
                Upload PDF
              </h2>
              <LocalPdfIndexer onTOCGenerated={handleTOCGenerated} />
            </div>

            {/* Document Info */}
            {localTOC && (
              <div className="panel-section">
                <div className="section-header">
                  <h2 className="section-label">
                    <span className="label-icon success">
                      <FileText size={14} />
                    </span>
                    Document Indexed
                  </h2>
                  <div className="section-actions">
                    <button
                      className="icon-btn"
                      onClick={() => setShowInfoModal(true)}
                      title="How it works"
                    >
                      <Info size={18} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={handleDownloadJSON}
                      title="Download TOC JSON"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>
                <div className="doc-meta">
                  <div className="meta-row">
                    <span className="meta-label">File</span>
                    <span className="meta-value">{localTOC.doc_name}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Pages</span>
                    <span className="meta-value">{localTOC.num_pages}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Sections</span>
                    <span className="meta-value">{localTOC.structure.length}</span>
                  </div>
                  <div className="meta-row hash-row">
                    <span className="meta-label">Hash</span>
                    <span className="meta-value mono hash-value">{localTOC.doc_hash}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Encryption */}
            {localTOC && (
              <div className="panel-section">
                <h2 className="section-label">
                  <span className="label-icon">2</span>
                  Encrypt & Save
                </h2>

                {!wallet.connected ? (
                  <div className="encrypt-prompt">
                    <p className="prompt-text">Connect your wallet to encrypt</p>
                    <div className="wallet-connect-wrapper near-theme">
                      <div className="partner-logo-row">
                        {/* NEAR Logo SVG */}
                        <svg className="near-logo" width="24" height="24" viewBox="0 0 24 24" fill="white">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.65 14.35L10.3 9.65l-.65 6.65-2.05-2.05L12 3.6l1.35 10.75 4.3-4.3 2.05 2.05-3.05 4.25z" fill="white" />
                          <path d="M16.65 16.35L13.6 12.1l-4.3 4.3-1.35-10.75 2.05-2.05.65 6.65 6.35-6.35 2.05 2.05z" fill="white" opacity="0.5" />
                          {/* Simplified NEAR Logo approximation */}
                          <circle cx="12" cy="12" r="10" fill="transparent" stroke="currentColor" strokeWidth="2" />
                          <path d="M8 8 L16 16 M16 8 L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0" />
                          <path d="M17.9 6.8L12 16.2L6.1 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="partner-name">NEAR PROTOCOL</span>
                      </div>
                      <button className="connect-btn full near-btn" onClick={connect}>
                        Connect NEAR Wallet
                      </button>
                      <span className="partner-subtext">Official Blockchain Partner</span>
                    </div>
                  </div>
                ) : (
                  <div className="encrypt-controls">
                    <div className="nova-input-group">
                      <div className="nova-label-row">
                        <label className="nova-label">
                          NOVA API Key (Optional)
                        </label>
                        <span className="partner-badge-small">NOVA IPFS Partner</span>
                      </div>
                      <span className="nova-sublabel">Uploads original PDF to IPFS</span>
                      <input
                        type="password"
                        className="nova-input"
                        placeholder="Enter NOVA API Key..."
                        value={novaApiKey}
                        onChange={(e) => setNovaApiKey(e.target.value)}
                      />
                    </div>

                    <button
                      className={`encrypt-btn ${signingState === "done" ? "success" : ""} ${signingState === "awaiting-signature" ? "awaiting" : ""}`}
                      onClick={handleEncrypt}
                      disabled={isProcessing}
                    >
                      <Lock size={16} />
                      {getButtonText()}
                    </button>

                    {/* Saved to database indicator */}
                    {savedVault && signingState === "idle" && (
                      <div className="saved-indicator">
                        <CheckCircle size={16} />
                        <span>Saved to database (ID: {savedVault.id})</span>
                        <button
                          className="chats-link"
                          onClick={() =>
                            navigate("/chats", {
                              state: {
                                toc: localTOC,
                                vault: {
                                  doc_hash: savedVault.doc_hash,
                                  title: savedVault.title,
                                  num_pages: savedVault.num_pages,
                                },
                              },
                            })
                          }
                        >
                          Chat with this document <ExternalLink size={12} />
                        </button>
                      </div>
                    )}

                    {/* NOVA Result */}
                    {/* NOVA Result */}
                    {novaResult && signingState === "idle" && (
                      <div className="saved-indicator nova-success">
                        <CheckCircle size={16} />
                        <span>Uploaded to NOVA (IPFS)</span>
                        {novaResult.blockscanUrl && (
                          <a
                            href={novaResult.blockscanUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="blockscan-link"
                          >
                            View Transaction <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )}

                    {encryptedBlob && signingState === "idle" && (
                      <>
                        <button className="decrypt-btn" onClick={handleDecrypt}>
                          Decrypt & Verify
                        </button>
                        <button className="download-btn" onClick={handleDownloadEncrypted}>
                          <Download size={16} />
                          Download Encrypted
                        </button>
                      </>
                    )}

                    <p className="encrypt-hint">
                      {signingState === "awaiting-signature"
                        ? "Approve in your NEAR wallet..."
                        : signingState === "uploading-nova"
                          ? "Uploading PDF to NOVA/IPFS..."
                          : signingState === "storing"
                            ? "Storing encrypted blob..."
                            : hasKey
                              ? "Encryption key ready"
                              : "Sign with your NEAR wallet"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {displayError && (
              <div className="error-box">
                <span>{displayError}</span>
              </div>
            )}
          </aside>

          {/* Right Panel - Content Viewer */}
          <section className="viewer-panel">
            {/* View Toggle */}
            <div className="viewer-header">
              <h2 className="viewer-title">Document Structure</h2>
              <div className="view-tabs">
                {localTOC && (
                  <>
                    <button
                      className={`tab ${viewMode === "tree" ? "active" : ""}`}
                      onClick={() => setViewMode("tree")}
                    >
                      Tree
                    </button>
                    <button
                      className={`tab ${viewMode === "json" ? "active" : ""}`}
                      onClick={() => setViewMode("json")}
                    >
                      JSON
                    </button>
                  </>
                )}
                {encryptedBlob && (
                  <button
                    className={`tab ${viewMode === "encrypted" ? "active" : ""}`}
                    onClick={() => setViewMode("encrypted")}
                  >
                    Encrypted
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="viewer-content">
              {viewMode === "tree" && localTOC ? (
                <TreeView tree={localTOC.structure} showPanel={false} />
              ) : viewMode === "json" && localTOC ? (
                <pre className="json-view mono">
                  {JSON.stringify(localTOC, null, 2)}
                </pre>
              ) : viewMode === "encrypted" && encryptedBlob ? (
                <div className="encrypted-view">
                  <div className="encrypted-badge">
                    <Lock size={16} />
                    <span>AES-256-GCM Encrypted</span>
                  </div>
                  <p className="encrypted-note">
                    This encrypted blob is stored in the database.
                    Only your wallet signature can decrypt it.
                  </p>
                  <pre className="json-view mono encrypted-json">
                    {JSON.stringify(encryptedBlob, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="viewer-empty">
                  <FileText size={48} strokeWidth={1} />
                  <h3 className="empty-title">No document loaded</h3>
                  <p className="empty-text">
                    Upload a PDF to generate its Table of Contents locally.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Info Modal */}
      {showInfoModal && (
        <InfoModal
          onClose={() => setShowInfoModal(false)}
          toc={localTOC}
          encryptedBlob={encryptedBlob}
          savedVault={savedVault}
        />
      )}
    </div>
  );
}

/**
 * Info Modal - Explains how everything works
 */
function InfoModal({
  onClose,
  toc,
  encryptedBlob,
  savedVault
}: {
  onClose: () => void;
  toc: TOCResult | null;
  encryptedBlob: EncryptedBlob | null;
  savedVault: VaultResponse | null;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>How PrivateRAG Works</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Section 1: Pyodide Processing */}
          <div className="info-section">
            <div className="info-header">
              <Cpu size={20} />
              <h3>1. Client-Side Processing (Pyodide)</h3>
            </div>
            <p>
              Your PDF is processed entirely in your browser using Pyodide - a Python runtime
              compiled to WebAssembly. The file never leaves your device.
            </p>
            <div className="info-code">
              <span className="code-label">Process Flow:</span>
              <pre className="mono">{`PDF File (local)
    ↓
Pyodide (Python in WASM)
    ↓ pypdf library extracts:
    - Document outline/bookmarks
    - Page text content
    - Structure hierarchy
    ↓
TOC JSON (in browser memory)`}</pre>
            </div>
            {toc && (
              <div className="info-code">
                <span className="code-label">Generated TOC Structure:</span>
                <pre className="mono">{`{
  "doc_name": "${toc.doc_name}",
  "num_pages": ${toc.num_pages},
  "doc_hash": "${toc.doc_hash}",
  "structure": [
    {
      "title": "Section Title",
      "start_index": 1,
      "end_index": 5,
      "text_preview": "First 150 chars...",
      "nodes": [...] // nested children
    }
  ]
}`}</pre>
              </div>
            )}
          </div>

          {/* Section 2: Encryption */}
          <div className="info-section">
            <div className="info-header">
              <Lock size={20} />
              <h3>2. Wallet-Based Encryption</h3>
            </div>
            <p>
              Your encryption key is derived from your wallet signature. The key is never stored -
              it's regenerated each time you sign the same message.
            </p>
            <div className="info-code">
              <span className="code-label">Key Derivation:</span>
              <pre className="mono">{`// 1. Sign deterministic message (NEP-413)
const message = "PrivateRAG-Key-Derivation {accountId}";
const signature = await nearWallet.signMessage(message);

// 2. Hash signature to get 256-bit key
const keyBytes = SHA256(signature);

// 3. Import as AES-GCM key
const key = await crypto.subtle.importKey(
  keyBytes, 
  { name: "AES-GCM", length: 256 }
);`}</pre>
            </div>
            <div className="info-code">
              <span className="code-label">AES-256-GCM Encryption:</span>
              <pre className="mono">{`// Random IV per encryption
const iv = crypto.getRandomValues(new Uint8Array(12));

// Encrypt with authentication
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv, tagLength: 128 },
  key,
  JSON.stringify(toc)
);

// Output format:
{
  "iv": "base64...",
  "ciphertext": "base64...",
  "authTag": "base64...",
  "algorithm": "AES-256-GCM",
  "version": 1
}`}</pre>
            </div>
          </div>

          {/* Section 3: Storage */}
          <div className="info-section">
            <div className="info-header">
              <Database size={20} />
              <h3>3. What Gets Stored</h3>
            </div>
            <p>
              Only the encrypted blob is stored in the database. The server cannot decrypt it
              because it never has your wallet signature.
            </p>

            {savedVault ? (
              <>
                <div className="storage-status saved">
                  <CheckCircle size={16} />
                  <span>Saved to PostgreSQL database (Vault ID: {savedVault.id})</span>
                </div>
                <div className="info-code">
                  <span className="code-label">Actual Vault Record Stored:</span>
                  <pre className="mono">{JSON.stringify({
                    id: savedVault.id,
                    owner_wallet: savedVault.owner_wallet,
                    doc_hash: savedVault.doc_hash,
                    title: savedVault.title,
                    num_pages: savedVault.num_pages,
                    encrypted_toc: "<encrypted blob - see below>",
                    created_at: savedVault.created_at,
                  }, null, 2)}</pre>
                </div>
              </>
            ) : (
              <div className="info-code">
                <span className="code-label">Vault Record Schema:</span>
                <pre className="mono">{`{
  "id": <auto-generated>,
  "owner_wallet": "0x1234...abcd",
  "doc_hash": "${toc?.doc_hash || "sha256-of-pdf"}",
  "title": "${toc?.doc_name || "document.pdf"}",
  "num_pages": ${toc?.num_pages || "N"},
  "encrypted_toc": "{iv,ciphertext,authTag}",
  "created_at": "<timestamp>"
}`}</pre>
              </div>
            )}

            {encryptedBlob && (
              <div className="info-code">
                <span className="code-label">{savedVault ? "Encrypted Blob (stored in encrypted_toc):" : "Current Encrypted Blob:"}</span>
                <pre className="mono">{JSON.stringify(encryptedBlob, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Section 4: Chat with TEE */}
          <div className="info-section">
            <div className="info-header">
              <Shield size={20} />
              <h3>4. Chat via NEAR AI TEE (Coming Soon)</h3>
            </div>
            <p>
              When you ask questions, the decrypted TOC is sent to a Trusted Execution Environment
              (TEE) on NEAR AI. The TEE provides hardware-level isolation - even NEAR cannot see your data.
            </p>
            <div className="info-code">
              <span className="code-label">Query Flow:</span>
              <pre className="mono">{`1. User asks: "What is in chapter 3?"
    ↓
2. Browser fetches encrypted_toc from Supabase
    ↓
3. Browser decrypts with wallet signature
    ↓
4. Browser sends to NEAR AI TEE:
   {
     "toc": <decrypted TOC>,
     "query": "What is in chapter 3?",
     "context_window": 4096
   }
    ↓
5. TEE processes in secure enclave
   - Hardware isolation (Intel SGX/AMD SEV)
   - Memory encrypted
   - No access from host OS
    ↓
6. Response returned to browser`}</pre>
            </div>
            <div className="info-code">
              <span className="code-label">TEE Security Guarantees:</span>
              <pre className="mono">{`- Code integrity: Verified before execution
- Data confidentiality: Encrypted in memory
- Remote attestation: Proof of genuine TEE
- No persistent storage: Data cleared after use`}</pre>
            </div>
          </div>

          {/* Section 5: Security Summary */}
          <div className="info-section">
            <div className="info-header">
              <Send size={20} />
              <h3>5. What Never Leaves Your Browser</h3>
            </div>
            <div className="security-list">
              <div className="security-item safe">
                <span className="security-icon">SAFE</span>
                <span>Original PDF file</span>
              </div>
              <div className="security-item safe">
                <span className="security-icon">SAFE</span>
                <span>Decrypted TOC (except to TEE)</span>
              </div>
              <div className="security-item safe">
                <span className="security-icon">SAFE</span>
                <span>Wallet private key</span>
              </div>
              <div className="security-item safe">
                <span className="security-icon">SAFE</span>
                <span>Encryption key (derived on-demand)</span>
              </div>
              <div className="security-item sent">
                <span className="security-icon">SENT</span>
                <span>Encrypted blob (to Supabase)</span>
              </div>
              <div className="security-item sent">
                <span className="security-icon">SENT</span>
                <span>Decrypted TOC + Query (to TEE only)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
