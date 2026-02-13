"""
Nova SDK Python client for encrypted IPFS file storage.

Implements the same upload/retrieve flow as the official nova-sdk-js:
1. Authenticate with API key → session token
2. Upload: prepare_upload → client-side AES-256-GCM encrypt → finalize_upload → CID
3. Retrieve: prepare_retrieve → client-side AES-256-GCM decrypt → plaintext bytes
"""

import os
import base64
import hashlib
import time
import logging
from typing import Optional

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Nova infrastructure defaults (mirrors nova-sdk-js/src/index.ts)
# ---------------------------------------------------------------------------
DEFAULT_MCP_URL = "https://nova-mcp.fastmcp.app"
DEFAULT_AUTH_URL_MAINNET = "https://nova-sdk.com"
DEFAULT_AUTH_URL_TESTNET = "https://testnet.nova-sdk.com"

# ---------------------------------------------------------------------------
# Token cache (module-level singleton for the lifetime of the process)
# ---------------------------------------------------------------------------
_token_cache: dict | None = None  # {"token": str, "expires_at": float}


def _get_auth_url() -> str:
    base = getattr(settings, "NOVA_BASE_URL", "") or ""
    if base:
        return base.rstrip("/")
    return DEFAULT_AUTH_URL_TESTNET  # default to testnet


def _get_mcp_url() -> str:
    return getattr(settings, "NOVA_MCP_URL", "") or DEFAULT_MCP_URL


# ---------------------------------------------------------------------------
# AES-256-GCM helpers (same wire-format as the JS SDK)
# Format: IV (12 bytes) || ciphertext || auth-tag (16 bytes)
# ---------------------------------------------------------------------------

def _encrypt_data(data: bytes, key_b64: str) -> str:
    """Encrypt *data* with AES-256-GCM. Returns base64-encoded ciphertext."""
    key = base64.b64decode(key_b64)
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    # AESGCM.encrypt returns ciphertext || tag (16 bytes)
    ct_with_tag = aesgcm.encrypt(iv, data, None)
    # Wire format: IV || ciphertext || tag  (same as JS SDK)
    payload = iv + ct_with_tag
    return base64.b64encode(payload).decode("ascii")


def _decrypt_data(encrypted_b64: str, key_b64: str) -> bytes:
    """Decrypt base64-encoded AES-256-GCM payload. Returns plaintext bytes."""
    raw = base64.b64decode(encrypted_b64)
    key = base64.b64decode(key_b64)
    iv = raw[:12]
    ct_with_tag = raw[12:]  # ciphertext + 16-byte auth tag
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct_with_tag, None)


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Session-token management
# ---------------------------------------------------------------------------

async def _get_session_token() -> str:
    """Get or refresh the Nova session token (JWT)."""
    global _token_cache

    api_key = getattr(settings, "NOVA_API_KEY", "") or ""
    if not api_key:
        raise RuntimeError(
            "NOVA_API_KEY is not configured. "
            "Get one at https://nova-sdk.com or https://testnet.nova-sdk.com"
        )

    account_id = getattr(settings, "NOVA_ACCOUNT_ID", "") or ""
    if not account_id:
        raise RuntimeError(
            "NOVA_ACCOUNT_ID is not configured. "
            "Set it to your NEAR account (e.g. 'alice.nova-sdk.near')."
        )

    # Return cached token if still valid (5 min buffer)
    if _token_cache and _token_cache["expires_at"] > time.time() + 300:
        return _token_cache["token"]

    auth_url = _get_auth_url()
    logger.info("Fetching Nova session token for %s from %s", account_id, auth_url)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{auth_url}/api/auth/session-token",
            json={"account_id": account_id},
            headers={
                "Content-Type": "application/json",
                "X-API-Key": api_key,
            },
        )
        resp.raise_for_status()

    body = resp.json()
    token = body.get("token")
    if not token:
        raise RuntimeError("Nova auth returned no token – account may not exist")

    expires_in_str = body.get("expires_in", "24h")
    expires_seconds = _parse_expiry(expires_in_str)
    _token_cache = {
        "token": token,
        "expires_at": time.time() + expires_seconds,
    }

    logger.info("Nova session token obtained, expires in %s", expires_in_str)
    return token


def _parse_expiry(s: str) -> float:
    """Parse '24h', '30m', '1d' → seconds."""
    import re
    m = re.match(r"^(\d+)([hmd])$", s)
    if not m:
        return 23 * 3600  # fallback 23h
    value, unit = int(m.group(1)), m.group(2)
    if unit == "h":
        return value * 3600
    if unit == "m":
        return value * 60
    if unit == "d":
        return value * 86400
    return 23 * 3600


async def _mcp_headers() -> dict[str, str]:
    token = await _get_session_token()
    account_id = getattr(settings, "NOVA_ACCOUNT_ID", "")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "X-Account-Id": account_id,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def nova_register_group(group_id: str) -> str:
    """
    Register a new group on Nova. Caller becomes the owner.
    Must be called once before uploading to a new group.
    """
    mcp_url = _get_mcp_url()
    headers = await _mcp_headers()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{mcp_url}/tools/register_group",
            json={"group_id": group_id},
            headers=headers,
        )
        if resp.status_code != 200:
            body = resp.text
            logger.error("Nova register_group failed (%d): %s", resp.status_code, body)
            raise RuntimeError(f"Nova register_group failed ({resp.status_code}): {body}")

    result = resp.json()
    msg = result.get("message", f"Group '{group_id}' registered")
    logger.info("Nova group registered: %s", msg)
    return msg


async def nova_upload(group_id: str, data: bytes, filename: str) -> dict:
    """
    Upload a file to Nova (encrypted IPFS).

    Returns dict with keys: cid, trans_id, file_hash
    """
    mcp_url = _get_mcp_url()
    headers = await _mcp_headers()

    # Step 1: prepare_upload → get encryption key + upload_id
    async with httpx.AsyncClient(timeout=60.0) as client:
        prep_resp = await client.post(
            f"{mcp_url}/tools/prepare_upload",
            json={"group_id": group_id, "filename": filename},
            headers=headers,
        )
        if prep_resp.status_code != 200:
            body = prep_resp.text
            logger.error("Nova prepare_upload failed (%d): %s", prep_resp.status_code, body)
            raise RuntimeError(f"Nova prepare_upload failed ({prep_resp.status_code}): {body}")
    prep = prep_resp.json()
    upload_id = prep["upload_id"]
    key_b64 = prep["key"]

    logger.info("Nova prepare_upload OK: upload_id=%s", upload_id)

    # Step 2: encrypt locally (AES-256-GCM)
    encrypted_b64 = _encrypt_data(data, key_b64)
    file_hash = _sha256_hex(data)

    # Step 3: finalize_upload → CID
    async with httpx.AsyncClient(timeout=60.0) as client:
        fin_resp = await client.post(
            f"{mcp_url}/api/finalize-upload",
            json={
                "upload_id": upload_id,
                "encrypted_data": encrypted_b64,
                "file_hash": file_hash,
            },
            headers=headers,
        )
        if fin_resp.status_code != 200:
            body = fin_resp.text
            logger.error("Nova finalize_upload failed (%d): %s", fin_resp.status_code, body)
            raise RuntimeError(f"Nova finalize_upload failed ({fin_resp.status_code}): {body}")
    result = fin_resp.json()

    logger.info("Nova upload complete: cid=%s", result.get("cid"))
    return {
        "cid": result["cid"],
        "trans_id": result.get("trans_id", ""),
        "file_hash": result.get("file_hash", file_hash),
    }


async def nova_retrieve(group_id: str, cid: str) -> bytes:
    """
    Retrieve and decrypt a file from Nova (IPFS).

    Returns the decrypted file bytes.
    """
    mcp_url = _get_mcp_url()
    headers = await _mcp_headers()

    # Step 1: prepare_retrieve → encrypted data + key
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{mcp_url}/tools/prepare_retrieve",
            json={"group_id": group_id, "ipfs_hash": cid},
            headers=headers,
        )
        resp.raise_for_status()

    body = resp.json()
    key_b64 = body["key"]
    encrypted_b64 = body["encrypted_b64"]

    # Step 2: decrypt locally
    plaintext = _decrypt_data(encrypted_b64, key_b64)

    logger.info("Nova retrieve complete: cid=%s, %d bytes", cid, len(plaintext))
    return plaintext
