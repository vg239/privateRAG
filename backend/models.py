from typing import Optional
import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, text, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

class Vault(SQLModel, table=True):
    """
    Privacy-first encrypted document vault.
    
    Stores client-side encrypted TOC (Table of Contents) generated via Pyodide/PageIndex.
    The encryption key is derived from wallet signature and NEVER stored.
    Only the owner can decrypt their TOC using their wallet.
    """
    
    __tablename__ = "vaults"
    __table_args__ = (
        Index("idx_vaults_owner_wallet", "owner_wallet"),
        Index("idx_vaults_doc_hash", "doc_hash"),
        Index("idx_vaults_created_at", "created_at"),
        # Ensure each wallet can only have one vault per document
        UniqueConstraint("owner_wallet", "doc_hash", name="uq_vaults_owner_doc"),
    )
    
    id: int = Field(sa_column=Column("id", Integer, primary_key=True))
    
    # Owner identification (wallet address - lowercase)
    owner_wallet: str = Field(
        sa_column=Column("owner_wallet", String(255), nullable=False),
        description="Wallet address that owns this vault (e.g., 0x... or user.near)"
    )
    
    # Document identification (SHA256 hash of original PDF bytes)
    doc_hash: str = Field(
        sa_column=Column("doc_hash", String(64), nullable=False),
        description="SHA256 hash of the original PDF file for unique identification"
    )
    
    # Human-readable document title
    title: str = Field(
        sa_column=Column("title", String(255), nullable=False),
        description="Document title (usually the filename)"
    )
    
    # Number of pages in the document
    num_pages: Optional[int] = Field(
        default=None,
        sa_column=Column("num_pages", Integer),
        description="Number of pages in the PDF"
    )
    
    # Encrypted TOC blob (AES-256-GCM encrypted)
    # Format: { "ciphertext": "base64...", "iv": "base64...", "tag": "base64..." }
    encrypted_toc: str = Field(
        sa_column=Column("encrypted_toc", Text, nullable=False),
        description="Client-side encrypted TOC (AES-256-GCM). Server cannot decrypt."
    )
    
    # Wallet signature of TOC hash for ownership verification (OPTIONAL but recommended)
    # Allows public verification: recoverAddress(hash(decrypted_toc), signature) === owner_wallet
    toc_signature: Optional[str] = Field(
        default=None,
        sa_column=Column("toc_signature", String(200)),
        description="Wallet signature of TOC hash for ownership proof and integrity verification"
    )
    
    # Timestamps
    created_at: Optional[datetime.datetime] = Field(
        default=None,
        sa_column=Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        description="Vault creation timestamp"
    )
    updated_at: Optional[datetime.datetime] = Field(
        default=None,
        sa_column=Column("updated_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        description="Last update timestamp"
    )
