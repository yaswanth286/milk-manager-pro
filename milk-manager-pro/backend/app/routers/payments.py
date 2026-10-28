"""
routers/payments.py
--------------------
Recording money received from customers. Every payment saved here
automatically reduces the customer's outstanding balance because balance
is always computed live (see compute_current_balance in customers.py) as:

    previous_balance - advance_amount + total_milk_charges - total_payments

So there's nothing extra to "update" on the customer row - adding a
Payment row is enough.
"""

from typing import Optional, List
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.get("", response_model=List[schemas.PaymentOut])
def list_payments(
    customer_id: Optional[int] = None,
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if current_user.role == models.UserRole.CUSTOMER:
        customer_id = current_user.customer_id
    query = db.query(models.Payment)
    if customer_id:
        query = query.filter(models.Payment.customer_id == customer_id)
    if date_from:
        query = query.filter(models.Payment.date >= date_from)
    if date_to:
        query = query.filter(models.Payment.date <= date_to)

    payments = query.order_by(models.Payment.date.desc(), models.Payment.id.desc()).all()
    results = []
    for p in payments:
        out = schemas.PaymentOut.model_validate(p)
        out.customer_name = p.customer.name if p.customer else None
        results.append(out)
    return results


@router.post("", response_model=schemas.PaymentOut, status_code=201)
def create_payment(
    payload: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    customer = db.query(models.Customer).filter(models.Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    payment = models.Payment(**payload.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)

    out = schemas.PaymentOut.model_validate(payment)
    out.customer_name = customer.name
    return out


@router.get("/{payment_id}", response_model=schemas.PaymentOut)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    auth.assert_can_view_customer(current_user, payment.customer_id)
    out = schemas.PaymentOut.model_validate(payment)
    out.customer_name = payment.customer.name if payment.customer else None
    return out


@router.delete("/{payment_id}", status_code=204)
def delete_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    db.delete(payment)
    db.commit()
    return None


@router.get("/customer/{customer_id}", response_model=List[schemas.PaymentOut])
def get_customer_payments(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    auth.assert_can_view_customer(current_user, customer_id)
    payments = (
        db.query(models.Payment)
        .filter(models.Payment.customer_id == customer_id)
        .order_by(models.Payment.date.desc())
        .all()
    )
    results = []
    for p in payments:
        out = schemas.PaymentOut.model_validate(p)
        out.customer_name = p.customer.name if p.customer else None
        results.append(out)
    return results
