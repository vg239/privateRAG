"""
PrivateRAG Backend API

Privacy-first document intelligence with client-side encryption.
The backend only stores encrypted TOC blobs - it cannot read your data.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import SQLModel
import logging

from config import settings
from database.db_config import engine, format_debug_string, DATABASE_URL
from routers.vaults import router as vaults_router
from routers.chat import router as chat_router

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Create FastAPI app
app = FastAPI(
    title="PrivateRAG API",
    version=settings.APP_VERSION,
    description="""
    Privacy-first document intelligence with client-side encryption
    """,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(vaults_router)
app.include_router(chat_router)

@app.get("/", tags=["root"])
async def root():
    """Root endpoint"""
    return {
        "name": "PrivateRAG API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "description": "Privacy-first document intelligence with client-side encryption"
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
