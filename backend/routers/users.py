from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from database.repositories import UserRepository
from schemas import (
    UserCreate, UserUpdate, UserResponse, UserLogin, UserLoginResponse,
    UserPasswordUpdate, MetadataUpdate, MessageResponse
)
import bcrypt
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(user: UserCreate):
    """Create a new user"""
    try:
        # Hash the password
        password_hash = hash_password(user.password)
        
        result = await UserRepository.create(
            wallet_address=user.wallet_address,
            username=user.username,
            password_hash=password_hash,
            email=user.email,
            full_name=user.full_name,
            phone_number=user.phone_number,
            metadata=user.metadata
        )
        return UserResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/login", response_model=UserLoginResponse)
async def login_user(credentials: UserLogin):
    """Login user with username/wallet_address and password"""
    try:
        # Try to find user by username or wallet address
        user_data = await UserRepository.find_by_username(credentials.username, include_password=True)
        if not user_data:
            user_data = await UserRepository.find_by_wallet_address(credentials.username, include_password=True)
        
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Verify password
        if not verify_password(credentials.password, user_data['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Check if user is active
        if not user_data.get('is_active', False):
            raise HTTPException(status_code=403, detail="User account is inactive")
        
        # Update last login
        await UserRepository.update_last_login(user_data['id'])
        
        # Remove password_hash from response
        user_response = {k: v for k, v in user_data.items() if k != 'password_hash'}
        
        return UserLoginResponse(
            user=UserResponse(**user_response),
            message="Login successful"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/", response_model=List[UserResponse])
async def get_users(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """Get all users with pagination"""
    try:
        results = await UserRepository.find_all(limit=limit, offset=offset)
        return [UserResponse(**result) for result in results]
    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int):
    """Get user by ID"""
    try:
        result = await UserRepository.find_by_id(user_id)
        if not result:
            raise HTTPException(status_code=404, detail="User not found")
        return UserResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/wallet/{wallet_address}", response_model=UserResponse)
async def get_user_by_wallet(wallet_address: str):
    """Get user by wallet address"""
    try:
        result = await UserRepository.find_by_wallet_address(wallet_address)
        if not result:
            raise HTTPException(status_code=404, detail="User not found")
        # Remove password_hash from response
        result = {k: v for k, v in result.items() if k != 'password_hash'}
        return UserResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, user: UserUpdate):
    """Update user information"""
    try:
        result = await UserRepository.update(
            user_id=user_id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            phone_number=user.phone_number,
            is_active=user.is_active,
            is_verified=user.is_verified,
            is_premium=user.is_premium,
            metadata=user.metadata
        )
        if not result:
            raise HTTPException(status_code=404, detail="User not found")
        return UserResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{user_id}/password", response_model=MessageResponse)
async def update_password(user_id: int, password_data: UserPasswordUpdate):
    """Update user password"""
    try:
        # Get user to verify current password
        user_data = await UserRepository.find_by_id(user_id)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get full user data with password_hash
        full_user = await UserRepository.find_by_username(user_data['username'], include_password=True)
        if not full_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify current password
        if not verify_password(password_data.current_password, full_user['password_hash']):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        
        # Hash new password
        new_password_hash = hash_password(password_data.new_password)
        
        # Update password
        success = await UserRepository.update_password(user_id, new_password_hash)
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        
        return MessageResponse(message="Password updated successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating password: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{user_id}/metadata", response_model=UserResponse)
async def update_metadata(user_id: int, metadata_update: MetadataUpdate):
    """Update user metadata (merges with existing metadata)"""
    try:
        result = await UserRepository.update_metadata(user_id, metadata_update.metadata)
        if not result:
            raise HTTPException(status_code=404, detail="User not found")
        return UserResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating metadata: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(user_id: int):
    """Delete a user"""
    try:
        success = await UserRepository.delete(user_id)
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        return MessageResponse(message="User deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
