import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings."""

    DATABASE_URL: str = os.getenv("DATABASE_URL", "")


    APP_NAME: str = "PrivateRAG API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))


settings = Settings()
