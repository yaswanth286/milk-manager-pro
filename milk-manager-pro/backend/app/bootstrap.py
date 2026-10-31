
"""
bootstrap.py
-------------
Safe, idempotent schema migrations and data backfills.

Runs during application startup.

Order:
1. ensure_schema() - creates missing columns, enum values,
   indexes and constraints.
2. backfill_customer_codes() - assigns codes to existing customers.
3. backfill_customer_logins() - creates login accounts for
   customers with valid mobile numbers.

No existing tables or customer records are dropped.
"""

from sqlalchemy import text

from app.database import engine, SessionLocal
from app import models, auth


def ensure_schema():
    """
    Add missing schema elements required by the application.
    Safe to run repeatedly.
    """

    # --------------------------------------------------
    # 1. Ensure billstatus enum exists and has all values
    # --------------------------------------------------

    # PostgreSQL enum additions must be committed before
    # using newly added values in another transaction.
    with engine.connect().execution_options(
        isolation_level="AUTOCOMMIT"
    ) as conn:

        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE billstatus AS ENUM (
                    'draft',
                    'finalized',
                    'reopened'
                );
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        """))

        for label in ("draft", "finalized", "reopened"):
            conn.execute(text(
                f"ALTER TYPE billstatus ADD VALUE IF NOT EXISTS '{label}'"
            ))

    # --------------------------------------------------
    # 2. Ensure users and customers columns exist
    # --------------------------------------------------

    with engine.begin() as conn:

        # Users table
        conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS customer_id INTEGER
        """))

        # Customers table
        conn.execute(text("""
            ALTER TABLE customers
            ALTER COLUMN mobile DROP NOT NULL
        """))

        conn.execute(text("""
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS customer_code VARCHAR(20)
        """))

        # --------------------------------------------------
        # 3. Monthly bills table
        # --------------------------------------------------

        conn.execute(text("""
            ALTER TABLE monthly_bills
            ADD COLUMN IF NOT EXISTS status
            billstatus NOT NULL DEFAULT 'draft'
        """))

        conn.execute(text("""
            ALTER TABLE monthly_bills
            ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP
        """))

        conn.execute(text("""
            ALTER TABLE monthly_bills
            ADD COLUMN IF NOT EXISTS reopen_reason TEXT
        """))

    # --------------------------------------------------
    # 4. Customer code unique index
    # --------------------------------------------------

    with engine.begin() as conn:

        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS
            uq_customers_customer_code
            ON customers (customer_code)
            WHERE customer_code IS NOT NULL
        """))

    # --------------------------------------------------
    # 5. UserRole enum backfill
    # --------------------------------------------------

    with engine.connect().execution_options(
        isolation_level="AUTOCOMMIT"
    ) as conn:

        for label in ("CUSTOMER", "customer"):

            try:
                conn.execute(text(
                    f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{label}'"
                ))
            except Exception:
                # Preserve the existing behavior if the enum
                # does not exist or the label is already present.
                pass

    # --------------------------------------------------
    # 6. Foreign key and unique constraint
    # --------------------------------------------------

    with engine.begin() as conn:

        conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE users
                ADD CONSTRAINT uq_users_customer_id
                UNIQUE (customer_id);
            EXCEPTION
                WHEN duplicate_object OR duplicate_table THEN NULL;
            END $$;
        """))

        conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE users
                ADD CONSTRAINT fk_users_customer_id
                FOREIGN KEY (customer_id)
                REFERENCES customers(id)
                ON DELETE CASCADE;
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        """))


def _next_customer_code(db) -> str:
    """
    Generate the next customer code in CUS-XXXX format.
    """

    row = db.execute(
        text("""
            SELECT customer_code
            FROM customers
            WHERE customer_code IS NOT NULL
            ORDER BY customer_code DESC
            LIMIT 1
        """)
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
    """
    Assign customer codes to existing customers
    that do not have a customer_code.
    """

    db = SessionLocal()

    try:
        customers = (
            db.query(models.Customer)
            .filter(models.Customer.customer_code.is_(None))
            .order_by(models.Customer.id.asc())
            .all()
        )

        for customer in customers:
            code = _next_customer_code(db)
            customer.customer_code = code
            db.flush()

        db.commit()

    except Exception as e:
        db.rollback()
        print("Customer code backfill failed:", e)

    finally:
        db.close()


def backfill_customer_logins():
    """
    Create login accounts for existing customers
    who have a valid mobile number and no login yet.
    """

    db = SessionLocal()

    try:
        customers = db.query(models.Customer).all()

        for customer in customers:

            # Skip customers without mobile numbers
            if not customer.mobile:
                continue

            # Check whether customer already has an account
            existing = (
                db.query(models.User)
                .filter(
                    models.User.customer_id == customer.id
                )
                .first()
            )

            if existing:
                continue

            digits = auth.normalize_mobile(customer.mobile)

            if len(digits) < 8:
                continue

            # Avoid duplicate usernames
            taken = (
                db.query(models.User)
                .filter(models.User.username == digits)
                .first()
            )

            if taken:
                continue

            user = models.User(
                username=digits,
                hashed_password=auth.hash_password(digits),
                full_name=customer.name,
                role=models.UserRole.CUSTOMER,
                customer_id=customer.id,
                is_active=bool(customer.is_active),
            )

            db.add(user)

        db.commit()

    except Exception as e:
        db.rollback()
        print("Customer login backfill failed:", e)

    finally:
        db.close()

