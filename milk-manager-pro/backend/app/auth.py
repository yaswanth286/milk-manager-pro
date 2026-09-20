"""
auth.py
-------
Everything related to logging in securely.

Two separate concerns live here:

1. PASSWORD HASHING
   We never store a customer/user's real password in the database.
   We store a "hash" - a one-way scrambled version. `passlib`'s bcrypt
   algorithm does this. Even if someone steals the database, they can't
   read the real passwords back out.

2. JWT (JSON Web Token)
   After a successful login, the server creates a signed token containing
   the username and an expiry time. The frontend stores this token and
   sends it in the `Authorization: Bearer <token>` header on every
   subsequent request. The server checks the signature to prove the token
   is genuine and hasn't expired - this is what "logs the user in" for
   each API call, without the server having to remember sessions.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

# --- Configuration -----------------------------------------------------
# In production, SECRET_KEY MUST be set via an environment variable and
# kept private. Never commit a real secret key to source control.
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-this-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))  # 12 hours default

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Tells FastAPI's auto-docs (Swagger UI) where the login endpoint is,
# and gives us a reusable "get the token from the request" dependency.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(
        minutes=expires_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """
    This is a FastAPI dependency. Any route that adds
    `current_user: models.User = Depends(get_current_user)` as a parameter
    automatically becomes "protected" - FastAPI will:
      1. Pull the token out of the Authorization header
      2. Decode + verify it
      3. Look up the matching user in the DB
      4. Reject the request with 401 if anything is wrong
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user
