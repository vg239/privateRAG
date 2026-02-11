import type { DocumentSummary } from "../api/client";

type Props = {
  documents: DocumentSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function DocumentList({ documents, selectedId, onSelect }: Props) {
  if (!documents.length) {
    return (
      <div className="empty-state">
        <p>No documents yet.</p>
        <p className="muted">Upload a PDF to get started.</p>
      </div>
    );
  }

  return (
    <ul className="doc-list">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className={`doc-list-item ${selectedId === doc.id ? "selected" : ""}`}
          onClick={() => onSelect(doc.id)}
        >
          <div className="doc-list-title">{doc.title}</div>
          <div className="doc-list-meta">
            <span className={`status-pill status-${doc.status.toLowerCase()}`}>
              {doc.status}
            </span>
            {doc.num_pages ? <span className="doc-pages">{doc.num_pages} pages</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

