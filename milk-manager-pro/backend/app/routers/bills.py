"""
routers/bills.py
-----------------
Monthly billing with proper lifecycle management (v2.0).

Bill lifecycle:
  draft     → bill was generated and can be regenerated freely
  finalized → bill is frozen; GET returns the stored snapshot, not live data
  reopened  → owner explicitly reopened a finalized bill (with a reason)

Formula (unchanged):
  Milk Charges   = Σ(actual_quantity × rate_applied) for deliveries in month
  Opening Balance = previous_balance - advance_amount
                    + Σ charges BEFORE this month
                    - Σ payments BEFORE this month
  Closing Balance = Opening + Milk Charges - Payments during month

Bug fixes in v2.0:
  - days_delivered counts distinct calendar dates (not individual shifts)
  - days_not_taken counts distinct calendar dates where customer took nothing
  - finalized bills are immutable (GET returns snapshot, POST is rejected)
  - reopen endpoint unlocks a finalized bill (owner-only, requires reason)
"""

import calendar
from datetime import date as date_type, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/bills", tags=["Bills"])


# ---------------------------------------------------------------------------
# Core calculation (always live — called for draft/preview)
# ---------------------------------------------------------------------------

def _calculate_bill(
    db: Session, customer: models.Customer, year: int, month: int
) -> schemas.BillOut:
    first_day = date_type(year, month, 1)
    last_day = date_type(year, month, calendar.monthrange(year, month)[1])

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

    # Group by date first, then aggregate per shift
    by_date: dict = {}
    morning_total = evening_total = extra_total = milk_charges = 0.0

    for d in deliveries:
        row = by_date.setdefault(d.date, {
            "morning": 0.0, "evening": 0.0, "extra": 0.0,
            "status_morning": None, "status_evening": None,
            "has_morning": False, "has_evening": False,
        })
        if d.shift == models.Shift.MORNING:
            row["morning"] = d.actual_quantity
            row["status_morning"] = d.status.value
            row["has_morning"] = True
        else:
            row["evening"] = d.actual_quantity
            row["status_evening"] = d.status.value
            row["has_evening"] = True

        row["extra"] += d.extra_quantity
        extra_total += d.extra_quantity
        milk_charges += d.actual_quantity * d.rate_applied

        morning_total += d.actual_quantity if d.shift == models.Shift.MORNING else 0
        evening_total += d.actual_quantity if d.shift == models.Shift.EVENING else 0

    # days_delivered = distinct calendar dates where AT LEAST ONE delivery
    # had status DELIVERED (correct: counts days, not shifts)
    days_delivered = sum(
        1 for dt, v in by_date.items()
        if (v["status_morning"] == "delivered" or v["status_evening"] == "delivered")
    )

    # days_not_taken = distinct calendar dates where ALL recorded deliveries
    # that day had status NOT_TAKEN (customer consciously declined)
    days_not_taken = 0
    for dt, v in by_date.items():
        statuses = []
        if v["has_morning"]:
            statuses.append(v["status_morning"])
        if v["has_evening"]:
            statuses.append(v["status_evening"])
        if statuses and all(s == "not_taken" for s in statuses):
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

    # Opening balance: everything before this month
    charges_before = (
        db.query(func.coalesce(
            func.sum(models.Delivery.actual_quantity * models.Delivery.rate_applied), 0.0
        ))
        .filter(
            models.Delivery.customer_id == customer.id,
            models.Delivery.date < first_day,
        )
        .scalar()
    )
    payments_before = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .filter(
            models.Payment.customer_id == customer.id,
            models.Payment.date < first_day,
        )
        .scalar()
    )
    opening_balance = (
        customer.previous_balance - customer.advance_amount
        + charges_before - payments_before
    )

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

    # Blended effective rate for display only
    effective_rate = (
        round(milk_charges / total_litres, 2) if total_litres > 0
        else customer.price_per_litre
    )

    return schemas.BillOut(
        customer_id=customer.id,
        customer_name=customer.name,
        customer_code=customer.customer_code,
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
        status=None,      # live preview, not from a saved record
        finalized_at=None,
    )


def _bill_from_record(
    db: Session, record: models.MonthlyBill, customer: models.Customer,
    year: int, month: int,
) -> schemas.BillOut:
    """Reconstruct a BillOut from a saved MonthlyBill snapshot (no recalculation)."""
    # We still need the daily_rows — they aren't stored in the snapshot,
    # so we read them from deliveries.  The financial totals come from the
    # frozen snapshot, not from re-summing deliveries.
    first_day = date_type(year, month, 1)
    last_day = date_type(year, month, calendar.monthrange(year, month)[1])

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

    by_date: dict = {}
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

    return schemas.BillOut(
        customer_id=customer.id,
        customer_name=customer.name,
        customer_code=customer.customer_code,
        mobile=customer.mobile,
        year=record.year,
        month=record.month,
        morning_total=record.morning_total,
        evening_total=record.evening_total,
        extra_total=record.extra_total,
        total_litres=record.total_litres,
        rate_applied=record.rate_applied,
        milk_charges=record.milk_charges,
        opening_balance=record.opening_balance,
        payments_during_month=record.payments_during_month,
        closing_balance=record.closing_balance,
        days_delivered=record.days_delivered,
        days_not_taken=record.days_not_taken,
        daily_rows=daily_rows,
        status=record.status.value,
        finalized_at=record.finalized_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/batch/{year}/{month}", response_model=list[schemas.BillOut])
def get_all_bills(
    year: int,
    month: int,
    only_with_activity: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    """
    Returns bills for every active customer.
    - If a finalized/reopened record exists, returns the snapshot.
    - Otherwise calculates live.
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
        record = (
            db.query(models.MonthlyBill)
            .filter(
                models.MonthlyBill.customer_id == customer.id,
                models.MonthlyBill.year == year,
                models.MonthlyBill.month == month,
            )
            .first()
        )
        if record and record.status == models.BillStatus.FINALIZED:
            bill = _bill_from_record(db, record, customer, year, month)
        else:
            bill = _calculate_bill(db, customer, year, month)
            if record:
                bill.status = record.status.value

        if (
            only_with_activity
            and bill.total_litres == 0
            and bill.opening_balance == 0
            and bill.closing_balance == 0
        ):
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
    """
    Retrieve a bill.
    - Finalized bills: returns frozen snapshot (no recalculation).
    - Draft / no record: calculates live.
    """
    auth.assert_can_view_customer(current_user, customer_id)
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    record = (
        db.query(models.MonthlyBill)
        .filter(
            models.MonthlyBill.customer_id == customer_id,
            models.MonthlyBill.year == year,
            models.MonthlyBill.month == month,
        )
        .first()
    )

    if record and record.status == models.BillStatus.FINALIZED:
        return _bill_from_record(db, record, customer, year, month)

    bill = _calculate_bill(db, customer, year, month)
    if record:
        bill.status = record.status.value
    return bill


@router.post("/generate", response_model=schemas.BillOut)
def generate_bill(
    customer_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    """
    Calculate bill and FINALIZE it (save as immutable snapshot).
    Rejected if a FINALIZED bill already exists — use /reopen first.
    """
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    existing = (
        db.query(models.MonthlyBill)
        .filter(
            models.MonthlyBill.customer_id == customer_id,
            models.MonthlyBill.year == year,
            models.MonthlyBill.month == month,
        )
        .first()
    )

    if existing and existing.status == models.BillStatus.FINALIZED:
        raise HTTPException(
            status_code=400,
            detail=(
                "This bill is already finalized and cannot be modified. "
                "Use the reopen endpoint to unlock it first."
            ),
        )

    bill = _calculate_bill(db, customer, year, month)

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
    record.status = models.BillStatus.FINALIZED
    record.finalized_at = datetime.utcnow()

    db.commit()

    bill.status = "finalized"
    bill.finalized_at = record.finalized_at
    return bill


@router.post("/generate-all/{year}/{month}", response_model=list[schemas.BillOut])
def generate_all_bills(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    """Finalize bills for every active customer in one call (skip already-finalized)."""
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    customers = (
        db.query(models.Customer)
        .filter(models.Customer.is_active.is_(True))
        .order_by(models.Customer.name.asc())
        .all()
    )
    results = []
    now = datetime.utcnow()

    for customer in customers:
        existing = (
            db.query(models.MonthlyBill)
            .filter(
                models.MonthlyBill.customer_id == customer.id,
                models.MonthlyBill.year == year,
                models.MonthlyBill.month == month,
            )
            .first()
        )
        # Skip already-finalized bills
        if existing and existing.status == models.BillStatus.FINALIZED:
            results.append(_bill_from_record(db, existing, customer, year, month))
            continue

        bill = _calculate_bill(db, customer, year, month)
        record = existing or models.MonthlyBill(
            customer_id=customer.id, year=year, month=month
        )
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
        record.status = models.BillStatus.FINALIZED
        record.finalized_at = now

        bill.status = "finalized"
        bill.finalized_at = now
        results.append(bill)

    db.commit()
    return results


@router.post("/{customer_id}/{year}/{month}/reopen", response_model=schemas.BillOut)
def reopen_bill(
    customer_id: int,
    year: int,
    month: int,
    payload: schemas.BillReopenRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    """
    Owner-only: unlock a finalized bill so it can be regenerated.
    Requires a reopen reason for audit purposes.
    """
    if current_user.role != models.UserRole.OWNER:
        raise HTTPException(
            status_code=403,
            detail="Only the dairy owner can reopen a finalized bill.",
        )
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A reopen reason is required.")

    record = (
        db.query(models.MonthlyBill)
        .filter(
            models.MonthlyBill.customer_id == customer_id,
            models.MonthlyBill.year == year,
            models.MonthlyBill.month == month,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="No bill found for this customer/month.")
    if record.status != models.BillStatus.FINALIZED:
        raise HTTPException(status_code=400, detail="Only finalized bills can be reopened.")

    record.status = models.BillStatus.REOPENED
    record.reopen_reason = payload.reason.strip()
    db.commit()

    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    bill = _calculate_bill(db, customer, year, month)
    bill.status = "reopened"
    return bill
