/**
 * Chats Page - Chat with encrypted documents
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Lock,
  Plus,
  ChevronRight,
  MessageSquare,
  ArrowLeft,
  RefreshCw,
  Unlock,
  Send,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import {
  listVaultSummaries,
  getVault,
  type VaultSummary,
  type VaultResponse,
} from "../services/vault";
import { decrypt, type EncryptedBlob } from "../lib/crypto";
import type { TOCResult, TOCNode } from "../lib/pyodide";
import {
  answerQuestionOverTree,
  type ChatMessage,
  type HistoryEntry,
} from "../lib/chat";
import { initNearAI, isNearAIReady } from "../lib/nearai";
import "./Chats.css";

// Local storage key for API key (shared with LocalPdfIndexer)
const API_KEY_STORAGE_KEY = "to_be_put_by_the_user";

export function Chats() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    wallet,
    isConnecting,
    hasKey,
    connect,
    deriveKey,
    getKey,
    isMetaMaskInstalled,
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

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showTOC, setShowTOC] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Fetch vaults when wallet connects or page is navigated to
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      fetchVaults();
    } else {
      setVaults([]);
      setSelectedVault(null);
      setDecryptedTOC(null);
      setMessages([]);
    }
  }, [wallet.connected, wallet.address]);

  // Re-fetch vaults when the tab becomes visible (e.g. switching back from App page)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible" && wallet.connected && wallet.address) {
        fetchVaults();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [wallet.connected, wallet.address]);

  // Pick up TOC passed from App page via route state
  useEffect(() => {
    const state = location.state as { toc?: TOCResult; vault?: VaultSummary } | null;
    if (state?.toc && state?.vault) {
      setSelectedVault(state.vault);
      setDecryptedTOC(state.toc);
      // Clear the state so refreshing doesn't re-apply
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // Initialize NEAR AI client from stored API key
  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedKey && !isNearAIReady()) {
      initNearAI(storedKey);
    }
  }, []);

  async function fetchVaults() {
    if (!wallet.address) return;

    setIsLoadingVaults(true);
    setVaultsError(null);

    try {
      const data = await listVaultSummaries(wallet.address);
      setVaults(data);
    } catch (err) {
      console.error("Failed to fetch vaults:", err);
      setVaultsError(
        err instanceof Error ? err.message : "Failed to load documents"
      );
    } finally {
      setIsLoadingVaults(false);
    }
  }

  async function handleSelectVault(vault: VaultSummary) {
    setSelectedVault(vault);
    setDecryptedTOC(null);
    setDecryptError(null);
    setMessages([]);
    setChatError(null);
    setShowTOC(false);
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
      const fullVault: VaultResponse = await getVault(
        selectedVault.doc_hash,
        wallet.address
      );

      // Parse and decrypt
      const encryptedBlob: EncryptedBlob = JSON.parse(fullVault.encrypted_toc);
      const result = await decrypt<TOCResult>(key, encryptedBlob);

      if (result.success && result.data) {
        setDecryptedTOC(result.data);
        // Focus chat input after decryption
        setTimeout(() => chatInputRef.current?.focus(), 200);
      } else {
        setDecryptError(result.error || "Decryption failed");
      }
    } catch (err) {
      console.error("Decrypt error:", err);
      setDecryptError(
        err instanceof Error ? err.message : "Failed to decrypt"
      );
    } finally {
      setIsDecrypting(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || isSending || !decryptedTOC) return;

    // Check NEAR AI client
    if (!isNearAIReady()) {
      setChatError(
        "NEAR AI API key not configured. Set it in the App page first."
      );
      return;
    }

    const question = chatInput.trim();
    setChatInput("");
    setChatError(null);

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      // Build history from previous messages
      const history: HistoryEntry[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const answer = await answerQuestionOverTree(
        question,
        decryptedTOC,
        history
      );

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
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
            <button
              className="connect-btn"
              onClick={connect}
              disabled={isConnecting}
            >
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
            <button
              className="connect-btn large"
              onClick={connect}
              disabled={isConnecting}
            >
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
                    <RefreshCw
                      size={16}
                      className={isLoadingVaults ? "spinning" : ""}
                    />
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
                    <button
                      className="add-doc-btn"
                      onClick={() => navigate("/app")}
                    >
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
                              <>
                                {" "}
                                ·{" "}
                                {new Date(
                                  vault.created_at
                                ).toLocaleDateString()}
                              </>
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
                  <p>
                    This document is encrypted. Sign to decrypt and chat.
                  </p>
                  <button
                    className="decrypt-btn large"
                    onClick={handleDecryptVault}
                    disabled={isDecrypting}
                  >
                    <Unlock size={18} />
                    {isDecrypting
                      ? "Decrypting..."
                      : hasKey
                        ? "Decrypt"
                        : "Sign & Decrypt"}
                  </button>
                  {decryptError && (
                    <div className="decrypt-error">{decryptError}</div>
                  )}
                </div>
              ) : (
                <div className="chat-active">
                  {/* Chat Header */}
                  <div className="chat-header">
                    <div className="chat-doc-info">
                      <FileText size={20} />
                      <span className="chat-doc-title">
                        {decryptedTOC.doc_name}
                      </span>
                      <span className="chat-doc-pages">
                        {decryptedTOC.num_pages} pages
                      </span>
                    </div>
                    <div className="chat-header-actions">
                      <button
                        className={`toc-toggle-btn ${showTOC ? "active" : ""}`}
                        onClick={() => setShowTOC((v) => !v)}
                        title="Toggle document structure"
                      >
                        <BookOpen size={16} />
                        TOC
                      </button>
                      <div className="decrypted-badge">
                        <Unlock size={14} />
                        Decrypted
                      </div>
                    </div>
                  </div>

                  {/* Chat Body */}
                  <div className="chat-body">
                    {/* Optional TOC sidebar */}
                    {showTOC && (
                      <div className="toc-sidebar">
                        <h4>Document Structure</h4>
                        <div className="toc-tree">
                          <TOCTree nodes={decryptedTOC.structure} />
                        </div>
                      </div>
                    )}

                    {/* Messages Area */}
                    <div className="chat-messages-area">
                      <div className="chat-messages-scroll">
                        {messages.length === 0 ? (
                          <div className="chat-welcome">
                            <MessageSquare
                              size={36}
                              strokeWidth={1}
                              className="welcome-icon"
                            />
                            <h4>Chat with your document</h4>
                            <p>
                              Ask questions about{" "}
                              <strong>{decryptedTOC.doc_name}</strong>. The
                              document's structure and summaries are sent to the
                              LLM as context.
                            </p>
                            <div className="suggested-questions">
                              {[
                                "What topics does this document cover?",
                                "Summarize the key points",
                                "What is discussed in the first section?",
                              ].map((q) => (
                                <button
                                  key={q}
                                  className="suggested-q"
                                  onClick={() => {
                                    setChatInput(q);
                                    chatInputRef.current?.focus();
                                  }}
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`chat-msg ${msg.role}`}
                            >
                              <div className="chat-msg-avatar">
                                {msg.role === "user" ? "You" : "AI"}
                              </div>
                              <div className="chat-msg-body">
                                <div className="chat-msg-content">
                                  {msg.role === "assistant" ? (
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                    >
                                      {msg.content}
                                    </ReactMarkdown>
                                  ) : (
                                    <p>{msg.content}</p>
                                  )}
                                </div>
                                <span className="chat-msg-time">
                                  {msg.timestamp.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            </div>
                          ))
                        )}

                        {/* Typing indicator */}
                        {isSending && (
                          <div className="chat-msg assistant">
                            <div className="chat-msg-avatar">AI</div>
                            <div className="chat-msg-body">
                              <div className="chat-msg-content">
                                <div className="typing-dots">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div ref={messagesEndRef} />
                      </div>

                      {/* Error */}
                      {chatError && (
                        <div className="chat-error-bar">
                          <AlertCircle size={16} />
                          <span>{chatError}</span>
                          <button onClick={() => setChatError(null)}>
                            Dismiss
                          </button>
                        </div>
                      )}

                      {/* Input */}
                      <form
                        className="chat-input-form"
                        onSubmit={handleSendMessage}
                      >
                        <input
                          ref={chatInputRef}
                          type="text"
                          className="chat-input"
                          placeholder="Ask about your document..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          disabled={isSending}
                        />
                        <button
                          type="submit"
                          className="chat-send-btn"
                          disabled={!chatInput.trim() || isSending}
                        >
                          <Send size={18} />
                        </button>
                      </form>
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
