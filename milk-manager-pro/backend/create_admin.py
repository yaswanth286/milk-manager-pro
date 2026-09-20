"""
create_admin.py
----------------
There is deliberately NO public "sign up" API endpoint - this is a
single-business tool, not a public app, so registration is done once,
by you, from the command line. This avoids anyone being able to create
accounts by hitting an API.

Usage (from the backend/ folder, with your virtualenv active):

    python create_admin.py

It will ask for a username and password and create (or reset) that user.
"""

import getpass
from app.database import SessionLocal, Base, engine
from app import models, auth

Base.metadata.create_all(bind=engine)


def main():
    db = SessionLocal()
    try:
        username = input("Choose a username: ").strip()
        password = getpass.getpass("Choose a password: ").strip()
        full_name = input("Full name (optional): ").strip() or None

        if not username or not password:
            print("Username and password are required.")
            return

        existing = db.query(models.User).filter(models.User.username == username).first()
        if existing:
            existing.hashed_password = auth.hash_password(password)
            existing.full_name = full_name or existing.full_name
            db.commit()
            print(f"Password updated for existing user '{username}'.")
        else:
            user = models.User(
                username=username,
                hashed_password=auth.hash_password(password),
                full_name=full_name,
                role=models.UserRole.OWNER,
            )
            db.add(user)
            db.commit()
            print(f"User '{username}' created successfully. You can now log in.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
