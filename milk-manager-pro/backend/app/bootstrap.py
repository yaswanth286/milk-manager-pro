"""
bootstrap.py
-------------
Safe, idempotent schema migrations and data backfills that run at every
startup. Nothing here drops data or fails on re-run.

Order matters:
1. ensure_schema()   — adds new columns / constraints that don't exist yet.
2. backfill_customer_codes() — fills customer_code for existing customers.
3. backfill_customer_logins() — creates login accounts for customers w/ mobile.
"""

from sqlalchemy import text

from app.database import engine, SessionLocal
from app import models, auth


def ensure_schema():
    """Add any new columns / types / constraints that the current code expects
    but that may not exist in older database instances."""
    with engine.begin() as conn:
        # --- users table ---
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id INTEGER"
        ))

        # --- customers table ---
        # Make mobile nullable (was NOT NULL in the original schema)
        conn.execute(text(
            "ALTER TABLE customers ALTER COLUMN mobile DROP NOT NULL"
        ))
        # Add customer_code column (unique human-readable ID like CUS-0001)
        conn.execute(text(
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_code VARCHAR(20)"
        ))

        # --- monthly_bills table ---
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE billstatus AS ENUM ('draft', 'finalized', 'reopened');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))
        conn.execute(text(
            "ALTER TABLE monthly_bills ADD COLUMN IF NOT EXISTS status billstatus NOT NULL DEFAULT 'draft'"
        ))
        conn.execute(text(
            "ALTER TABLE monthly_bills ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP"
        ))
        conn.execute(text(
            "ALTER TABLE monthly_bills ADD COLUMN IF NOT EXISTS reopen_reason TEXT"
        ))

    # UNIQUE index on customer_code (non-null values only)
    with engine.begin() as conn:
        conn.execute(text("""
            DO $$ BEGIN
                CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_customer_code
                ON customers (customer_code)
                WHERE customer_code IS NOT NULL;
            EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
            END $$;
        """))

    # UserRole enum backfill
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for label in ("CUSTOMER", "customer"):
            try:
                conn.execute(text(
                    f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{label}'"
                ))
            except Exception:
                try:
                    conn.execute(text(f"""
                        DO $$ BEGIN
                            ALTER TYPE userrole ADD VALUE '{label}';
                        EXCEPTION WHEN duplicate_object THEN NULL;
                        END $$;
                    """))
                except Exception:
                    pass

    # Foreign-key + unique constraint on users.customer_id
    with engine.begin() as conn:
        conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE users
                ADD CONSTRAINT uq_users_customer_id UNIQUE (customer_id);
            EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
            END $$;
        """))
        conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE users
                ADD CONSTRAINT fk_users_customer_id
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))


def _next_customer_code(db) -> str:
    """Return the next CUS-XXXX code, reading the highest existing code."""
    row = db.execute(
        text(
            "SELECT customer_code FROM customers "
            "WHERE customer_code IS NOT NULL "
            "ORDER BY customer_code DESC LIMIT 1"
        )
    ).fetchone()
    if row and row[0]:
        try:
            num = int(row[0].split("-")[1]) + 1
        except (IndexError, ValueError):
            num = 1
    else:
        num = 1
    return f"CUS-{num:04d}"


def backfill_customer_codes():
    """Assign CUS-XXXX codes to any existing customers that don't have one."""
    db = SessionLocal()
    try:
        customers = (
            db.query(models.Customer)
            .filter(models.Customer.customer_code.is_(None))
            .order_by(models.Customer.id.asc())
            .all()
        )
        for customer in customers:
            # Re-read next code inside the loop in case of concurrent writers
            code = _next_customer_code(db)
            customer.customer_code = code
            db.flush()
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def backfill_customer_logins():
    """Create login accounts for existing customers that have a mobile number
    and don't have a login yet. Customers without a mobile are skipped."""
    db = SessionLocal()
    try:
        customers = db.query(models.Customer).all()
        for customer in customers:
            # Skip if no mobile provided
            if not customer.mobile:
                continue
            existing = (
                db.query(models.User)
                .filter(models.User.customer_id == customer.id)
                .first()
            )
            if existing:
                continue
            digits = auth.normalize_mobile(customer.mobile)
            if len(digits) < 8:
                continue
            taken = db.query(models.User).filter(models.User.username == digits).first()
            if taken:
                continue
            db.add(
                models.User(
                    username=digits,
                    hashed_password=auth.hash_password(digits),
                    full_name=customer.name,
                    role=models.UserRole.CUSTOMER,
                    customer_id=customer.id,
                    is_active=bool(customer.is_active),
                )
            )
        db.commit()
    finally:
        db.close()
