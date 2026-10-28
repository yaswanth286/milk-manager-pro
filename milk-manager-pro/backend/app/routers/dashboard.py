"""
routers/dashboard.py
---------------------
Powers the Home/Dashboard screen: today's delivered/not-taken/pending
counts for both shifts, plus a few headline numbers.
"""

from datetime import date as date_type

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models, schemas, auth
from app.database import get_db
from app.routers.deliveries import _build_shift_view

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _summarize(rows) -> schemas.ShiftSummary:
    delivered = sum(1 for r in rows if r["status"] == "delivered")
    not_taken = sum(1 for r in rows if r["status"] in ("not_taken", "not_delivered", "holiday"))
    pending = sum(1 for r in rows if r["status"] == "pending")
    total_litres = sum(r["actual_quantity"] for r in rows if r["status"] == "delivered")
    return schemas.ShiftSummary(
        delivered=delivered, not_taken=not_taken, pending=pending, total_litres=round(total_litres, 2)
    )


@router.get("", response_model=schemas.DashboardOut)
def get_dashboard(
    for_date: date_type = Query(default_factory=date_type.today, alias="date"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    morning_rows = _build_shift_view(db, models.Shift.MORNING, for_date)
    evening_rows = _build_shift_view(db, models.Shift.EVENING, for_date)

    morning_summary = _summarize(morning_rows)
    evening_summary = _summarize(evening_rows)

    active_customers = db.query(func.count(models.Customer.id)).filter(models.Customer.is_active.is_(True)).scalar()

    todays_total_litres = morning_summary.total_litres + evening_summary.total_litres

    todays_collection = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .filter(models.Payment.date == for_date)
        .scalar()
    )

    # Outstanding balance across ALL customers = sum of (previous_balance - advance
    # + all-time milk charges - all-time payments) for every active customer.
    total_previous = db.query(func.coalesce(func.sum(models.Customer.previous_balance), 0.0)).filter(models.Customer.is_active.is_(True)).scalar()
    total_advance = db.query(func.coalesce(func.sum(models.Customer.advance_amount), 0.0)).filter(models.Customer.is_active.is_(True)).scalar()
    total_charges = (
        db.query(func.coalesce(func.sum(models.Delivery.actual_quantity * models.Delivery.rate_applied), 0.0))
        .join(models.Customer, models.Customer.id == models.Delivery.customer_id)
        .filter(models.Customer.is_active.is_(True))
        .scalar()
    )
    total_payments_all_time = (
        db.query(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .join(models.Customer, models.Customer.id == models.Payment.customer_id)
        .filter(models.Customer.is_active.is_(True))
        .scalar()
    )
    outstanding_balance = total_previous - total_advance + total_charges - total_payments_all_time

    return schemas.DashboardOut(
        date=for_date,
        morning=morning_summary,
        evening=evening_summary,
        active_customers=active_customers,
        todays_total_litres=round(todays_total_litres, 2),
        todays_collection=round(todays_collection, 2),
        outstanding_balance=round(outstanding_balance, 2),
    )
