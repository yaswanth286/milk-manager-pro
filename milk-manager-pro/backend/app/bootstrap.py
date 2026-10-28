"""
One-time-safe schema tweaks for existing databases, plus backfill of
customer login accounts (mobile number as username + password).
"""

from sqlalchemy import text

from app.database import engine, SessionLocal
from app import models, auth


def ensure_schema():
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id INTEGER"))

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for label in ("CUSTOMER", "customer"):
            try:
                conn.execute(text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{label}'"))
            except Exception:
                try:
                    conn.execute(
                        text(
                            f"""
                            DO $$ BEGIN
                                ALTER TYPE userrole ADD VALUE '{label}';
                            EXCEPTION WHEN duplicate_object THEN NULL;
                            END $$;
                            """
                        )
                    )
                except Exception:
                    pass

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                DO $$ BEGIN
                    ALTER TABLE users
                    ADD CONSTRAINT uq_users_customer_id UNIQUE (customer_id);
                EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
                END $$;
                """
            )
        )
        conn.execute(
            text(
                """
                DO $$ BEGIN
                    ALTER TABLE users
                    ADD CONSTRAINT fk_users_customer_id
                    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$;
                """
            )
        )


def backfill_customer_logins():
    db = SessionLocal()
    try:
        customers = db.query(models.Customer).all()
        for customer in customers:
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
