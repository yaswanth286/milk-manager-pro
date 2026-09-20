"""
database.py
-----------
Sets up the connection to PostgreSQL using SQLAlchemy.

Beginner note:
- `engine` is the object that actually talks to PostgreSQL.
- `SessionLocal` creates a new "conversation" (session) with the database
  for each API request. We open one, use it, then close it.
- `Base` is the parent class every database model (table) will inherit from.
- `get_db()` is a FastAPI "dependency" - FastAPI calls it automatically for
  any endpoint that asks for a `db` parameter, and makes sure the session
  is closed afterwards, even if an error happens.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# The DATABASE_URL tells SQLAlchemy how to connect to Postgres.
# Format: postgresql://<user>:<password>@<host>:<port>/<database_name>
# We read it from an environment variable so real credentials are never
# hard-coded into the source code (see .env.example).
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://milkuser:milkpass@localhost:5432/milk_manager_pro",
)

# `pool_pre_ping=True` makes SQLAlchemy check the connection is alive
# before using it - avoids random "connection closed" errors.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: gives each request its own DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
