from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime


# User Schemas
class UserCreate(BaseModel):
    """Schema for creating a new user"""
    wallet_address: str = Field(..., min_length=26, max_length=255, description="Blockchain wallet address")
    username: str = Field(..., min_length=3, max_length=100, description="Unique username")
    password: str = Field(..., min_length=8, description="User password (will be hashed)")
    email: Optional[EmailStr] = Field(None, description="User email address")
    full_name: Optional[str] = Field(None, max_length=255, description="User's full name")
    phone_number: Optional[str] = Field(None, max_length=50, description="User's phone number")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional user metadata")
    
    @field_validator('wallet_address')
    @classmethod
    def validate_wallet_address(cls, v: str) -> str:
        """Basic wallet address validation"""
        if not v.startswith(('0x', '1', '3', 'bc1', 'solana:')):
            # Allow various wallet formats
            pass
        return v.strip()


class UserUpdate(BaseModel):
    """Schema for updating user information"""
    username: Optional[str] = Field(None, min_length=3, max_length=100)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    is_premium: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None


class UserPasswordUpdate(BaseModel):
    """Schema for updating user password"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")


class UserResponse(BaseModel):
    """Schema for user response (excludes sensitive data)"""
    id: int
    wallet_address: str
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: bool
    is_verified: bool
    is_premium: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    """Schema for user login"""
    username: str = Field(..., description="Username or wallet address")
    password: str = Field(..., description="User password")


class UserLoginResponse(BaseModel):
    """Schema for login response"""
    user: UserResponse
    access_token: Optional[str] = None
    message: str = "Login successful"


# Common Schemas
class MessageResponse(BaseModel):
    """Standard message response"""
    message: str
    status: Optional[str] = "success"


class PaginationParams(BaseModel):
    """Pagination parameters"""
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


class MetadataUpdate(BaseModel):
    """Schema for updating only metadata"""
    metadata: Dict[str, Any] = Field(..., description="Updated metadata object")


# Document Schemas
class DocumentResponse(BaseModel):
    """Schema for a PageIndex-indexed document."""

    id: int
    title: str
    file_path: str
    num_pages: Optional[int] = None
    status: str
    tree: Optional[Any] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Wrapper schema for listing documents."""

    total: int
    items: List[DocumentResponse]


class ChatMessage(BaseModel):
    """Single chat message in a conversation."""

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """Chat request scoped to a specific document."""

    document_id: int = Field(..., description="ID of the document to chat over")
    question: str = Field(..., description="User question about the document")
    history: Optional[List[ChatMessage]] = Field(
        default=None,
        description="Optional prior messages for multi-turn chat",
    )


class ChatResponse(BaseModel):
    """Response from the chat endpoint."""

    document_id: int
    answer: str
