# PrivateRAG Backend

This folder contains the FastAPI backend API, organized so that **HTTP concerns (routers)** are separated from **data-access concerns (repositories)** and **DB connection management**.

## 📁 What each subfolder does (and why it exists)

- **`routers/`**: All HTTP endpoints live here (FastAPI `APIRouter`s).
  - **How it helps**: Keeps request/response logic, validation, and HTTP errors isolated from database code.
  - **In this repo**: `routers/users.py` implements user-facing endpoints (create/login/read/update/delete).

- **`database/`**: Everything related to talking to PostgreSQL.
  - **How it helps**: Centralizes connection pooling + isolates SQL queries behind repository classes.
  - **Key pieces**:
    - **`database/connection.py`**: `AsyncPostgresClient` singleton that owns the **asyncpg pool** (init/close + `get_connection()` context manager).
    - **`database/db_config.py`**: Builds the DB connection string from env (`DATABASE_URL`) and formats a safe debug version.
    - **`database/repositories/`**: Repository classes that contain the actual SQL queries.
      - **`database/repositories/user_repository.py`**: `UserRepository` for user CRUD, password updates, metadata merge, last-login updates.

- **`alembic/`**: Database migrations (schema change history).
  - **How it helps**: Lets you evolve the database schema safely over time.
  - **What’s inside**:
    - **`alembic/versions/`**: Auto-generated migration scripts (each file = one schema change).
    - **`alembic/env.py`** + **`alembic.ini`**: Alembic runtime configuration.

- **`tests/`**: Backend tests.
  - **How it helps**: Provides a place to validate API/data-layer behavior and prevent regressions.

## 🧩 How the pieces fit together (request → DB → response)

1. A request hits an endpoint in **`routers/`** (e.g. `routers/users.py`).
2. The router validates input using **`schemas.py`** (Pydantic models).
3. The router calls a method on a **repository** in **`database/repositories/`**.
4. The repository gets a connection from **`database/connection.py`** and runs SQL via asyncpg.
5. Results are normalized (e.g. JSON/booleans) and returned back to the router.
6. The router returns a response shaped by **`schemas.py`**.

## 📄 Top-level files (quick purpose)

- **`main.py`**: Creates the FastAPI app, wires CORS, registers routers, and manages app startup/shutdown (DB pool init/close).
- **`config.py`**: App settings loaded from environment (`DATABASE_URL`, `DEBUG`, `HOST`, `PORT`).
- **`schemas.py`**: Request/response contracts (Pydantic) used by routers.
- **`models.py`**: Data model definitions (SQLModel) for the `users` table shape (useful for migrations/typing).
- **`helpers.py`**: Shared utility helpers (formatting, hashing utilities, pagination helpers, etc.).

## 🧹 Non-source folders

- **`__pycache__/`**: Python bytecode cache (generated).
- **`venv/`**: Local virtual environment (generated; should not be committed).
