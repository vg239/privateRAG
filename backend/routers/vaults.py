"""
Vault Router - API endpoints for encrypted TOC storage

============================================================================
OVERVIEW
============================================================================

This module handles server-side storage of client-encrypted vaults.

Key principles:
- Server CANNOT decrypt TOC - only stores/retrieves encrypted blobs
- Ownership enforced via wallet address matching (not cryptographic verification)
- toc_signature allows public ownership verification without server involvement

============================================================================
SECURITY MODEL
============================================================================

Client-side:
- PDF processed in browser (never uploaded)
- TOC encrypted with AES-256-GCM using wallet-derived key
- Two signatures: key derivation (not stored) + ownership (stored)

Server-side:
- Stores encrypted_toc as opaque blob
- Cannot decrypt (no access to user's wallet signature)
- Enforces access control via wallet address matching

Verification:
- Anyone can verify toc_signature against owner_wallet
- Proves wallet owner created this specific document
- Uses standard ECDSA recovery from signed message

============================================================================
DATABASE SCHEMA
============================================================================

vaults table:
| Column        | Type        | Description                                  |
|---------------|-------------|----------------------------------------------|
| id            | INTEGER PK  | Auto-increment primary key                   |
| owner_wallet  | VARCHAR(255)| Wallet address (lowercase)                   |
| doc_hash      | VARCHAR(64) | SHA-256 of original PDF                      |
| title         | VARCHAR(255)| Document title                               |
| num_pages     | INTEGER     | Page count                                   |
| encrypted_toc | TEXT        | AES-256-GCM encrypted JSON blob              |
| toc_signature | VARCHAR(200)| Wallet signature of doc_hash (ownership)     |
| created_at    | TIMESTAMP   | Creation time                                |
| updated_at    | TIMESTAMP   | Last update time                             |

Unique constraint: (owner_wallet, doc_hash) - one vault per doc per wallet

"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from datetime import datetime

from models import Vault
from database.db_config import engine

router = APIRouter(prefix="/api/vaults", tags=["vaults"])


# =============================================================================
# Pydantic Schemas
# =============================================================================

class CreateVaultRequest(BaseModel):
    """
    Request to create a new vault.
    
    Fields:
    - owner_wallet: Wallet address that owns this vault
    - doc_hash: SHA-256 of original PDF (64 hex chars)
    - title: Human-readable document name
    - num_pages: Page count (optional)
    - encrypted_toc: JSON string containing EncryptedBlob structure
    - toc_signature: Wallet signature of doc_hash for ownership proof (optional but recommended)
    """
    owner_wallet: str = Field(..., description="Wallet address (lowercase)")
    doc_hash: str = Field(..., min_length=64, max_length=64, description="SHA256 hash of PDF")
    title: str = Field(..., max_length=255, description="Document title")
    num_pages: Optional[int] = Field(None, ge=1, description="Number of pages")
    encrypted_toc: str = Field(..., description="JSON string of EncryptedBlob")
    toc_signature: Optional[str] = Field(None, max_length=200, description="Wallet signature of doc_hash")


class UpdateVaultRequest(BaseModel):
    """Request to update a vault"""
    encrypted_toc: Optional[str] = Field(None, description="New encrypted TOC")
    title: Optional[str] = Field(None, max_length=255, description="New title")
    toc_signature: Optional[str] = Field(None, max_length=200, description="New signature")


class VaultResponse(BaseModel):
    """
    Vault response model.
    
    Note: encrypted_toc is returned as-is - server cannot decrypt it.
    Only the wallet owner can decrypt using their signature-derived key.
    """
    id: int
    owner_wallet: str
    doc_hash: str
    title: str
    num_pages: Optional[int]
    encrypted_toc: str
    toc_signature: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class VaultListResponse(BaseModel):
    """Response for listing vaults"""
    vaults: List[VaultResponse]
    total: int


class VaultSummary(BaseModel):
    """
    Minimal vault info for sidebar/list views.
    Does NOT include encrypted_toc to reduce bandwidth.
    """
    id: int
    doc_hash: str
    title: str
    num_pages: Optional[int]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# =============================================================================
# Endpoints
# =============================================================================

@router.post("", response_model=VaultResponse, status_code=201)
def create_vault(request: CreateVaultRequest):
    """
    Create or update an encrypted vault.
    
    If a vault with the same (owner_wallet, doc_hash) exists, it will be updated.
    This handles re-encryption of the same document.
    
    The server stores the encrypted_toc and toc_signature as opaque data.
    It cannot decrypt or verify the signature - that's done client-side.
    """
    owner_wallet = request.owner_wallet.lower()
    
    with Session(engine) as session:
        # Check if vault already exists for this wallet + doc_hash
        existing = session.exec(
            select(Vault).where(
                Vault.owner_wallet == owner_wallet,
                Vault.doc_hash == request.doc_hash
            )
        ).first()
        
        if existing:
            # Update existing vault
            existing.encrypted_toc = request.encrypted_toc
            existing.title = request.title
            existing.num_pages = request.num_pages
            if request.toc_signature:
                existing.toc_signature = request.toc_signature
            existing.updated_at = datetime.utcnow()
            session.add(existing)
            session.commit()
            session.refresh(existing)
            return existing
        
        # Create new vault
        vault = Vault(
            owner_wallet=owner_wallet,
            doc_hash=request.doc_hash,
            title=request.title,
            num_pages=request.num_pages,
            encrypted_toc=request.encrypted_toc,
            toc_signature=request.toc_signature,
        )
        
        session.add(vault)
        session.commit()
        session.refresh(vault)
        
        return vault


@router.get("", response_model=VaultListResponse)
def list_vaults(
    wallet: str = Query(..., description="Wallet address to filter by")
):
    """
    List all vaults for a wallet address.
    
    Returns full vault data including encrypted_toc.
    Access control: Only returns vaults where owner_wallet matches.
    """
    owner_wallet = wallet.lower()
    
    with Session(engine) as session:
        vaults = session.exec(
            select(Vault)
            .where(Vault.owner_wallet == owner_wallet)
            .order_by(Vault.created_at.desc())
        ).all()
        
        return VaultListResponse(
            vaults=list(vaults),
            total=len(vaults)
        )


@router.get("/list", response_model=List[VaultSummary])
def list_vault_summaries(
    wallet: str = Query(..., description="Wallet address to filter by")
):
    """
    List vault summaries for sidebar display.
    
    Returns minimal data (no encrypted_toc) for efficiency.
    Use GET /api/vaults/{doc_hash} to fetch full vault for decryption.
    """
    owner_wallet = wallet.lower()
    
    with Session(engine) as session:
        vaults = session.exec(
            select(Vault)
            .where(Vault.owner_wallet == owner_wallet)
            .order_by(Vault.created_at.desc())
        ).all()
        
        return [
            VaultSummary(
                id=v.id,
                doc_hash=v.doc_hash,
                title=v.title,
                num_pages=v.num_pages,
                created_at=v.created_at
            )
            for v in vaults
        ]


@router.get("/{doc_hash}", response_model=VaultResponse)
def get_vault(
    doc_hash: str,
    wallet: str = Query(..., description="Owner wallet address")
):
    """
    Get a specific vault by document hash.
    
    Access control: Only returns if wallet matches owner_wallet.
    Use this endpoint when you need the encrypted_toc for decryption.
    """
    owner_wallet = wallet.lower()
    
    with Session(engine) as session:
        vault = session.exec(
            select(Vault).where(
                Vault.owner_wallet == owner_wallet,
                Vault.doc_hash == doc_hash
            )
        ).first()
        
        if not vault:
            raise HTTPException(status_code=404, detail="Vault not found")
        
        return vault


@router.patch("/{doc_hash}", response_model=VaultResponse)
def update_vault(
    doc_hash: str,
    request: UpdateVaultRequest,
    wallet: str = Query(..., description="Owner wallet address")
):
    """
    Update an existing vault.
    
    Access control: Only owner_wallet can update.
    Use this to re-encrypt with a new key or update title.
    """
    owner_wallet = wallet.lower()
    
    with Session(engine) as session:
        vault = session.exec(
            select(Vault).where(
                Vault.owner_wallet == owner_wallet,
                Vault.doc_hash == doc_hash
            )
        ).first()
        
        if not vault:
            raise HTTPException(status_code=404, detail="Vault not found")
        
        if request.encrypted_toc is not None:
            vault.encrypted_toc = request.encrypted_toc
        if request.title is not None:
            vault.title = request.title
        if request.toc_signature is not None:
            vault.toc_signature = request.toc_signature
        
        vault.updated_at = datetime.utcnow()
        
        session.add(vault)
        session.commit()
        session.refresh(vault)
        
        return vault
