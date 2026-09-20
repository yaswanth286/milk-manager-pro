"""
routers/reports.py
-------------------
Simple aggregate reports. Built to be easy to extend - add a new function
+ route here whenever you need a new report; the frontend Reports page
already has a place to plug it in.
"""

from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models, auth
from app.database import get_db
from app.routers.customers import compute_current_balance

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/outstanding-balances")
def outstanding_balances_report(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """One row per customer with money still owed (sorted highest first)."""
    customers = db.query(models.Customer).filter(models.Customer.is_active.is_(True)).all()
    rows = []
    for c in customers:
        balance = compute_current_balance(db, c)
        if balance != 0:
            rows.append({"customer_id": c.id, "name": c.name, "mobile": c.mobile, "balance": balance})
    rows.sort(key=lambda r: r["balance"], reverse=True)
    total_outstanding = round(sum(r["balance"] for r in rows if r["balance"] > 0), 2)
    return {"rows": rows, "total_outstanding": total_outstanding}


@router.get("/litres-and-revenue")
def litres_and_revenue_report(
    date_from: date_type = Query(...),
    date_to: date_type = Query(...),
    customer_id: Optional[int] = None,
    shift: Optional[models.Shift] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Total litres sold & revenue earned in a date range - filterable by customer/shift."""
    query = db.query(models.Delivery).filter(
        models.Delivery.date >= date_from,
        models.Delivery.date <= date_to,
    )
    if customer_id:
        query = query.filter(models.Delivery.customer_id == customer_id)
    if shift:
        query = query.filter(models.Delivery.shift == shift)

    deliveries = query.all()
    total_litres = sum(d.actual_quantity for d in deliveries)
    total_revenue = sum(d.actual_quantity * d.rate_applied for d in deliveries)
    total_extra = sum(d.extra_quantity for d in deliveries)
    days_not_taken = sum(1 for d in deliveries if d.status == models.DeliveryStatus.NOT_TAKEN)

    return {
        "date_from": date_from,
        "date_to": date_to,
        "total_litres": round(total_litres, 2),
        "total_extra_litres": round(total_extra, 2),
        "total_revenue": round(total_revenue, 2),
        "total_deliveries_recorded": len(deliveries),
        "days_not_taken": days_not_taken,
    }


@router.get("/payments-summary")
def payments_summary_report(
    date_from: date_type = Query(...),
    date_to: date_type = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Payments received in a date range, broken down by method."""
    payments = (
        db.query(models.Payment)
        .filter(models.Payment.date >= date_from, models.Payment.date <= date_to)
        .all()
    )
    by_method = {}
    for p in payments:
        by_method[p.method.value] = by_method.get(p.method.value, 0.0) + p.amount

    return {
        "date_from": date_from,
        "date_to": date_to,
        "total_collected": round(sum(p.amount for p in payments), 2),
        "by_method": {k: round(v, 2) for k, v in by_method.items()},
        "payment_count": len(payments),
    }


@router.get("/daily")
def daily_report(
    for_date: date_type = Query(default_factory=date_type.today, alias="date"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Full breakdown of a single day, both shifts."""
    deliveries = db.query(models.Delivery).filter(models.Delivery.date == for_date).all()
    result = {"date": for_date, "morning": [], "evening": []}
    for d in deliveries:
        entry = {
            "customer_name": d.customer.name if d.customer else None,
            "quantity": d.actual_quantity,
            "status": d.status.value,
            "extra": d.extra_quantity,
        }
        if d.shift == models.Shift.MORNING:
            result["morning"].append(entry)
        else:
            result["evening"].append(entry)
    return result
