"""
Encryption utilities for end-to-end encryption of sensitive data.
Uses Fernet symmetric encryption with keys derived from wallet addresses.
"""
import json
import hashlib
import base64
from typing import Dict, Any, Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

from config import settings


def _get_encryption_salt() -> bytes:
    """Get a salt for key derivation. Uses SECRET_KEY or OPENAI_API_KEY as salt."""
    secret = getattr(settings, "SECRET_KEY", None) or settings.OPENAI_API_KEY
    # Use first 16 bytes of SHA256 hash as salt
    return hashlib.sha256(secret.encode()).digest()[:16]


def _derive_encryption_key(wallet_address: str) -> bytes:
    """
    Derive a Fernet encryption key from wallet address.
    Uses PBKDF2 with the wallet address and server secret salt.
    """
    wallet = wallet_address.lower().encode()
    salt = _get_encryption_salt()
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
        backend=default_backend()
    )
    key = base64.urlsafe_b64encode(kdf.derive(wallet))
    return key


def encrypt_tree(tree: Dict[str, Any], wallet_address: str) -> str:
    """
    Encrypt a tree dictionary for a specific wallet.
    Returns base64-encoded encrypted string.
    """
    if not tree:
        return ""
    
    # Convert tree to JSON string
    tree_json = json.dumps(tree, ensure_ascii=False)
    
    # Derive key from wallet address
    key = _derive_encryption_key(wallet_address)
    fernet = Fernet(key)
    
    # Encrypt
    encrypted = fernet.encrypt(tree_json.encode('utf-8'))
    
    # Return as base64 string for storage
    return base64.b64encode(encrypted).decode('ascii')


def decrypt_tree(encrypted_tree: str, wallet_address: str) -> Optional[Dict[str, Any]]:
    """
    Decrypt a tree string for a specific wallet.
    Returns the tree dictionary or None if decryption fails.
    """
    if not encrypted_tree:
        return None
    
    try:
        # Decode from base64
        encrypted_bytes = base64.b64decode(encrypted_tree.encode('ascii'))
        
        # Derive key from wallet address
        key = _derive_encryption_key(wallet_address)
        fernet = Fernet(key)
        
        # Decrypt
        decrypted_bytes = fernet.decrypt(encrypted_bytes)
        tree_json = decrypted_bytes.decode('utf-8')
        
        # Parse JSON
        return json.loads(tree_json)
    except Exception as e:
        # Log error but don't expose details
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to decrypt tree for wallet {wallet_address}: {e}")
        return None