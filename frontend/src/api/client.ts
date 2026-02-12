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

export type NonceResponse = {
  wallet_address: string;
  nonce: string;
};

export type VerifyResponse = {
  access_token: string;
  token_type: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const headers: HeadersInit = { ...extra };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

export async function fetchDocuments(): Promise<DocumentListResponse> {
  const res = await fetch(`${API_BASE_URL}/documents`, {
    headers: authHeaders(),
  });
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
    headers: authHeaders(),
    body: formData,
  });

  return handleResponse<DocumentDetail>(res);
}

export async function fetchDocumentDetail(id: number): Promise<DocumentDetail> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
    headers: authHeaders(),
  });
  return handleResponse<DocumentDetail>(res);
}

export async function sendChatMessage(
  documentId: number,
  question: string,
  history: ChatMessage[] = [],
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      document_id: documentId,
      question,
      history,
    }),
  });

  return handleResponse<ChatResponse>(res);
}

const buildLoginMessage = (walletAddress: string, nonce: string): string =>
  `Login to PrivateRAG with wallet ${walletAddress.toLowerCase()}. Nonce: ${nonce}`;

export async function requestAuthNonce(walletAddress: string): Promise<NonceResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/nonce`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wallet_address: walletAddress.toLowerCase() }),
  });
  return handleResponse<NonceResponse>(res);
}

export async function verifyAuthSignature(
  walletAddress: string,
  signature: string,
): Promise<VerifyResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      wallet_address: walletAddress.toLowerCase(),
      signature,
    }),
  });

  const data = await handleResponse<VerifyResponse>(res);
  setAuthToken(data.access_token);
  return data;
}

