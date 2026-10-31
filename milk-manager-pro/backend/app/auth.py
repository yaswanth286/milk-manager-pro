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



def normalize_mobile(value: str) -> str:
    """Keep digits only so '98765 43210' and '+91-9876543210' match."""
    if not value:
        return ""
    return "".join(ch for ch in value if ch.isdigit())


def is_staff(user: models.User) -> bool:
    return user.role in (models.UserRole.OWNER, models.UserRole.STAFF)


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


def require_staff(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role == models.UserRole.CUSTOMER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is only available to the dairy owner",
        )
    return current_user


def assert_can_view_customer(user: models.User, customer_id: int) -> None:
    if is_staff(user):
        return
    if user.role != models.UserRole.CUSTOMER or user.customer_id != customer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own records",
        )


def find_login_user(db: Session, identifier: str):
    user = db.query(models.User).filter(models.User.username == identifier).first()
    if user:
        return user
    digits = normalize_mobile(identifier)
    if digits and digits != identifier:
        return db.query(models.User).filter(models.User.username == digits).first()
    return None


def upsert_customer_login(db: Session, customer: models.Customer) -> None:
    """
    Every customer can log in with the mobile number saved on their card.
    Username and password are both that mobile number (digits only).
    """
    digits = normalize_mobile(customer.mobile)
    if len(digits) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid mobile number — customers use it to log in.",
        )

    clash = (
        db.query(models.Customer)
        .filter(models.Customer.id != customer.id)
        .all()
    )
    for other in clash:
        if normalize_mobile(other.mobile) == digits:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another customer already uses this mobile number.",
            )

    user = db.query(models.User).filter(models.User.customer_id == customer.id).first()
    taken = db.query(models.User).filter(models.User.username == digits).first()
    if taken and (not user or taken.id != user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This mobile number is already used as a login.",
        )

    if user:
        user.username = digits
        user.hashed_password = hash_password(digits)
        user.full_name = customer.name
        user.is_active = bool(customer.is_active)
        return

    db.add(
        models.User(
            username=digits,
            hashed_password=hash_password(digits),
            full_name=customer.name,
            role=models.UserRole.CUSTOMER,
            customer_id=customer.id,
            is_active=bool(customer.is_active),
        )
    )
