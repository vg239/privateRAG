from datetime import datetime, timedelta
import secrets
from typing import Optional

import jwt
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from database.connection import supabase
from database.repositories import UserRepository


router = APIRouter(prefix="/auth", tags=["auth"])


class NonceRequest(BaseModel):
    wallet_address: str


class NonceResponse(BaseModel):
    wallet_address: str
    nonce: str


class VerifyRequest(BaseModel):
    wallet_address: str
    signature: str


class VerifyResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


NONCE_TTL_SECONDS = 300  # 5 minutes


def _nonces_table():
    return supabase.table("nonces")


def _jwt_secret() -> str:
    # For now, reuse OPENAI_API_KEY as a secret if SECRET_KEY is not present.
    # In production, define a dedicated SECRET_KEY env var.
    return getattr(settings, "SECRET_KEY", None) or settings.OPENAI_API_KEY


def _jwt_algorithm() -> str:
    return "HS256"


def _build_login_message(wallet: str, nonce: str) -> str:
    return f"Login to PrivateRAG with wallet {wallet}. Nonce: {nonce}"


@router.post("/nonce", response_model=NonceResponse)
async def create_nonce(body: NonceRequest) -> NonceResponse:
    wallet = body.wallet_address.lower()
    nonce = secrets.token_hex(16)
    expires_at = (datetime.utcnow() + timedelta(seconds=NONCE_TTL_SECONDS)).isoformat()

    # Upsert nonce row keyed by wallet_address
    _nonces_table().upsert(
        {
            "wallet_address": wallet,
            "nonce": nonce,
            "expires_at": expires_at,
        },
        on_conflict="wallet_address",
    ).execute()

    return NonceResponse(wallet_address=wallet, nonce=nonce)


@router.post("/verify", response_model=VerifyResponse)
async def verify_signature(body: VerifyRequest) -> VerifyResponse:
    wallet = body.wallet_address.lower()

    # Load nonce
    resp = _nonces_table().select("*").eq("wallet_address", wallet).single().execute()
    if getattr(resp, "error", None) or not resp.data:
        raise HTTPException(status_code=400, detail="Nonce not found")

    nonce_row = resp.data
    nonce: str = nonce_row.get("nonce") or ""
    expires_raw: Optional[str] = nonce_row.get("expires_at")
    if not nonce or not expires_raw:
        raise HTTPException(status_code=400, detail="Invalid nonce record")

    try:
        expires_at = datetime.fromisoformat(expires_raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid nonce expiry")

    if expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Nonce expired")

    message = _build_login_message(wallet, nonce)
    encoded = encode_defunct(text=message)

    try:
        recovered = Account.recover_message(encoded, signature=body.signature)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if recovered.lower() != wallet:
        raise HTTPException(status_code=400, detail="Signature does not match wallet")

    # Ensure a user exists for this wallet
    existing = await UserRepository.find_by_wallet_address(wallet)
    if not existing:
        await UserRepository.create(
            wallet_address=wallet,
            username=wallet,
            password_hash="",  # not used for wallet-only login
            email=None,
            full_name=None,
            phone_number=None,
            metadata={"auth": "wallet"},
        )

    # Delete nonce after successful verification
    _nonces_table().delete().eq("wallet_address", wallet).execute()

    # Issue JWT
    payload = {
        "sub": wallet,
        "exp": datetime.utcnow() + timedelta(hours=12),
    }
    token = jwt.encode(payload, _jwt_secret(), algorithm=_jwt_algorithm())
    return VerifyResponse(access_token=token)

