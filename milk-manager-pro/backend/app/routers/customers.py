"""
routers/customers.py
---------------------
Everything about managing customers: create, list, search, view details,
update, delete, and view their full consumption (delivery) history.

All routes here require a valid JWT (see `Depends(auth.get_current_user)`).
"""

from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/customers", tags=["Customers"])


def compute_current_balance(db: Session, customer: models.Customer) -> float:
    """
    The single source of truth for "how much does this customer owe me
    right now". Deliberately recomputed from raw data every time (not
    stored) so it's always accurate and self-correcting:

        current_balance =
            previous_balance (carried in from notebook)
          - advance_amount   (money already paid ahead of time)
          + total milk charges ever delivered (actual_quantity * rate_applied)
          - total payments ever made
    """
    total_charges = (
        db.query(func.coalesce(func.sum(models.Delivery.actual_quantity * models.Delivery.rate_applied), 0.0))
        .filter(models.Delivery.customer_id == customer.id)
        .scalar()
    )
    total_payments = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .filter(models.Payment.customer_id == customer.id)
        .scalar()
    )
    return round(
        customer.previous_balance - customer.advance_amount + total_charges - total_payments,
        2,
    )


def _to_customer_out(db: Session, c: models.Customer) -> schemas.CustomerOut:
    out = schemas.CustomerOut.model_validate(c)
    out.current_balance = compute_current_balance(db, c)
    return out


@router.get("", response_model=List[schemas.CustomerListItem])
def list_customers(
    search: Optional[str] = Query(None, description="Search by name or mobile number"),
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = db.query(models.Customer)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(models.Customer.name.ilike(like), models.Customer.mobile.ilike(like)))
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
    current_user: models.User = Depends(auth.get_current_user),
):
    customer = models.Customer(**payload.model_dump())
    if customer.start_date is None:
        customer.start_date = date.today()
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _to_customer_out(db, customer)


@router.get("/{customer_id}", response_model=schemas.CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _to_customer_out(db, customer)


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(
    customer_id: int,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Only update fields the client actually sent (exclude_unset=True).
    # NOTE: changing price_per_litre or default quantities here does NOT
    # touch any existing Delivery rows - those keep their own snapshot
    # values (rate_applied / planned_quantity), preserving history.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)
    return _to_customer_out(db, customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return None


@router.get("/{customer_id}/consumption")
def get_customer_consumption(
    customer_id: int,
    year: int = Query(..., description="e.g. 2026"),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Returns the day-by-day Morning/Evening/Status/Extra table used on the
    Customer Details page, for a given month, plus rolled-up totals.
    """
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
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
        row = by_date.setdefault(d.date, {"morning": 0.0, "evening": 0.0, "extra": 0.0,
                                           "status_morning": None, "status_evening": None})
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
        "customer_name": customer.name,
        "mobile": customer.mobile,
        "milk_type": customer.milk_type,
        "rate": customer.price_per_litre,
        "start_date": customer.start_date,
        "morning_qty": customer.morning_default_qty,
        "evening_qty": customer.evening_default_qty,
        "previous_balance": customer.previous_balance,
        "current_balance": compute_current_balance(db, customer),
        "year": year,
        "month": month,
        "daily_rows": daily_rows,
        "total_morning_litres": round(total_morning, 2),
        "total_evening_litres": round(total_evening, 2),
        "total_litres": round(total_morning + total_evening, 2),
        "total_extra_litres": round(total_extra, 2),
        "total_not_taken_days": not_taken_days,
        "total_payments": round(total_payments, 2),
    }
