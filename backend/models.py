from typing import Optional
import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, text, Index, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    """User model with wallet address, authentication, and detailed metadata"""
    __tablename__ = 'users'
    __table_args__ = (
        Index('idx_users_wallet_address', 'wallet_address'),
        Index('idx_users_username', 'username'),
        Index('idx_users_email', 'email'),
    )
    
    id: int = Field(sa_column=Column('id', Integer, primary_key=True))
    
    # Wallet and Authentication
    wallet_address: str = Field(
        sa_column=Column('wallet_address', String(255), nullable=False, unique=True),
        description="User's blockchain wallet address (e.g., Ethereum, Solana)"
    )
    username: str = Field(
        sa_column=Column('username', String(100), nullable=False, unique=True),
        description="Unique username for the user"
    )
    password_hash: str = Field(
        sa_column=Column('password_hash', String(255), nullable=False),
        description="Bcrypt hashed password"
    )
    
    # Personal Information
    email: Optional[str] = Field(
        default=None,
        sa_column=Column('email', String(255), unique=True),
        description="User's email address"
    )
    full_name: Optional[str] = Field(
        default=None,
        sa_column=Column('full_name', String(255)),
        description="User's full name"
    )
    phone_number: Optional[str] = Field(
        default=None,
        sa_column=Column('phone_number', String(50)),
        description="User's phone number"
    )
    
    # Account Status
    is_active: bool = Field(
        default=True,
        sa_column=Column('is_active', Boolean, server_default=text('true')),
        description="Whether the user account is active"
    )
    is_verified: bool = Field(
        default=False,
        sa_column=Column('is_verified', Boolean, server_default=text('false')),
        description="Whether the user has verified their account"
    )
    is_premium: bool = Field(
        default=False,
        sa_column=Column('is_premium', Boolean, server_default=text('false')),
        description="Whether the user has premium subscription"
    )
    
    # Timestamps
    created_at: Optional[datetime.datetime] = Field(
        default=None,
        sa_column=Column('created_at', DateTime, server_default=text('CURRENT_TIMESTAMP')),
        description="Account creation timestamp"
    )
    updated_at: Optional[datetime.datetime] = Field(
        default=None,
        sa_column=Column('updated_at', DateTime, server_default=text('CURRENT_TIMESTAMP')),
        description="Last account update timestamp"
    )
    last_login: Optional[datetime.datetime] = Field(
        default=None,
        sa_column=Column('last_login', DateTime),
        description="Last login timestamp"
    )
    
    # Detailed Metadata (JSONB for flexible storage)
    metadata_: Optional[dict] = Field(
        default=None,
        sa_column=Column('metadata', JSONB),
        description="""Detailed user metadata stored as JSON. Can include:
        - profile: {avatar_url, bio, location, website, social_links}
        - preferences: {theme, language, notifications, privacy_settings}
        - wallet_info: {wallet_type, network, verified_chains, nft_collections}
        - subscription: {plan_type, start_date, end_date, features}
        - activity: {total_logins, last_activity, favorite_features}
        - security: {two_factor_enabled, backup_codes, security_questions}
        - analytics: {usage_stats, feature_usage, engagement_metrics}
        - custom_fields: {any additional custom data}
        """
    )
