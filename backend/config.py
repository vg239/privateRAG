import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings:
    """Application settings - minimal configuration for now"""
    
    # Database - will be read from environment variable DATABASE_URL
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # OpenAI - used for both direct calls and PageIndex
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv(
        "OPENAI_MODEL",
        "gpt-4o-mini-search-preview-2025-03-11",
    )

    # Document / PageIndex configuration
    # Nova SDK (encrypted IPFS file storage)
    NOVA_API_KEY: str = os.getenv("NOVA_API_KEY", "")
    NOVA_ACCOUNT_ID: str = os.getenv("NOVA_ACCOUNT_ID", "")
    NOVA_GROUP_ID: str = os.getenv("NOVA_GROUP_ID", "")
    NOVA_CONTRACT_ID: str = os.getenv("NOVA_CONTRACT_ID", "nova-sdk-6.testnet")
    NOVA_BASE_URL: str = os.getenv("NOVA_BASE_URL", "https://testnet.nova-sdk.com")
    # Strip any tool-path suffix so we always have just the base MCP URL
    NOVA_MCP_URL: str = os.getenv("NOVA_MCP_URL", "https://nova-mcp.fastmcp.app").split("/tools/")[0]
    # Direct NEAR CLI settings
    NOVA_SIGNER_ID: str = os.getenv("NOVA_SIGNER_ID", "nikhilkottoli.testnet")
    NOVA_STORAGE_DIR: str = os.getenv("NOVA_STORAGE_DIR", "./encrypted_storage")
    # PageIndex tree-generation knobs (match run_pageindex.py defaults)
    PAGEINDEX_TOC_CHECK_PAGES: int = int(os.getenv("PAGEINDEX_TOC_CHECK_PAGES", "20"))
    PAGEINDEX_MAX_PAGES_PER_NODE: int = int(os.getenv("PAGEINDEX_MAX_PAGES_PER_NODE", "10"))
    PAGEINDEX_MAX_TOKENS_PER_NODE: int = int(os.getenv("PAGEINDEX_MAX_TOKENS_PER_NODE", "20000"))
    PAGEINDEX_ADD_NODE_ID: str = os.getenv("PAGEINDEX_ADD_NODE_ID", "yes")
    PAGEINDEX_ADD_NODE_SUMMARY: str = os.getenv("PAGEINDEX_ADD_NODE_SUMMARY", "yes")
    PAGEINDEX_ADD_DOC_DESCRIPTION: str = os.getenv("PAGEINDEX_ADD_DOC_DESCRIPTION", "yes")
    PAGEINDEX_ADD_NODE_TEXT: str = os.getenv("PAGEINDEX_ADD_NODE_TEXT", "no")

    # App basics
    APP_NAME: str = "PrivateRAG API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()

# Ensure PageIndex can see the OpenAI key via its expected environment variable.
# The open-source PageIndex library reads CHATGPT_API_KEY from the environment.
if settings.OPENAI_API_KEY and not os.getenv("CHATGPT_API_KEY"):
    os.environ["CHATGPT_API_KEY"] = settings.OPENAI_API_KEY
