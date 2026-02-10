"""
Minimal AsyncPostgresClient - handles only connection pool management.
All data access logic has been moved to repository classes.
"""
import os
import logging
import asyncio
import asyncpg
import ssl
import contextlib
from .db_config import get_connection_string, format_debug_string

logger = logging.getLogger(__name__)


class AsyncPostgresClient:
    """Minimal client for managing PostgreSQL connection pool only."""
    _instance = None
    _initialization_lock = asyncio.Lock()
    
    def __new__(cls):
        """Singleton pattern implementation"""
        if cls._instance is None:
            cls._instance = super(AsyncPostgresClient, cls).__new__(cls)
            cls._instance.initialized = False
            cls._instance.pool = None
            cls._instance.conn_string = get_connection_string()
        return cls._instance
    
    async def initialize(self):
        """Initialize the database connection pool"""
        if self.initialized:
            logger.info("AsyncPostgresClient already initialized")
            return
        
        # Use lock to prevent multiple initializations in concurrent environments
        async with self._initialization_lock:
            if self.initialized:
                return
            
            # Validate connection string
            if not self.conn_string:
                logger.error("Database connection string is empty. "
                           "Please set DATABASE_URL in your .env file.")
                return
            
            # Log sanitized connection string for debugging
            logger.info(f"AsyncPG connection configured in process {os.getpid()}: {format_debug_string(self.conn_string)}")

            max_retries = 3
            retry_delay = 1

            for attempt in range(max_retries):
                try:
                    ssl_context = ssl.create_default_context()
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE  # For development only

                    # Use asyncpg's built-in pool
                    self.pool = await asyncpg.create_pool(
                        dsn=self.conn_string,
                        min_size=1,
                        max_size=5,
                        statement_cache_size=0  # Disable statement cache to avoid issues with pgbouncer
                    )

                    logger.info(f"AsyncPG connection pool initialized successfully in process {os.getpid()}")
                    self.initialized = True
                    return
                except Exception as e:
                    logger.error(f"Failed to initialize connection pool (attempt {attempt+1}/{max_retries}) for the process {os.getpid()}: {str(e)}")
                    if attempt < max_retries - 1:
                        logger.info(f"Retrying in {retry_delay} seconds...")
                        await asyncio.sleep(retry_delay)
                    else:
                        logger.error(f"All connection attempts failed. Last error: {str(e)}")
            logger.error("Failed to initialize connection pool after all attempts")

    async def close(self):
        """Close the connection pool"""
        if self.pool:
            await self.pool.close()
            self.pool = None
            self.initialized = False
            logger.info("AsyncPG connection pool closed")
    
    @contextlib.asynccontextmanager
    async def get_connection(self):
        """Get a connection from the pool with error handling"""
        
        if not self.initialized:
            await self.initialize()
        
        if not self.pool:
            raise RuntimeError("Database connection pool is not initialized")
        
        try:
            async with self.pool.acquire() as connection:
                yield connection
        except asyncpg.exceptions.PostgresConnectionError as e:
            logger.error(f"Connection error: {str(e)}")
            # Attempt to reinitialize the pool
            await self.close()
            await self.initialize()
            raise
        except Exception as e:
            logger.error(f"Database error: {str(e)}")
            raise


# Create the client instance - actual initialization will happen when initialize() is called
postgres_client = AsyncPostgresClient()
