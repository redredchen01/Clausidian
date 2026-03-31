"""Alembic environment configuration for HR Bot Phase 2.

Supports dual database configuration:
- SQLite (development/testing)
- PostgreSQL (production)

Environment variable DATABASE_URL overrides default configuration.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import all models to enable auto-generation of migrations
from recruitment.models import Base

# Read Alembic config
config = context.config

# Setup logging from the config file
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for 'autogenerate' support
target_metadata = Base.metadata


def get_database_url():
    """Get database URL from environment or config.

    Priority:
    1. DATABASE_URL environment variable
    2. SQLite for development (default)
    """
    if "DATABASE_URL" in os.environ:
        return os.environ["DATABASE_URL"]

    # Default to SQLite for development
    db_path = os.path.join(os.path.dirname(__file__), "..", "hr_bot.db")
    return f"sqlite:///{db_path}"


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine.
    Useful for migrations using 'literal_binds' or emit SQL
    to stdout without executing.
    """
    url = get_database_url()

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates an engine and associates a connection with the context.
    """
    url = get_database_url()

    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Enable SQLite compatibility
            render_as_batch=url.startswith("sqlite"),
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
