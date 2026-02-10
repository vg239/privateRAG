import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings:
    """Application settings - minimal configuration for now"""
    
    # Database - will be read from environment variable DATABASE_URL
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # App basics
    APP_NAME: str = "PrivateRAG API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()
