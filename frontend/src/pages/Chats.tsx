/**
 * Chats Page - Chat with encrypted documents
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FileText, 
  Lock, 
  Plus, 
  ChevronRight, 
  MessageSquare, 
  ArrowLeft,
  RefreshCw,
  Unlock
} from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { listVaultSummaries, getVault, type VaultSummary, type VaultResponse } from "../services/vault";
import { decrypt, type EncryptedBlob } from "../lib/crypto";
import type { TOCResult, TOCNode } from "../lib/pyodide";
import "./Chats.css";

export function Chats() {
  const navigate = useNavigate();
  const { 
    wallet, 
    isConnecting, 
    hasKey, 
    connect, 
    deriveKey, 
    getKey,
    isMetaMaskInstalled 
  } = useWallet();

  // Vault list state
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [isLoadingVaults, setIsLoadingVaults] = useState(false);
  const [vaultsError, setVaultsError] = useState<string | null>(null);

  // Selected vault state
  const [selectedVault, setSelectedVault] = useState<VaultSummary | null>(null);
  const [decryptedTOC, setDecryptedTOC] = useState<TOCResult | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // Fetch vaults when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      fetchVaults();
    } else {
      setVaults([]);
      setSelectedVault(null);
      setDecryptedTOC(null);
    }
  }, [wallet.connected, wallet.address]);

  async function fetchVaults() {
    if (!wallet.address) return;
    
    setIsLoadingVaults(true);
    setVaultsError(null);
    
    try {
      const data = await listVaultSummaries(wallet.address);
      setVaults(data);
    } catch (err) {
      console.error("Failed to fetch vaults:", err);
      setVaultsError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setIsLoadingVaults(false);
    }
  }

  async function handleSelectVault(vault: VaultSummary) {
    setSelectedVault(vault);
    setDecryptedTOC(null);
    setDecryptError(null);
  }

  async function handleDecryptVault() {
    if (!selectedVault || !wallet.address) return;

    setIsDecrypting(true);
    setDecryptError(null);

    try {
      // Get or derive key
      let key = getKey();
      if (!key) {
        key = await deriveKey();
        if (!key) {
          setDecryptError("Signature required to decrypt");
          setIsDecrypting(false);
          return;
        }
      }

      // Fetch full vault with encrypted_toc
      const fullVault: VaultResponse = await getVault(selectedVault.doc_hash, wallet.address);
      
      // Parse and decrypt
      const encryptedBlob: EncryptedBlob = JSON.parse(fullVault.encrypted_toc);
      const result = await decrypt<TOCResult>(key, encryptedBlob);

      if (result.success && result.data) {
        setDecryptedTOC(result.data);
      } else {
        setDecryptError(result.error || "Decryption failed");
      }
    } catch (err) {
      console.error("Decrypt error:", err);
      setDecryptError(err instanceof Error ? err.message : "Failed to decrypt");
    } finally {
      setIsDecrypting(false);
    }
  }

  return (
    <div className="chats-page">
      {/* Background */}
      <div className="chats-bg">
        <div className="bg-gradient" />
      </div>

      {/* Header */}
      <header className="chats-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <ArrowLeft size={20} />
          Home
        </button>
        
        <div className="header-center">
          <span className="header-logo">PrivateRAG Chats</span>
        </div>

        <div className="header-wallet">
          {!isMetaMaskInstalled ? (
            <span className="wallet-status">MetaMask required</span>
          ) : wallet.connected ? (
            <div className="wallet-connected">
              <span className="wallet-address">
                {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
              </span>
              {hasKey && <span className="key-badge">Key Active</span>}
            </div>
          ) : (
            <button className="connect-btn" onClick={connect} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="chats-main">
        {!wallet.connected ? (
          <div className="connect-prompt">
            <Lock size={48} strokeWidth={1} />
            <h2>Connect Your Wallet</h2>
            <p>Connect MetaMask to access your encrypted documents</p>
            <button className="connect-btn large" onClick={connect} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          </div>
        ) : (
          <div className="chats-container">
            {/* Sidebar - Document List */}
            <aside className="documents-sidebar">
              <div className="sidebar-header">
                <h2 className="sidebar-title">Documents</h2>
                <div className="sidebar-actions">
                  <button 
                    className="icon-btn" 
                    onClick={fetchVaults}
                    disabled={isLoadingVaults}
                    title="Refresh"
                  >
                    <RefreshCw size={16} className={isLoadingVaults ? "spinning" : ""} />
                  </button>
                  <button 
                    className="icon-btn primary" 
                    onClick={() => navigate("/app")}
                    title="Add new document"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="sidebar-content">
                {isLoadingVaults ? (
                  <div className="sidebar-loading">
                    <RefreshCw size={20} className="spinning" />
                    <span>Loading documents...</span>
                  </div>
                ) : vaultsError ? (
                  <div className="sidebar-error">
                    <span>{vaultsError}</span>
                    <button onClick={fetchVaults}>Retry</button>
                  </div>
                ) : vaults.length === 0 ? (
                  <div className="sidebar-empty">
                    <FileText size={32} strokeWidth={1} />
                    <p>No documents yet</p>
                    <button className="add-doc-btn" onClick={() => navigate("/app")}>
                      <Plus size={16} />
                      Add Document
                    </button>
                  </div>
                ) : (
                  <ul className="documents-list">
                    {vaults.map((vault) => (
                      <li 
                        key={vault.doc_hash}
                        className={`document-item ${selectedVault?.doc_hash === vault.doc_hash ? "selected" : ""}`}
                        onClick={() => handleSelectVault(vault)}
                      >
                        <div className="doc-icon">
                          <FileText size={18} />
                        </div>
                        <div className="doc-info">
                          <span className="doc-title">{vault.title}</span>
                          <span className="doc-meta">
                            {vault.num_pages} pages
                            {vault.created_at && (
                              <> · {new Date(vault.created_at).toLocaleDateString()}</>
                            )}
                          </span>
                        </div>
                        <ChevronRight size={16} className="doc-arrow" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>

            {/* Main Chat Area */}
            <section className="chat-panel">
              {!selectedVault ? (
                <div className="chat-empty">
                  <MessageSquare size={48} strokeWidth={1} />
                  <h3>Select a Document</h3>
                  <p>Choose a document from the sidebar to start chatting</p>
                </div>
              ) : !decryptedTOC ? (
                <div className="decrypt-prompt">
                  <Lock size={48} strokeWidth={1} />
                  <h3>{selectedVault.title}</h3>
                  <p>This document is encrypted. Sign to decrypt and chat.</p>
                  <button 
                    className="decrypt-btn large" 
                    onClick={handleDecryptVault}
                    disabled={isDecrypting}
                  >
                    <Unlock size={18} />
                    {isDecrypting ? "Decrypting..." : hasKey ? "Decrypt" : "Sign & Decrypt"}
                  </button>
                  {decryptError && (
                    <div className="decrypt-error">{decryptError}</div>
                  )}
                </div>
              ) : (
                <div className="chat-active">
                  <div className="chat-header">
                    <div className="chat-doc-info">
                      <FileText size={20} />
                      <span className="chat-doc-title">{decryptedTOC.doc_name}</span>
                      <span className="chat-doc-pages">{decryptedTOC.num_pages} pages</span>
                    </div>
                    <div className="decrypted-badge">
                      <Unlock size={14} />
                      Decrypted
                    </div>
                  </div>

                  <div className="chat-content">
                    <div className="toc-preview">
                      <h4>Document Structure</h4>
                      <div className="toc-tree">
                        <TOCTree nodes={decryptedTOC.structure} />
                      </div>
                    </div>

                    <div className="chat-placeholder">
                      <MessageSquare size={32} strokeWidth={1} />
                      <h4>Chat Coming Soon</h4>
                      <p>
                        NEAR AI TEE integration is in development.
                        Your decrypted TOC will be sent to a secure enclave for processing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Recursive TOC Tree component
 */
function TOCTree({ nodes, level = 0 }: { nodes: TOCNode[]; level?: number }) {
  return (
    <ul className={`toc-tree-list level-${level}`}>
      {nodes.map((node, i) => (
        <li key={i} className="toc-tree-item">
          <div className="toc-tree-node">
            <span className="toc-tree-title">{node.title}</span>
            <span className="toc-tree-pages">
              {node.start_index === node.end_index 
                ? `p. ${node.start_index}` 
                : `pp. ${node.start_index}-${node.end_index}`}
            </span>
          </div>
          {node.nodes && node.nodes.length > 0 && (
            <TOCTree nodes={node.nodes} level={level + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

