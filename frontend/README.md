# PrivateRAG Frontend (PageIndex-style UI)

This folder contains the React + TypeScript + Vite frontend for PrivateRAG. It provides:

- A **documents dashboard** for uploading and browsing PDFs.
- A PageIndex-style **tree view** of each document.
- A conversational **chat panel** that asks OpenAI questions over the stored PageIndex tree.

The UI is intentionally clean, light, and card-based, inspired by the official PageIndex docs UI.

## 🔌 Backend assumptions

The frontend talks to the FastAPI backend in `../backend`:

- `POST /documents` – upload & index PDFs with PageIndex.
- `GET /documents` – list documents.
- `GET /documents/{id}` – get a single document (including its PageIndex tree).
- `POST /chat` – chat over a specific document using OpenAI.

By default, it expects the backend at `http://localhost:8000`.

You can override this via a Vite env var:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## 🚀 Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Then open the printed URL in your browser (usually `http://localhost:5173`).

## 💡 Main UI pieces

- `src/App.tsx` – overall layout: header, sidebar (upload + document list), chat + tree panels.
- `src/api/client.ts` – small API client for `/documents` and `/chat`.
- `src/components/UploadArea.tsx` – PDF upload + status messaging.
- `src/components/DocumentList.tsx` – sidebar list of documents with status pills.
- `src/components/TreeView.tsx` – recursive PageIndex tree viewer.
- `src/components/ChatPanel.tsx` – multi-turn chat UI scoped to the selected document.

No authentication is required; all endpoints are called directly from the browser.

