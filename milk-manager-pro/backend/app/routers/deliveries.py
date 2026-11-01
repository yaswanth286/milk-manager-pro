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


def _build_shift_view(db: Session, shift: models.Shift, target_date: date_type):
    """
    Return one row per ACTIVE customer for the given shift+date.

    Key rule (requirement §2):
    ALL active customers appear in BOTH morning AND evening sections.
    A customer's regular schedule determines the default (planned) quantity
    for that shift — 0 when not subscribed — but it NEVER hides them from
    a shift or prevents recording a delivery.

    Row shape
    ---------
    is_scheduled  : True if this shift is part of the customer's regular plan.
    planned_quantity : customer's default qty for this shift (0 if not scheduled).
    extra_quantity   : qty delivered above planned_quantity.
    actual_quantity  : planned + extra (what was really handed over).
    """
    customers = (
        db.query(models.Customer)
        .filter(models.Customer.is_active.is_(True))
        .order_by(models.Customer.name.asc())
        .all()
    )

    existing = {
        d.customer_id: d
        for d in db.query(models.Delivery).filter(
            models.Delivery.date == target_date,
            models.Delivery.shift == shift,
        ).all()
    }

    rows = []
    for c in customers:
        # Whether this shift is part of the customer's standing schedule
        is_scheduled = (
            c.morning_enabled if shift == models.Shift.MORNING else c.evening_enabled
        )
        # Regular qty for this shift — 0 when not scheduled
        default_qty = (
            (c.morning_default_qty if shift == models.Shift.MORNING else c.evening_default_qty)
            if is_scheduled else 0.0
        )

        d = existing.get(c.id)
        if d:
            rows.append({
                "delivery_id":     d.id,
                "customer_id":     c.id,
                "customer_name":   c.name,
                "customer_code":   c.customer_code,
                "mobile":          c.mobile,
                "is_scheduled":    is_scheduled,
                "planned_quantity": d.planned_quantity,
                "extra_quantity":  d.extra_quantity,
                "actual_quantity": d.actual_quantity,
                "status":          d.status.value,
                "notes":           d.notes,
                "is_saved":        True,
            })
        else:
            rows.append({
                "delivery_id":     None,
                "customer_id":     c.id,
                "customer_name":   c.name,
                "customer_code":   c.customer_code,
                "mobile":          c.mobile,
                "is_scheduled":    is_scheduled,
                "planned_quantity": default_qty,
                "extra_quantity":  0.0,
                "actual_quantity": default_qty,
                "status":          "pending",
                "notes":           None,
                "is_saved":        False,
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
    Create-or-update a single delivery record.

    planned_quantity = customer's regular qty for the shift (0 when the
    shift is not part of their schedule, e.g. an evening-only customer
    receiving an ad-hoc morning delivery).

    actual_quantity  = planned + extra (the real amount handed over).
    extra_quantity   = actual - planned (floored at 0).

    For NOT_DELIVERED the actual and extra quantities are forced to 0
    so the customer is never charged for milk they did not receive.
    """
    customer = db.query(models.Customer).filter(
        models.Customer.id == payload.customer_id
    ).first()
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

    # Planned qty: use the customer's regular default only when they are
    # subscribed to this shift; otherwise 0 (ad-hoc delivery).
    is_scheduled = (
        customer.morning_enabled
        if payload.shift == models.Shift.MORNING
        else customer.evening_enabled
    )
    planned_qty = (
        (customer.morning_default_qty if payload.shift == models.Shift.MORNING else customer.evening_default_qty)
        if is_scheduled else 0.0
    )

    # NOT_DELIVERED → zero billable quantity
    actual_qty = payload.actual_quantity
    if payload.status == models.DeliveryStatus.NOT_DELIVERED:
        actual_qty = 0.0

    # Keep actual_qty non-negative
    actual_qty = max(actual_qty, 0.0)
    extra_qty = max(actual_qty - planned_qty, 0.0)

    if delivery:
        delivery.actual_quantity = actual_qty
        delivery.extra_quantity  = extra_qty
        delivery.status          = payload.status
        delivery.notes           = payload.notes
        # planned_quantity and rate_applied stay as the original snapshot.
    else:
        delivery = models.Delivery(
            customer_id      = payload.customer_id,
            date             = payload.date,
            shift            = payload.shift,
            planned_quantity = planned_qty,
            actual_quantity  = actual_qty,
            extra_quantity   = extra_qty,
            status           = payload.status,
            rate_applied     = customer.price_per_litre,  # snapshot at creation time
            notes            = payload.notes,
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


@router.post("/repair-rates", tags=["Deliveries"])
def repair_delivery_rates(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_staff),
):
    """
    Fix the ₹0 bill bug.

    When a customer's price_per_litre was ₹0 at the time deliveries were
    recorded, those delivery rows have rate_applied=0.  This endpoint
    updates every such row for the given customer to use the customer's
    *current* price_per_litre, so that the bill recalculates correctly.

    Only delivery rows with rate_applied == 0 are touched.
    Quantity, status, date, and all other fields are left completely
    unchanged.

    Owner/staff only.  Returns a summary of how many rows were fixed.
    """
    customer = db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if customer.price_per_litre <= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Customer's current price_per_litre is ₹{customer.price_per_litre}. "
                "Please set the correct rate on the customer first, then call this endpoint."
            ),
        )

    # Find all deliveries for this customer that have a zero rate snapshot.
    # We only patch rate_applied=0 rows to avoid accidentally overwriting
    # deliveries that legitimately had a different historical rate.
    stale = (
        db.query(models.Delivery)
        .filter(
            models.Delivery.customer_id == customer_id,
            models.Delivery.rate_applied == 0.0,
        )
        .all()
    )

    fixed_count = 0
    for delivery in stale:
        delivery.rate_applied = customer.price_per_litre
        fixed_count += 1

    db.commit()

    return {
        "customer_id": customer_id,
        "customer_name": customer.name,
        "rate_applied": customer.price_per_litre,
        "deliveries_fixed": fixed_count,
        "message": (
            f"Updated {fixed_count} delivery row(s) from ₹0 → "
            f"₹{customer.price_per_litre}/L. "
            "Re-open any finalized bills and regenerate them to reflect the corrected charges."
            if fixed_count > 0
            else "No zero-rate delivery rows found. Nothing to fix."
        ),
    }


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
