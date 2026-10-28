"""
routers/deliveries.py
----------------------
This powers the most-used screens in the whole app: Morning Delivery and
Evening Delivery.

Key idea - "virtual pending rows":
For a given shift + date, we start from the list of ACTIVE customers who
are subscribed to that shift (e.g. morning_enabled=True). For each one we
look for an existing Delivery row for that exact date+shift.
  - If it exists -> show its real status/quantity.
  - If it doesn't exist yet -> show it as "pending" using the customer's
    default quantity, WITHOUT creating a database row. A row is only
    created once you actually tap Delivered / Not Taken and Save.

This means browsing the Morning screen never creates junk data, and any
day you didn't open the app simply has no rows (not a bunch of fake
"not delivered" entries).
"""

from datetime import date as date_type
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/deliveries", tags=["Deliveries"])


def _shift_customers_query(db: Session, shift: models.Shift):
    col = models.Customer.morning_enabled if shift == models.Shift.MORNING else models.Customer.evening_enabled
    return db.query(models.Customer).filter(col.is_(True), models.Customer.is_active.is_(True))


def _build_shift_view(db: Session, shift: models.Shift, target_date: date_type):
    customers = _shift_customers_query(db, shift).order_by(models.Customer.name.asc()).all()

    existing = {
        d.customer_id: d
        for d in db.query(models.Delivery).filter(
            models.Delivery.date == target_date, models.Delivery.shift == shift
        ).all()
    }

    rows = []
    for c in customers:
        default_qty = c.morning_default_qty if shift == models.Shift.MORNING else c.evening_default_qty
        d = existing.get(c.id)
        if d:
            rows.append({
                "delivery_id": d.id,
                "customer_id": c.id,
                "customer_name": c.name,
                "mobile": c.mobile,
                "planned_quantity": d.planned_quantity,
                "actual_quantity": d.actual_quantity,
                "extra_quantity": d.extra_quantity,
                "status": d.status.value,
                "notes": d.notes,
                "is_saved": True,
            })
        else:
            rows.append({
                "delivery_id": None,
                "customer_id": c.id,
                "customer_name": c.name,
                "mobile": c.mobile,
                "planned_quantity": default_qty,
                "actual_quantity": default_qty,
                "extra_quantity": 0.0,
                "status": "pending",  # not yet marked today
                "notes": None,
                "is_saved": False,
            })
    return rows


@router.get("/morning")
def get_morning_deliveries(
    for_date: date_type = Query(default_factory=date_type.today, alias="date"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    return {"date": for_date, "shift": "morning", "rows": _build_shift_view(db, models.Shift.MORNING, for_date)}


@router.get("/evening")
def get_evening_deliveries(
    for_date: date_type = Query(default_factory=date_type.today, alias="date"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    return {"date": for_date, "shift": "evening", "rows": _build_shift_view(db, models.Shift.EVENING, for_date)}


@router.post("/mark", response_model=schemas.DeliveryOut)
def mark_delivery(
    payload: schemas.DeliveryMarkRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    """
    Create-or-update a single delivery record. This is what fires every
    time you tap "Save" on a customer row in the Morning/Evening screen.
    """
    customer = db.query(models.Customer).filter(models.Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    delivery = (
        db.query(models.Delivery)
        .filter(
            models.Delivery.customer_id == payload.customer_id,
            models.Delivery.date == payload.date,
            models.Delivery.shift == payload.shift,
        )
        .first()
    )

    planned_qty = (
        customer.morning_default_qty if payload.shift == models.Shift.MORNING else customer.evening_default_qty
    )

    # "Not taken" / "not delivered" / "holiday" -> zero out actual quantity,
    # so the customer is never charged for milk they didn't get.
    actual_qty = payload.actual_quantity
    if payload.status in (models.DeliveryStatus.NOT_TAKEN, models.DeliveryStatus.NOT_DELIVERED, models.DeliveryStatus.HOLIDAY):
        actual_qty = 0.0

    extra_qty = max(actual_qty - planned_qty, 0.0)

    if delivery:
        delivery.actual_quantity = actual_qty
        delivery.status = payload.status
        delivery.extra_quantity = extra_qty
        delivery.notes = payload.notes
        # planned_quantity and rate_applied are NOT changed on update -
        # they stay as the historical snapshot from when first created.
    else:
        delivery = models.Delivery(
            customer_id=payload.customer_id,
            date=payload.date,
            shift=payload.shift,
            planned_quantity=planned_qty,
            actual_quantity=actual_qty,
            extra_quantity=extra_qty,
            status=payload.status,
            rate_applied=customer.price_per_litre,  # snapshot at creation time
            notes=payload.notes,
        )
        db.add(delivery)

    db.commit()
    db.refresh(delivery)

    out = schemas.DeliveryOut.model_validate(delivery)
    out.customer_name = customer.name
    return out


@router.get("", response_model=List[schemas.DeliveryOut])
def list_deliveries(
    customer_id: Optional[int] = None,
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    shift: Optional[models.Shift] = None,
    status_filter: Optional[models.DeliveryStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    query = db.query(models.Delivery)
    if customer_id:
        query = query.filter(models.Delivery.customer_id == customer_id)
    if date_from:
        query = query.filter(models.Delivery.date >= date_from)
    if date_to:
        query = query.filter(models.Delivery.date <= date_to)
    if shift:
        query = query.filter(models.Delivery.shift == shift)
    if status_filter:
        query = query.filter(models.Delivery.status == status_filter)

    deliveries = query.order_by(models.Delivery.date.desc()).limit(1000).all()
    results = []
    for d in deliveries:
        out = schemas.DeliveryOut.model_validate(d)
        out.customer_name = d.customer.name if d.customer else None
        results.append(out)
    return results


@router.post("", response_model=schemas.DeliveryOut, status_code=201)
def create_delivery(
    payload: schemas.DeliveryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    customer = db.query(models.Customer).filter(models.Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    existing = db.query(models.Delivery).filter(
        models.Delivery.customer_id == payload.customer_id,
        models.Delivery.date == payload.date,
        models.Delivery.shift == payload.shift,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A delivery record already exists for this customer/date/shift")

    extra_qty = max(payload.actual_quantity - payload.planned_quantity, 0.0)
    delivery = models.Delivery(
        **payload.model_dump(),
        extra_quantity=extra_qty,
        rate_applied=customer.price_per_litre,
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    out = schemas.DeliveryOut.model_validate(delivery)
    out.customer_name = customer.name
    return out


@router.put("/{delivery_id}", response_model=schemas.DeliveryOut)
def update_delivery(
    delivery_id: int,
    payload: schemas.DeliveryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    delivery = db.query(models.Delivery).filter(models.Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    data = payload.model_dump(exclude_unset=True)
    if "actual_quantity" in data:
        delivery.actual_quantity = data["actual_quantity"]
        delivery.extra_quantity = max(delivery.actual_quantity - delivery.planned_quantity, 0.0)
    if "status" in data:
        delivery.status = data["status"]
        if delivery.status in (models.DeliveryStatus.NOT_TAKEN, models.DeliveryStatus.NOT_DELIVERED, models.DeliveryStatus.HOLIDAY):
            delivery.actual_quantity = 0.0
            delivery.extra_quantity = 0.0
    if "notes" in data:
        delivery.notes = data["notes"]

    db.commit()
    db.refresh(delivery)
    out = schemas.DeliveryOut.model_validate(delivery)
    out.customer_name = delivery.customer.name if delivery.customer else None
    return out
