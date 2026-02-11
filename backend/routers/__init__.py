from .auth import router as auth_router
from .users import router as users_router
from .documents import router as documents_router
from .chat import router as chat_router

__all__ = [
    "auth_router",
    "users_router",
    "documents_router",
    "chat_router",
]



