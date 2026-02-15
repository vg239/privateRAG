
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface VaultData {
  owner_wallet: string;
  doc_hash: string;
  title: string;
  num_pages?: number;
  encrypted_toc: string;
  toc_signature?: string;
}

/**
 * Vault response from API
 */
export interface VaultResponse {
  id: number;
  owner_wallet: string;
  doc_hash: string;
  title: string;
  num_pages?: number;
  encrypted_toc: string;
  toc_signature?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Minimal vault info for sidebar/list views
 * (doesn't include encrypted_toc to reduce bandwidth)
 */
export interface VaultSummary {
  id: number;
  doc_hash: string;
  title: string;
  num_pages?: number;
  created_at?: string;
}

export interface VaultListResponse {
  vaults: VaultResponse[];
  total: number;
}

export async function createVault(data: VaultData): Promise<VaultResponse> {
  const response = await fetch(`${API_BASE}/api/vaults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
  
export async function listVaults(wallet: string): Promise<VaultResponse[]> {
  const response = await fetch(
    `${API_BASE}/api/vaults?wallet=${encodeURIComponent(wallet.toLowerCase())}`
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data: VaultListResponse = await response.json();
  return data.vaults;
}

export async function listVaultSummaries(wallet: string): Promise<VaultSummary[]> {
  const response = await fetch(
    `${API_BASE}/api/vaults/list?wallet=${encodeURIComponent(wallet.toLowerCase())}`
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

export async function getVault(docHash: string, wallet: string): Promise<VaultResponse> {
  const response = await fetch(
    `${API_BASE}/api/vaults/${docHash}?wallet=${encodeURIComponent(wallet.toLowerCase())}`
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Vault not found');
    }
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

export async function deleteVault(docHash: string, wallet: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/vaults/${docHash}?wallet=${encodeURIComponent(wallet.toLowerCase())}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}
