export type DocumentSummary = {
  id: number;
  title: string;
  file_path: string;
  num_pages?: number | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DocumentListResponse = {
  total: number;
  items: DocumentSummary[];
};

export type PageIndexNode = {
  title?: string;
  node_id?: string;
  page_index?: number;
  start_index?: number;
  end_index?: number;
  summary?: string;
  text?: string;
  nodes?: PageIndexNode[];
};

export type DocumentDetail = DocumentSummary & {
  tree?: PageIndexNode[] | PageIndexNode | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  document_id: number;
  answer: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

export async function fetchDocuments(): Promise<DocumentListResponse> {
  const res = await fetch(`${API_BASE_URL}/documents`);
  return handleResponse<DocumentListResponse>(res);
}

export async function uploadDocument(file: File, title?: string): Promise<DocumentDetail> {
  const formData = new FormData();
  formData.append("file", file);
  if (title) {
    formData.append("title", title);
  }

  const res = await fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<DocumentDetail>(res);
}

export async function fetchDocumentDetail(id: number): Promise<DocumentDetail> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`);
  return handleResponse<DocumentDetail>(res);
}

export async function sendChatMessage(
  documentId: number,
  question: string,
  history: ChatMessage[] = [],
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      document_id: documentId,
      question,
      history,
    }),
  });

  return handleResponse<ChatResponse>(res);
}

