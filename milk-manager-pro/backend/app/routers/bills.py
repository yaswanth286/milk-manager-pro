"""
routers/bills.py
-----------------
Implements the exact billing formula from the spec:

    Milk Charges   = sum(actual_quantity * rate_applied) for every
                     delivery in that month
                     (rate_applied is the SNAPSHOT stored on each
                     delivery row, so old bills stay correct even if the
                     customer's rate changes later)

    Opening Balance = previous_balance - advance_amount
                       + (all milk charges BEFORE this month)
                       - (all payments BEFORE this month)

    Payments        = payments recorded with a date inside this month

    Closing Balance = Opening Balance + Milk Charges - Payments

Two endpoints:
  GET  /bills/{customer_id}/{year}/{month}  -> calculate LIVE (always
        reflects the latest delivery/payment data - good for "preview").
  POST /bills/generate -> calculates the same way, then SAVES a frozen
        MonthlyBill row as a permanent historical record.
"""

import calendar
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/bills", tags=["Bills"])


def _calculate_bill(db: Session, customer: models.Customer, year: int, month: int) -> schemas.BillOut:
    first_day = date_type(year, month, 1)
    last_day = date_type(year, month, calendar.monthrange(year, month)[1])

    # --- deliveries strictly inside this month ---
    deliveries = (
        db.query(models.Delivery)
        .filter(
            models.Delivery.customer_id == customer.id,
            models.Delivery.date >= first_day,
            models.Delivery.date <= last_day,
        )
        .order_by(models.Delivery.date.asc())
        .all()
    )

    by_date = {}
    morning_total = evening_total = extra_total = milk_charges = 0.0
    days_delivered = days_not_taken = 0

    for d in deliveries:
        row = by_date.setdefault(d.date, {"morning": 0.0, "evening": 0.0, "extra": 0.0,
                                           "status_morning": None, "status_evening": None})
        if d.shift == models.Shift.MORNING:
            row["morning"] = d.actual_quantity
            row["status_morning"] = d.status.value
            morning_total += d.actual_quantity
        else:
            row["evening"] = d.actual_quantity
            row["status_evening"] = d.status.value
            evening_total += d.actual_quantity

        row["extra"] += d.extra_quantity
        extra_total += d.extra_quantity
        milk_charges += d.actual_quantity * d.rate_applied

        if d.status == models.DeliveryStatus.DELIVERED:
            days_delivered += 1
        elif d.status == models.DeliveryStatus.NOT_TAKEN:
            days_not_taken += 1

    daily_rows = [
        schemas.DailyConsumptionRow(
            date=dt,
            morning=v["morning"],
            evening=v["evening"],
            total=round(v["morning"] + v["evening"], 2),
            status_morning=v["status_morning"],
            status_evening=v["status_evening"],
            extra=round(v["extra"], 2),
        )
        for dt, v in sorted(by_date.items())
    ]

    total_litres = morning_total + evening_total

    # --- everything that happened BEFORE this month, for opening balance ---
    charges_before = (
        db.query(func.coalesce(func.sum(models.Delivery.actual_quantity * models.Delivery.rate_applied), 0.0))
        .filter(models.Delivery.customer_id == customer.id, models.Delivery.date < first_day)
        .scalar()
    )
    payments_before = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .filter(models.Payment.customer_id == customer.id, models.Payment.date < first_day)
        .scalar()
    )
    opening_balance = customer.previous_balance - customer.advance_amount + charges_before - payments_before

    payments_during_month = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .filter(
            models.Payment.customer_id == customer.id,
            models.Payment.date >= first_day,
            models.Payment.date <= last_day,
        )
        .scalar()
    )

    closing_balance = opening_balance + milk_charges - payments_during_month

    # blended/effective rate for display purposes only (handles mid-month rate changes gracefully)
    effective_rate = round(milk_charges / total_litres, 2) if total_litres > 0 else customer.price_per_litre

    return schemas.BillOut(
        customer_id=customer.id,
        customer_name=customer.name,
        mobile=customer.mobile,
        year=year,
        month=month,
        morning_total=round(morning_total, 2),
        evening_total=round(evening_total, 2),
        extra_total=round(extra_total, 2),
        total_litres=round(total_litres, 2),
        rate_applied=effective_rate,
        milk_charges=round(milk_charges, 2),
        opening_balance=round(opening_balance, 2),
        payments_during_month=round(payments_during_month, 2),
        closing_balance=round(closing_balance, 2),
        days_delivered=days_delivered,
        days_not_taken=days_not_taken,
        daily_rows=daily_rows,
    )


@router.get("/batch/{year}/{month}", response_model=list[schemas.BillOut])
def get_all_bills(
    year: int,
    month: int,
    only_with_activity: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Calculates the bill for EVERY active customer for the given month, in
    one call - this is what powers "print all bills at once".

    `only_with_activity=True` (the default) skips a customer if they had
    zero litres delivered AND zero opening/closing balance that month -
    no point printing a blank slip for someone who wasn't even active
    that month yet. Pass `only_with_activity=false` to always include
    every active customer regardless.
    """
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    customers = (
        db.query(models.Customer)
        .filter(models.Customer.is_active.is_(True))
        .order_by(models.Customer.name.asc())
        .all()
    )

    bills = []
    for customer in customers:
        bill = _calculate_bill(db, customer, year, month)
        if only_with_activity and bill.total_litres == 0 and bill.opening_balance == 0 and bill.closing_balance == 0:
            continue
        bills.append(bill)

    return bills


@router.get("/{customer_id}/{year}/{month}", response_model=schemas.BillOut)
def get_bill(
    customer_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    return _calculate_bill(db, customer, year, month)


@router.post("/generate", response_model=schemas.BillOut)
def generate_bill(
    customer_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Calculates the bill (same logic as GET above) and SAVES it as a
    permanent MonthlyBill snapshot row - useful once a month is "closed"
    and you want a record that won't shift even if old deliveries are
    later edited.
    """
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    bill = _calculate_bill(db, customer, year, month)

    existing = (
        db.query(models.MonthlyBill)
        .filter(models.MonthlyBill.customer_id == customer_id, models.MonthlyBill.year == year, models.MonthlyBill.month == month)
        .first()
    )
    if existing:
        record = existing
    else:
        record = models.MonthlyBill(customer_id=customer_id, year=year, month=month)
        db.add(record)

    record.morning_total = bill.morning_total
    record.evening_total = bill.evening_total
    record.extra_total = bill.extra_total
    record.total_litres = bill.total_litres
    record.rate_applied = bill.rate_applied
    record.milk_charges = bill.milk_charges
    record.opening_balance = bill.opening_balance
    record.payments_during_month = bill.payments_during_month
    record.closing_balance = bill.closing_balance
    record.days_delivered = bill.days_delivered
    record.days_not_taken = bill.days_not_taken

    db.commit()
    return bill


@router.post("/generate-all/{year}/{month}", response_model=list[schemas.BillOut])
def generate_all_bills(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Same as /bills/generate, but for every active customer at once - use at month-end to freeze the whole month's bills in one tap."""
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    customers = db.query(models.Customer).filter(models.Customer.is_active.is_(True)).order_by(models.Customer.name.asc()).all()
    results = []
    for customer in customers:
        bill = _calculate_bill(db, customer, year, month)

        existing = (
            db.query(models.MonthlyBill)
            .filter(models.MonthlyBill.customer_id == customer.id, models.MonthlyBill.year == year, models.MonthlyBill.month == month)
            .first()
        )
        record = existing or models.MonthlyBill(customer_id=customer.id, year=year, month=month)
        if not existing:
            db.add(record)

        record.morning_total = bill.morning_total
        record.evening_total = bill.evening_total
        record.extra_total = bill.extra_total
        record.total_litres = bill.total_litres
        record.rate_applied = bill.rate_applied
        record.milk_charges = bill.milk_charges
        record.opening_balance = bill.opening_balance
        record.payments_during_month = bill.payments_during_month
        record.closing_balance = bill.closing_balance
        record.days_delivered = bill.days_delivered
        record.days_not_taken = bill.days_not_taken

        results.append(bill)

    db.commit()
    return results

