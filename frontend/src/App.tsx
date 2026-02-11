import { useEffect, useState } from "react";
import "./App.css";
import {
  fetchDocuments,
  fetchDocumentDetail,
  sendChatMessage,
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

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">
          <span className="app-brand">PrivateRAG</span>
          <span className="app-subtitle">Vectorless, reasoning-based RAG with PageIndex</span>
        </div>
        <div className="app-meta">
          <span className="pill">OpenAI: gpt-4o-mini-search-preview-2025-03-11</span>
          <span className="pill pill-quiet">Supabase Postgres</span>
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
