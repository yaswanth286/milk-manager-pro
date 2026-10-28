"""
routers/auth.py
----------------
POST /auth/login  - the only public (unauthenticated) endpoint besides docs.
GET  /auth/me      - returns info about whoever the current token belongs to
                      (handy for the frontend to confirm the token still works).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = auth.find_login_user(db, payload.username.strip())

    password = payload.password
    if user and user.role == models.UserRole.CUSTOMER:
        # Customers log in with their saved mobile number.
        password = auth.normalize_mobile(payload.password) or payload.password

    if not user or not auth.verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    access_token = auth.create_access_token(
        data={
            "sub": user.username,
            "role": user.role.value,
            "customer_id": user.customer_id,
        }
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserOut)
def read_current_user(current_user: models.User = Depends(auth.get_current_user)):
    return current_user
