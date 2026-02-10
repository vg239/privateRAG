# Backend Migration Guide

## Generating Database Migrations

To create database migrations for your models, follow these steps:

### 1. Update Models

First, make your changes to `models.py`. Add, modify, or remove model classes as needed.

### 2. Generate Migration

Run the following command to auto-generate a migration file:

```bash
alembic revision --autogenerate -m "your migration message"
```

Replace `"your migration message"` with a descriptive message about what changes you're making (e.g., `"add simple user model"` or `"update post table schema"`).

### 3. Apply Migration

After generating the migration, apply it to your database:

```bash
alembic upgrade head
```

This will execute the migration and update your database schema to match your models.

## Notes

- Make sure your `DATABASE_URL` environment variable is set correctly in your `.env` file
- Review the generated migration file in `alembic/versions/` before applying it
- Always test migrations on a development database first



