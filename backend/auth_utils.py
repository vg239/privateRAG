from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from config import settings

security = HTTPBearer()


def _jwt_secret() -> str:
    # Same logic as in routers/auth.py
    return getattr(settings, "SECRET_KEY", None) or settings.OPENAI_API_KEY


def _jwt_algorithm() -> str:
    return "HS256"


async def get_current_wallet(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    token = creds.credentials
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[_jwt_algorithm()])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    wallet = payload.get("sub")
    if not wallet:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return wallet.lower()