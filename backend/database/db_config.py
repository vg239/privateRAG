import os
from dotenv import load_dotenv
from config import settings

load_dotenv()


def get_connection_string() -> str:
    """Get the database connection string from environment or settings"""
    db_url = os.getenv("DATABASE_URL") or settings.DATABASE_URL
    
    # Convert postgresql:// to postgres:// for asyncpg
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgres://", 1)
    
    return db_url


def format_debug_string(conn_string: str) -> str:
    """Format connection string for logging (sanitizes sensitive info)"""
    if not conn_string:
        return "No connection string"
    
    # Mask password in connection string
    if "@" in conn_string:
        parts = conn_string.split("@")
        if len(parts) == 2:
            auth_part = parts[0]
            if ":" in auth_part:
                user_pass = auth_part.split(":")
                if len(user_pass) == 2:
                    masked = f"{user_pass[0]}:****@{parts[1]}"
                    return masked
    
    return conn_string

