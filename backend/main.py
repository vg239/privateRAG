from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from config import settings
from database.connection import supabase
from routers import auth_router, users_router, documents_router, chat_router

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    logger.info("Starting up application...")
    # For Supabase, client is initialized at import time in database.connection
    try:
        # Simple connectivity check on startup (optional)
        _ = supabase.table("documents").select("id").limit(1).execute()
        logger.info("Supabase client initialized and reachable")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        # You may choose to raise here to prevent app start, but we'll just log
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    # Supabase client does not require explicit shutdown
    try:
        logger.info("Supabase client shutdown complete")
    except Exception as e:
        logger.error(f"Error during Supabase shutdown: {e}")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="A production-grade FastAPI application with repository pattern and asyncpg",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(documents_router)
app.include_router(chat_router)


@app.get("/", tags=["root"])
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs"
    }


@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint"""
    try:
        # Simple Supabase health check
        _ = supabase.table("documents").select("id").limit(1).execute()
        return {
            "status": "healthy",
            "database": "supabase_connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "supabase_disconnected",
            "error": str(e)
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )



