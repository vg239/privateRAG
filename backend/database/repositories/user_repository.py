"""
User Repository - Repository pattern for user data access using Supabase
"""
import json
from typing import Optional, List, Dict, Any
import logging

from fastapi.concurrency import run_in_threadpool
from fastapi import HTTPException
from postgrest.exceptions import APIError

from database.connection import supabase

logger = logging.getLogger(__name__)


def _normalize_user_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize user result: convert booleans and parse metadata JSON"""
    if not result:
        return result
    
    # Normalize boolean-like values
    for bool_field in ['is_active', 'is_verified', 'is_premium']:
        if bool_field in result and result[bool_field] is not None:
            result[bool_field] = bool(result[bool_field])
    
    # Parse metadata if it's a JSON string
    if 'metadata' in result and result['metadata'] is not None:
        if isinstance(result['metadata'], str):
            try:
                result['metadata'] = json.loads(result['metadata'])
            except (json.JSONDecodeError, TypeError):
                # If parsing fails, leave it as is
                pass
    
    return result


class UserRepository:
    """Repository for user-related database operations via Supabase"""
    
    @staticmethod
    async def create(
        wallet_address: str,
        username: str,
        password_hash: str,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        phone_number: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Create a new user"""
        payload: Dict[str, Any] = {
            "wallet_address": wallet_address,
            "username": username,
            "password_hash": password_hash,
            "email": email,
            "full_name": full_name,
            "phone_number": phone_number,
            "metadata": json.dumps(metadata) if metadata is not None else None,
        }

        def _insert():
            # supabase-py insert returns response.data as a list of rows
            return supabase.table("users").insert(payload).execute()

        response = await run_in_threadpool(_insert)

        if getattr(response, "error", None):
            msg = str(response.error)
            logger.error(f"Error creating user: {msg}")
            # Basic unique constraint inference (Supabase returns message strings)
            if "wallet_address" in msg:
                raise ValueError(f"Wallet address '{wallet_address}' already exists")
            if "username" in msg:
                raise ValueError(f"Username '{username}' already exists")
            if "email" in msg:
                raise ValueError(f"Email '{email}' already exists")
            raise HTTPException(status_code=500, detail="A user with this information already exists")

        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create user (no data returned)")

        return _normalize_user_result(rows[0])
    
    @staticmethod
    async def find_by_id(user_id: int) -> Optional[Dict[str, Any]]:
        """Find user by ID (excludes password_hash by default schema)"""

        def _get():
            return (
                supabase.table("users")
                .select("*")
                .eq("id", user_id)
                .single()
                .execute()
            )

        response = await run_in_threadpool(_get)

        if getattr(response, "error", None):
            logger.error(f"Error finding user by id {user_id}: {response.error}")
            return None

        if not response.data:
            return None

        return _normalize_user_result(response.data)
    
    @staticmethod
    async def find_by_username(username: str, include_password: bool = False) -> Optional[Dict[str, Any]]:
        """Find user by username"""
        def _get():
            return (
                supabase.table("users")
                .select("*")
                .eq("username", username)
                .single()
                .execute()
            )

        response = await run_in_threadpool(_get)

        if getattr(response, "error", None):
            logger.error(f"Error finding user by username {username}: {response.error}")
            return None

        if not response.data:
            return None

        user = _normalize_user_result(response.data)
        if not include_password and "password_hash" in user:
            user.pop("password_hash", None)
        return user
    
    @staticmethod
    async def find_by_wallet_address(wallet_address: str, include_password: bool = False) -> Optional[Dict[str, Any]]:
        """Find user by wallet address"""
        def _get():
            return (
                supabase.table("users")
                .select("*")
                .eq("wallet_address", wallet_address)
                .single()
                .execute()
            )

        try:
            response = await run_in_threadpool(_get)
        except APIError as e:
            # Handle case where no user exists (0 rows)
            if e.code == 'PGRST116':
                return None
            logger.error(
                f"Error finding user by wallet {wallet_address}: {e}"
            )
            return None

        if getattr(response, "error", None):
            logger.error(
                f"Error finding user by wallet {wallet_address}: {response.error}"
            )
            return None

        if not response.data:
            return None

        user = _normalize_user_result(response.data)
        if not include_password and "password_hash" in user:
            user.pop("password_hash", None)
        return user
    
    @staticmethod
    async def find_by_email(email: str) -> Optional[Dict[str, Any]]:
        """Find user by email"""
        def _get():
            return (
                supabase.table("users")
                .select("*")
                .eq("email", email)
                .single()
                .execute()
            )

        response = await run_in_threadpool(_get)

        if getattr(response, "error", None):
            logger.error(f"Error finding user by email {email}: {response.error}")
            return None

        if not response.data:
            return None

        return _normalize_user_result(response.data)
    
    @staticmethod
    async def find_all(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Find all users with pagination (excludes password_hash)"""
        def _list():
            return (
                supabase.table("users")
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

        response = await run_in_threadpool(_list)

        if getattr(response, "error", None):
            logger.error(f"Error listing users: {response.error}")
            return []

        rows = response.data or []
        users = [_normalize_user_result(row) for row in rows]
        for user in users:
            user.pop("password_hash", None)
        return users
    
    @staticmethod
    async def update(
        user_id: int,
        username: Optional[str] = None,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        phone_number: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_verified: Optional[bool] = None,
        is_premium: Optional[bool] = None,
        metadata: Optional[Dict] = None
    ) -> Optional[Dict[str, Any]]:
        """Update user information"""
        updates: Dict[str, Any] = {}

        if username is not None:
            updates["username"] = username
        if email is not None:
            updates["email"] = email
        if full_name is not None:
            updates["full_name"] = full_name
        if phone_number is not None:
            updates["phone_number"] = phone_number
        if is_active is not None:
            updates["is_active"] = is_active
        if is_verified is not None:
            updates["is_verified"] = is_verified
        if is_premium is not None:
            updates["is_premium"] = is_premium
        if metadata is not None:
            updates["metadata"] = json.dumps(metadata) if isinstance(metadata, dict) else metadata

        if not updates:
            return await UserRepository.find_by_id(user_id)

        def _update():
            return supabase.table("users").update(updates).eq("id", user_id).execute()

        response = await run_in_threadpool(_update)

        if getattr(response, "error", None):
            msg = str(response.error)
            logger.error(f"Error updating user {user_id}: {msg}")
            if "username" in msg:
                raise ValueError(f"Username '{username}' already exists")
            if "email" in msg:
                raise ValueError(f"Email '{email}' already exists")
            raise HTTPException(status_code=500, detail="Failed to update user")

        rows = response.data or []
        if not rows:
            return None

        user = _normalize_user_result(rows[0])
        user.pop("password_hash", None)
        return user
    
    @staticmethod
    async def update_password(user_id: int, password_hash: str) -> bool:
        """Update user password"""
        def _update():
            return (
                supabase.table("users")
                .update({"password_hash": password_hash})
                .eq("id", user_id)
                .execute()
            )

        response = await run_in_threadpool(_update)

        if getattr(response, "error", None):
            logger.error(f"Error updating password for user {user_id}: {response.error}")
            return False

        return True
    
    @staticmethod
    async def update_metadata(user_id: int, metadata: Dict) -> Optional[Dict[str, Any]]:
        """Update user metadata (merges with existing metadata)"""
        current_user = await UserRepository.find_by_id(user_id)
        if not current_user:
            return None

        current_meta = current_user.get("metadata") or {}
        if isinstance(current_meta, str):
            try:
                current_meta = json.loads(current_meta)
            except (json.JSONDecodeError, TypeError):
                current_meta = {}

        if isinstance(current_meta, dict) and isinstance(metadata, dict):
            merged_metadata = {**current_meta, **metadata}
        else:
            merged_metadata = metadata

        def _update():
            return (
                supabase.table("users")
                .update({"metadata": json.dumps(merged_metadata)})
                .eq("id", user_id)
                .execute()
            )

        response = await run_in_threadpool(_update)

        if getattr(response, "error", None):
            logger.error(f"Error updating metadata for user {user_id}: {response.error}")
            return None

        rows = response.data or []
        if not rows:
            return None

        user = _normalize_user_result(rows[0])
        user.pop("password_hash", None)
        return user
    
    @staticmethod
    async def update_last_login(user_id: int) -> bool:
        """Update user's last login timestamp"""
        from datetime import datetime

        def _update():
            return (
                supabase.table("users")
                .update({"last_login": datetime.utcnow().isoformat()})
                .eq("id", user_id)
                .execute()
            )

        response = await run_in_threadpool(_update)

        if getattr(response, "error", None):
            logger.error(f"Error updating last_login for user {user_id}: {response.error}")
            return False

        return True
    
    @staticmethod
    async def delete(user_id: int) -> bool:
        """Delete a user"""
        def _delete():
            return supabase.table("users").delete().eq("id", user_id).execute()

        response = await run_in_threadpool(_delete)

        if getattr(response, "error", None):
            logger.error(f"Error deleting user {user_id}: {response.error}")
            return False

        return True

