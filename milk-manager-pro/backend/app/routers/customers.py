"""
routers/customers.py
---------------------
Customer CRUD: create, list, search, view, update, archive (soft-delete).

Key changes in v2.0:
- mobile is now optional; empty strings are converted to NULL.
- Every customer gets a unique customer_code (CUS-0001, CUS-0002, …).
- DELETE is replaced by archive (sets is_active=False) to preserve history.
"""

from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/customers", tags=["Customers"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_current_balance(db: Session, customer: models.Customer) -> float:
    """
    Live balance: always recomputed from raw rows so it self-corrects.

        balance = previous_balance - advance_amount
                + Σ(actual_quantity × rate_applied)  [all deliveries]
                - Σ(amount)                          [all payments]
    """
    total_charges = (
        db.query(func.coalesce(func.sum(
            models.Delivery.actual_quantity * models.Delivery.rate_applied
        ), 0.0))
        .filter(models.Delivery.customer_id == customer.id)
        .scalar()
    )
    total_payments = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .filter(models.Payment.customer_id == customer.id)
        .scalar()
    )
    return round(
        customer.previous_balance - customer.advance_amount
        + total_charges - total_payments,
        2,
    )


def _to_customer_out(db: Session, c: models.Customer) -> schemas.CustomerOut:
    out = schemas.CustomerOut.model_validate(c)
    out.current_balance = compute_current_balance(db, c)
    return out


def _next_customer_code(db: Session) -> str:
    """Thread-safe: reads the highest existing code and increments."""
    row = (
        db.query(models.Customer.customer_code)
        .filter(models.Customer.customer_code.isnot(None))
        .order_by(models.Customer.customer_code.desc())
        .first()
    )
    if row and row[0]:
        try:
            num = int(row[0].split("-")[1]) + 1
        except (IndexError, ValueError):
            num = 1
    else:
        num = 1
    return f"CUS-{num:04d}"


def _sanitize_mobile(value: Optional[str]) -> Optional[str]:
    """Convert empty/whitespace-only strings to None."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[schemas.CustomerListItem])
def list_customers(
    search: Optional[str] = Query(None),
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    query = db.query(models.Customer)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                models.Customer.name.ilike(like),
                models.Customer.mobile.ilike(like),
                models.Customer.customer_code.ilike(like),
            )
        )
    if active_only:
        query = query.filter(models.Customer.is_active.is_(True))

    customers = query.order_by(models.Customer.name.asc()).all()
    results = []
    for c in customers:
        item = schemas.CustomerListItem.model_validate(c)
        item.current_balance = compute_current_balance(db, c)
        results.append(item)
    return results


@router.post("", response_model=schemas.CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    data = payload.model_dump()
    data["mobile"] = _sanitize_mobile(data.get("mobile"))

    customer = models.Customer(**data)
    if customer.start_date is None:
        customer.start_date = date.today()

    # Assign unique customer code
    customer.customer_code = _next_customer_code(db)

    db.add(customer)
    db.flush()  # get the id before creating login

    # Only create login if mobile is provided
    if customer.mobile:
        auth.upsert_customer_login(db, customer)

    db.commit()
    db.refresh(customer)
    return _to_customer_out(db, customer)


@router.get("/me", response_model=schemas.CustomerOut)
def get_my_customer(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if current_user.role != models.UserRole.CUSTOMER or not current_user.customer_id:
        raise HTTPException(status_code=403, detail="Not a customer account")
    customer = db.query(models.Customer).filter(
        models.Customer.id == current_user.customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _to_customer_out(db, customer)


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    auth.assert_can_view_customer(current_user, customer_id)
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _to_customer_out(db, customer)


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(
    customer_id: int,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    data = payload.model_dump(exclude_unset=True)

    # Sanitize mobile: empty string → None
    if "mobile" in data:
        data["mobile"] = _sanitize_mobile(data["mobile"])

    for field, value in data.items():
        setattr(customer, field, value)

    # Update login account only if mobile is present
    if customer.mobile:
        auth.upsert_customer_login(db, customer)

    db.commit()
    db.refresh(customer)
    return _to_customer_out(db, customer)


@router.delete("/{customer_id}", status_code=status.HTTP_200_OK)
def archive_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    """
    Soft-delete (archive) a customer.  Sets is_active=False and deactivates
    their login account.  All delivery, payment, and billing history is
    preserved and remains accessible.
    """
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer.is_active = False

    # Deactivate their login account if one exists
    login = db.query(models.User).filter(
        models.User.customer_id == customer_id
    ).first()
    if login:
        login.is_active = False

    db.commit()
    return {"detail": "Customer archived. History is preserved."}


@router.get("/{customer_id}/consumption")
def get_customer_consumption(
    customer_id: int,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Day-by-day Morning/Evening consumption table for a given month."""
    auth.assert_can_view_customer(current_user, customer_id)
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    deliveries = (
        db.query(models.Delivery)
        .filter(
            models.Delivery.customer_id == customer_id,
            func.extract("year", models.Delivery.date) == year,
            func.extract("month", models.Delivery.date) == month,
        )
        .order_by(models.Delivery.date.asc())
        .all()
    )

    by_date = {}
    for d in deliveries:
        row = by_date.setdefault(d.date, {
            "morning": 0.0, "evening": 0.0, "extra": 0.0,
            "status_morning": None, "status_evening": None,
        })
        if d.shift == models.Shift.MORNING:
            row["morning"] = d.actual_quantity
            row["status_morning"] = d.status.value
        else:
            row["evening"] = d.actual_quantity
            row["status_evening"] = d.status.value
        row["extra"] += d.extra_quantity

    daily_rows = [
        {
            "date": dt,
            "morning": v["morning"],
            "evening": v["evening"],
            "total": round(v["morning"] + v["evening"], 2),
            "status_morning": v["status_morning"],
            "status_evening": v["status_evening"],
            "extra": round(v["extra"], 2),
        }
        for dt, v in sorted(by_date.items())
    ]

    total_morning = sum(r["morning"] for r in daily_rows)
    total_evening = sum(r["evening"] for r in daily_rows)
    total_extra = sum(r["extra"] for r in daily_rows)

    # Not-taken days: count distinct calendar dates where every delivery that
    # day had status NOT_TAKEN (i.e. the customer didn't receive anything).
    not_taken_days = sum(
        1 for d in deliveries if d.status == models.DeliveryStatus.NOT_TAKEN
    )

    total_payments = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .filter(models.Payment.customer_id == customer_id)
        .scalar()
    )

    return {
        "customer_id": customer.id,
        "customer_code": customer.customer_code,
        "name": customer.name,
        "year": year,
        "month": month,
        "daily_rows": daily_rows,
        "total_morning_litres": round(total_morning, 2),
        "total_evening_litres": round(total_evening, 2),
        "total_extra_litres": round(total_extra, 2),
        "total_not_taken_days": not_taken_days,
        "total_payments_ever": round(total_payments, 2),
        "current_balance": compute_current_balance(db, customer),
    }
