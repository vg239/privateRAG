import { useEffect, useState } from "react";
import "./App.css";
import {
  fetchDocuments,
  fetchDocumentDetail,
  sendChatMessage,
  requestAuthNonce,
  verifyAuthSignature,
  type DocumentSummary,
  type DocumentDetail,
  type ChatMessage,
} from "./api/client";
import { UploadArea } from "./components/UploadArea";
import { DocumentList } from "./components/DocumentList";
import { TreeView } from "./components/TreeView";
import { ChatPanel } from "./components/ChatPanel";

function App() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DocumentDetail | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  async function loadDocuments() {
    setIsLoadingDocs(true);
    setError(null);
    try {
      const res = await fetchDocuments();
      setDocuments(res.items);
      if (res.items.length && selectedId === null) {
        setSelectedId(res.items[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents.");
    } finally {
      setIsLoadingDocs(false);
    }
  }

  useEffect(() => {
    loadDocuments().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId == null) {
      setSelectedDetail(null);
      return;
    }
    fetchDocumentDetail(selectedId)
      .then((detail) => setSelectedDetail(detail))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load document."));
  }, [selectedId]);

  function handleUploaded(doc: DocumentDetail) {
    setDocuments((prev) => [doc, ...prev]);
    setSelectedId(doc.id);
    setSelectedDetail(doc);
  }

  async function handleSendChat(question: string, history: ChatMessage[]): Promise<string> {
    if (!selectedId) return "";
    const res = await sendChatMessage(selectedId, question, history);
    return res.answer;
  }

  async function handleConnectWallet() {
    setError(null);
    setAuthMessage(null);
    setIsConnectingWallet(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        setError("MetaMask (window.ethereum) not found. Please install MetaMask.");
        return;
      }

      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (!accounts || !accounts.length) {
        setError("No wallet accounts returned from MetaMask.");
        return;
      }

      const wallet = accounts[0].toLowerCase();
      setWalletAddress(wallet);

      const { nonce } = await requestAuthNonce(wallet);
      const message = `Login to PrivateRAG with wallet ${wallet}. Nonce: ${nonce}`;

      const signature: string = await eth.request({
        method: "personal_sign",
        params: [message, wallet],
      });

      await verifyAuthSignature(wallet, signature);
      setAuthMessage("Wallet connected");

      // Optionally reload documents after auth so they are scoped to this wallet
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
    } finally {
      setIsConnectingWallet(false);
    }
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">
          <span className="app-brand">PrivateRAG</span>
          <span className="app-subtitle">Vectorless, reasoning-based RAG with PageIndex</span>
        </div>
        <div className="app-meta">
          <button
            className="pill"
            type="button"
            onClick={handleConnectWallet}
            disabled={isConnectingWallet}
          >
            {walletAddress
              ? `Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
              : isConnectingWallet
                ? "Connecting..."
                : "Connect Wallet"}
          </button>
          {authMessage ? <span className="pill pill-quiet">{authMessage}</span> : null}
        </div>
      </header>

      <main className="app-main">
        <section className="sidebar">
          <UploadArea onUploaded={handleUploaded} />
          <div className="sidebar-section">
            <h3 className="section-title">
              Documents{" "}
              {isLoadingDocs ? <span className="muted small">(loading...)</span> : null}
            </h3>
            <DocumentList
              documents={documents}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="content">
          <div className="content-columns">
            <div className="content-left">
              <ChatPanel
                documentTitle={selectedDetail?.title ?? null}
                onSend={handleSendChat}
              />
            </div>
            <div className="content-right">
              <TreeView tree={selectedDetail?.tree} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
