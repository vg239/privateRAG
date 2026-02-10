"""
User Repository - Repository pattern for user data access
"""
import asyncpg
import json
from typing import Optional, List, Dict, Any
from database.connection import postgres_client
import logging

logger = logging.getLogger(__name__)


def _normalize_user_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize user result: convert booleans and parse metadata JSON"""
    if not result:
        return result
    
    # Normalize boolean values (PostgreSQL might return as integers)
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
    """Repository for user-related database operations"""
    
    @staticmethod
    async def create(
        wallet_address: str,
        username: str,
        password_hash: str,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        phone_number: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create a new user"""
        async with postgres_client.get_connection() as conn:
            try:
                # Convert metadata dict to JSON string for JSONB column
                metadata_json = json.dumps(metadata) if metadata is not None else None
                
                row = await conn.fetchrow(
                    """
                    INSERT INTO users (
                        wallet_address, username, password_hash, email, 
                        full_name, phone_number, metadata, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP)
                    RETURNING 
                        id, wallet_address, username, email, full_name, phone_number,
                        is_active, is_verified, is_premium,
                        created_at, updated_at, last_login, metadata
                    """,
                    wallet_address, username, password_hash, email,
                    full_name, phone_number, metadata_json
                )
                if row:
                    return _normalize_user_result(dict(row))
                return {}
            except asyncpg.UniqueViolationError as e:
                error_msg = str(e)
                if 'wallet_address' in error_msg:
                    raise ValueError(f"Wallet address '{wallet_address}' already exists")
                elif 'username' in error_msg:
                    raise ValueError(f"Username '{username}' already exists")
                elif 'email' in error_msg:
                    raise ValueError(f"Email '{email}' already exists")
                raise ValueError("A user with this information already exists")
            except Exception as e:
                logger.error(f"Error creating user: {e}")
                raise
    
    @staticmethod
    async def find_by_id(user_id: int) -> Optional[Dict[str, Any]]:
        """Find user by ID (excludes password_hash)"""
        async with postgres_client.get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT 
                    id, wallet_address, username, email, full_name, phone_number,
                    is_active, is_verified, is_premium,
                    created_at, updated_at, last_login, metadata
                FROM users 
                WHERE id = $1
                """,
                user_id
            )
            if row:
                return _normalize_user_result(dict(row))
            return None
    
    @staticmethod
    async def find_by_username(username: str, include_password: bool = False) -> Optional[Dict[str, Any]]:
        """Find user by username"""
        async with postgres_client.get_connection() as conn:
            if include_password:
                row = await conn.fetchrow(
                    """
                    SELECT 
                        id, wallet_address, username, password_hash, email, full_name, phone_number,
                        is_active, is_verified, is_premium,
                        created_at, updated_at, last_login, metadata
                    FROM users 
                    WHERE username = $1
                    """,
                    username
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT 
                        id, wallet_address, username, email, full_name, phone_number,
                        is_active, is_verified, is_premium,
                        created_at, updated_at, last_login, metadata
                    FROM users 
                    WHERE username = $1
                    """,
                    username
                )
            if row:
                return _normalize_user_result(dict(row))
            return None
    
    @staticmethod
    async def find_by_wallet_address(wallet_address: str, include_password: bool = False) -> Optional[Dict[str, Any]]:
        """Find user by wallet address"""
        async with postgres_client.get_connection() as conn:
            if include_password:
                row = await conn.fetchrow(
                    """
                    SELECT 
                        id, wallet_address, username, password_hash, email, full_name, phone_number,
                        is_active, is_verified, is_premium,
                        created_at, updated_at, last_login, metadata
                    FROM users 
                    WHERE wallet_address = $1
                    """,
                    wallet_address
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT 
                        id, wallet_address, username, email, full_name, phone_number,
                        is_active, is_verified, is_premium,
                        created_at, updated_at, last_login, metadata
                    FROM users 
                    WHERE wallet_address = $1
                    """,
                    wallet_address
                )
            if row:
                return _normalize_user_result(dict(row))
            return None
    
    @staticmethod
    async def find_by_email(email: str) -> Optional[Dict[str, Any]]:
        """Find user by email"""
        async with postgres_client.get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT 
                    id, wallet_address, username, email, full_name, phone_number,
                    is_active, is_verified, is_premium,
                    created_at, updated_at, last_login, metadata
                FROM users 
                WHERE email = $1
                """,
                email
            )
            if row:
                return _normalize_user_result(dict(row))
            return None
    
    @staticmethod
    async def find_all(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Find all users with pagination (excludes password_hash)"""
        async with postgres_client.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    id, wallet_address, username, email, full_name, phone_number,
                    is_active, is_verified, is_premium,
                    created_at, updated_at, last_login, metadata
                FROM users 
                ORDER BY created_at DESC 
                LIMIT $1 OFFSET $2
                """,
                limit, offset
            )
            return [_normalize_user_result(dict(row)) for row in rows]
    
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
        async with postgres_client.get_connection() as conn:
            updates = []
            values = []
            param_count = 1
            
            if username is not None:
                updates.append(f"username = ${param_count}")
                values.append(username)
                param_count += 1
            
            if email is not None:
                updates.append(f"email = ${param_count}")
                values.append(email)
                param_count += 1
            
            if full_name is not None:
                updates.append(f"full_name = ${param_count}")
                values.append(full_name)
                param_count += 1
            
            if phone_number is not None:
                updates.append(f"phone_number = ${param_count}")
                values.append(phone_number)
                param_count += 1
            
            if is_active is not None:
                updates.append(f"is_active = ${param_count}")
                values.append(is_active)
                param_count += 1
            
            if is_verified is not None:
                updates.append(f"is_verified = ${param_count}")
                values.append(is_verified)
                param_count += 1
            
            if is_premium is not None:
                updates.append(f"is_premium = ${param_count}")
                values.append(is_premium)
                param_count += 1
            
            if metadata is not None:
                # Convert metadata dict to JSON string for JSONB column
                metadata_json = json.dumps(metadata) if isinstance(metadata, dict) else metadata
                updates.append(f"metadata = ${param_count}::jsonb")
                values.append(metadata_json)
                param_count += 1
            
            if not updates:
                return await UserRepository.find_by_id(user_id)
            
            # Always update updated_at
            updates.append("updated_at = CURRENT_TIMESTAMP")
            
            values.append(user_id)
            query = f"""
                UPDATE users 
                SET {', '.join(updates)}
                WHERE id = ${param_count}
                RETURNING 
                    id, wallet_address, username, email, full_name, phone_number,
                    is_active, is_verified, is_premium,
                    created_at, updated_at, last_login, metadata
            """
            
            try:
                row = await conn.fetchrow(query, *values)
                if row:
                    return _normalize_user_result(dict(row))
                return None
            except asyncpg.UniqueViolationError as e:
                error_msg = str(e)
                if 'username' in error_msg:
                    raise ValueError(f"Username '{username}' already exists")
                elif 'email' in error_msg:
                    raise ValueError(f"Email '{email}' already exists")
                raise ValueError("A user with this information already exists")
    
    @staticmethod
    async def update_password(user_id: int, password_hash: str) -> bool:
        """Update user password"""
        async with postgres_client.get_connection() as conn:
            result = await conn.execute(
                """
                UPDATE users 
                SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                """,
                password_hash, user_id
            )
            return result == "UPDATE 1"
    
    @staticmethod
    async def update_metadata(user_id: int, metadata: Dict) -> Optional[Dict[str, Any]]:
        """Update user metadata (merges with existing metadata)"""
        async with postgres_client.get_connection() as conn:
            # Get current metadata
            current = await conn.fetchval(
                "SELECT metadata FROM users WHERE id = $1",
                user_id
            )
            
            # Parse current metadata if it's a JSON string
            if current is None:
                current = {}
            elif isinstance(current, str):
                try:
                    current = json.loads(current)
                except (json.JSONDecodeError, TypeError):
                    current = {}
            
            # Merge metadata
            if isinstance(current, dict) and isinstance(metadata, dict):
                merged_metadata = {**current, **metadata}
            else:
                merged_metadata = metadata
            
            # Convert metadata dict to JSON string for JSONB column
            metadata_json = json.dumps(merged_metadata) if isinstance(merged_metadata, dict) else merged_metadata
            
            row = await conn.fetchrow(
                """
                UPDATE users 
                SET metadata = $1::jsonb, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING 
                    id, wallet_address, username, email, full_name, phone_number,
                    is_active, is_verified, is_premium,
                    created_at, updated_at, last_login, metadata
                """,
                metadata_json, user_id
            )
            if row:
                return _normalize_user_result(dict(row))
            return None
    
    @staticmethod
    async def update_last_login(user_id: int) -> bool:
        """Update user's last login timestamp"""
        async with postgres_client.get_connection() as conn:
            result = await conn.execute(
                """
                UPDATE users 
                SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                """,
                user_id
            )
            return result == "UPDATE 1"
    
    @staticmethod
    async def delete(user_id: int) -> bool:
        """Delete a user"""
        async with postgres_client.get_connection() as conn:
            result = await conn.execute(
                "DELETE FROM users WHERE id = $1",
                user_id
            )
            return result == "DELETE 1"

