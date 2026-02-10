"""
Helper utility functions for the application
"""
import hashlib
import secrets
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


def generate_token(length: int = 32) -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(length)


def hash_string(text: str, algorithm: str = "sha256") -> str:
    """Hash a string using the specified algorithm"""
    hash_obj = hashlib.new(algorithm)
    hash_obj.update(text.encode('utf-8'))
    return hash_obj.hexdigest()


def validate_email(email: str) -> bool:
    """Basic email validation"""
    if not email or "@" not in email:
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    if not parts[0] or not parts[1]:
        return False
    if "." not in parts[1]:
        return False
    return True


def sanitize_string(text: str, max_length: Optional[int] = None) -> str:
    """Sanitize and truncate a string"""
    if not text:
        return ""
    
    # Remove leading/trailing whitespace
    text = text.strip()
    
    # Truncate if max_length is specified
    if max_length and len(text) > max_length:
        text = text[:max_length]
    
    return text


def format_datetime(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime to ISO format string"""
    if dt is None:
        return None
    
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    return dt.isoformat()


def parse_datetime(dt_str: str) -> Optional[datetime]:
    """Parse ISO format datetime string"""
    try:
        return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


def build_response(data: Any, message: Optional[str] = None, status: str = "success") -> Dict[str, Any]:
    """Build a standardized API response"""
    response = {
        "status": status,
        "data": data
    }
    
    if message:
        response["message"] = message
    
    return response


def paginate_query_params(page: int = 1, page_size: int = 100) -> Dict[str, int]:
    """Convert page/page_size to limit/offset"""
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 100
    if page_size > 1000:
        page_size = 1000
    
    offset = (page - 1) * page_size
    return {
        "limit": page_size,
        "offset": offset
    }


def extract_error_message(error: Exception) -> str:
    """Extract a user-friendly error message from an exception"""
    error_str = str(error)
    
    # Handle common database errors
    if "unique constraint" in error_str.lower() or "duplicate key" in error_str.lower():
        return "A record with this value already exists"
    elif "foreign key constraint" in error_str.lower():
        return "Referenced record does not exist"
    elif "not null constraint" in error_str.lower():
        return "Required field is missing"
    
    return error_str or "An error occurred"


def log_error(error: Exception, context: Optional[str] = None):
    """Log an error with context"""
    error_msg = f"Error: {str(error)}"
    if context:
        error_msg = f"{context} - {error_msg}"
    logger.error(error_msg, exc_info=True)




