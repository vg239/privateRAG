"""
Nova SDK Python client — Direct NEAR CLI + Local Encryption.

Bypasses the Nova MCP gateway (which has auth issues) and instead:
1. Encrypts files locally with Fernet (symmetric encryption)
2. Stores encrypted files on local disk
3. Anchors file hash + identifier on NEAR blockchain via `near` CLI
4. Retrieves + decrypts from local disk
"""

import os
import json
import hashlib
import subprocess
import logging
from pathlib import Path

from cryptography.fernet import Fernet

from config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Storage directory
# ---------------------------------------------------------------------------

def _get_storage_dir() -> Path:
    """Return (and create) the encrypted-file storage directory."""
    d = Path(settings.NOVA_STORAGE_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# Encryption helpers (Fernet — AES-128-CBC under the hood, with HMAC)
# ---------------------------------------------------------------------------

def _encrypt_data(data: bytes) -> tuple[bytes, str]:
    """Encrypt *data* with a fresh Fernet key. Returns (ciphertext, key_str)."""
    key = Fernet.generate_key()
    cipher = Fernet(key)
    encrypted = cipher.encrypt(data)
    return encrypted, key.decode()


def _decrypt_data(encrypted: bytes, key_str: str) -> bytes:
    """Decrypt Fernet-encrypted bytes."""
    cipher = Fernet(key_str.encode())
    return cipher.decrypt(encrypted)


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Local persistence (encrypted file + key)
# ---------------------------------------------------------------------------

def _save_encrypted(file_hash: str, encrypted: bytes, key_str: str) -> None:
    """Write encrypted data and its key to the storage directory."""
    d = _get_storage_dir()
    (d / f"{file_hash}.enc").write_bytes(encrypted)
    (d / f"{file_hash}.key").write_text(key_str)
    logger.info("Saved encrypted file: %s.enc (%d bytes)", file_hash, len(encrypted))


def _load_encrypted(file_hash: str) -> tuple[bytes, str]:
    """Read encrypted data and its key from the storage directory."""
    d = _get_storage_dir()
    enc_path = d / f"{file_hash}.enc"
    key_path = d / f"{file_hash}.key"
    if not enc_path.exists() or not key_path.exists():
        raise FileNotFoundError(
            f"Encrypted file or key not found for hash: {file_hash}"
        )
    encrypted = enc_path.read_bytes()
    key_str = key_path.read_text().strip()
    return encrypted, key_str


# ---------------------------------------------------------------------------
# NEAR CLI — anchor on-chain
# ---------------------------------------------------------------------------

async def _anchor_on_near(file_hash: str, ipfs_hash: str) -> dict:
    """
    Call `near contract call-function as-transaction` to record the
    file hash on the Nova contract.  Returns {"tx_id": ..., "explorer_link": ...}.
    """
    contract_id = settings.NOVA_CONTRACT_ID
    group_id = settings.NOVA_GROUP_ID
    signer_id = settings.NOVA_SIGNER_ID

    args = json.dumps({
        "group_id": group_id,
        "user_id": signer_id,
        "file_hash": file_hash,
        "ipfs_hash": ipfs_hash,
    })

    cmd = [
        "near", "contract", "call-function", "as-transaction",
        contract_id, "record_transaction",
        "json-args", args,
        "prepaid-gas", "30 TeraGas",
        "attached-deposit", "0.01 NEAR",
        "sign-as", signer_id,
        "network-config", "testnet",
        "sign-with-keychain", "send",
    ]

    logger.info(
        "Anchoring on NEAR: contract=%s signer=%s file_hash=%s",
        contract_id, signer_id, file_hash,
    )

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    if result.stdout:
        logger.info("NEAR stdout:\n%s", result.stdout)
    if result.stderr:
        logger.warning("NEAR stderr:\n%s", result.stderr)

    if result.returncode != 0:
        raise RuntimeError(
            f"NEAR transaction failed (exit {result.returncode}): "
            f"{result.stderr or result.stdout}"
        )

    # Extract transaction ID and explorer link
    tx_id = ""
    explorer_link = ""
    for line in (result.stdout or "").split("\n"):
        if "Transaction ID:" in line:
            tx_id = line.split("Transaction ID:")[-1].strip()
        if "https://explorer" in line:
            explorer_link = line.strip()

    logger.info("NEAR anchor OK: tx_id=%s explorer=%s", tx_id, explorer_link)

    return {
        "tx_id": tx_id,
        "explorer_link": explorer_link,
    }


# ---------------------------------------------------------------------------
# Public API  (same interface as the old MCP-based version)
# ---------------------------------------------------------------------------

async def nova_register_group(group_id: str) -> str:
    """
    Register a new group on-chain.
    With the direct CLI approach, this is done once manually via the NEAR CLI.
    This function is kept for backward compatibility.
    """
    logger.info(
        "Group registration should be done via NEAR CLI:\n"
        "  near contract call-function as-transaction %s register_group "
        "json-args '{\"group_id\": \"%s\"}' ...",
        settings.NOVA_CONTRACT_ID, group_id,
    )
    return f"Group '{group_id}' — use NEAR CLI to register on {settings.NOVA_CONTRACT_ID}"


async def nova_upload(group_id: str, data: bytes, filename: str) -> dict:
    """
    Upload a file: encrypt locally, store to disk, anchor hash on NEAR.

    Returns dict with keys: cid, trans_id, file_hash
    (cid is the SHA256 file hash used as the storage identifier)
    """
    # Step 1: compute hash of the plaintext
    file_hash = _sha256_hex(data)
    logger.info("nova_upload: filename=%s size=%d hash=%s", filename, len(data), file_hash)

    # Step 2: encrypt and persist
    encrypted, key_str = _encrypt_data(data)
    _save_encrypted(file_hash, encrypted, key_str)

    # Step 3: anchor on NEAR
    try:
        near_result = await _anchor_on_near(file_hash, file_hash)
        trans_id = near_result.get("tx_id", "")
    except Exception as exc:
        logger.error("NEAR anchoring failed (file still saved locally): %s", exc)
        trans_id = f"anchor_failed:{exc}"

    return {
        "cid": file_hash,
        "trans_id": trans_id,
        "file_hash": file_hash,
    }


async def nova_retrieve(group_id: str, cid: str) -> bytes:
    """
    Retrieve and decrypt a file from local encrypted storage.

    `cid` is the SHA256 file hash returned by nova_upload.
    """
    encrypted, key_str = _load_encrypted(cid)
    plaintext = _decrypt_data(encrypted, key_str)
    logger.info("nova_retrieve: cid=%s decrypted %d bytes", cid, len(plaintext))
    return plaintext
