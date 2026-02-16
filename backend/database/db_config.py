# old asyncpg database connection

import os
from dotenv import load_dotenv
from sqlmodel import create_engine

load_dotenv()


def get_database_url() -> str:
    """Get the database connection string from environment"""
    db_url = os.getenv("DATABASE_URL", "")
    
    if not db_url:
        raise ValueError("DATABASE_URL environment variable is required")
    
    return db_url


def format_debug_string(conn_string: str) -> str:
    """Format connection string for logging (hides password)"""
    if not conn_string:
        return "No connection string"
    
    # Mask password: postgresql://user:pass@host -> postgresql://user:****@host
    if "@" in conn_string and "://" in conn_string:
        try:
            protocol, rest = conn_string.split("://", 1)
            if "@" in rest:
                auth, host = rest.split("@", 1)
                if ":" in auth:
                    user, _ = auth.split(":", 1)
                    return f"{protocol}://{user}:****@{host}"
        except:
            pass
    
    return conn_string[:20] + "..."


# Create SQLModel engine
DATABASE_URL = get_database_url()
engine = create_engine(DATABASE_URL, echo=False)
