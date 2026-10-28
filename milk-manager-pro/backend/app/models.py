"""
models.py
---------
This file defines the database TABLES as Python classes (SQLAlchemy ORM).
Each class = one table. Each class attribute = one column.

IMPORTANT DESIGN DECISION (read this - it matters for your business rules):
----------------------------------------------------------------------------
Rule: "Changing a customer's current rate/quantity must not modify old
records" and "Historical bills must remain accurate."

To guarantee this, we NEVER calculate old bills by looking at the
customer's *current* rate. Instead:

1. Every `Delivery` row stores its own `rate_applied` - a snapshot of the
   customer's price-per-litre AT THE TIME that delivery was recorded.
2. Every generated `MonthlyBill` stores its own frozen numbers
   (totals, charges, balances) - a snapshot of the bill AT THE TIME it was
   generated.

So even if you go into Settings tomorrow and change Ramesh's rate from
₹80 to ₹85, every Delivery row and every MonthlyBill row created before
that change keeps its old ₹80 value forever. Only NEW deliveries use the
new rate.
"""

import enum
from datetime import datetime, date

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, DateTime,
    ForeignKey, Enum, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship

from app.database import Base


# ---------------------------------------------------------------------------
# ENUMS - fixed sets of allowed values. Using enums instead of free-text
# strings prevents typos like "Delivered " vs "delivered" from breaking
# reports later.
# ---------------------------------------------------------------------------

class MilkType(str, enum.Enum):
    BUFFALO = "buffalo"
    COW = "cow"


class Shift(str, enum.Enum):
    MORNING = "morning"
    EVENING = "evening"


class DeliveryStatus(str, enum.Enum):
    DELIVERED = "delivered"
    NOT_TAKEN = "not_taken"      # customer chose not to take it that day
    NOT_DELIVERED = "not_delivered"  # scheduled but missed for other reasons
    HOLIDAY = "holiday"          # e.g. milkman's off day


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    OTHER = "other"


class UserRole(str, enum.Enum):
    OWNER = "owner"
    STAFF = "staff"
    CUSTOMER = "customer"


# ---------------------------------------------------------------------------
# USERS - people who can log into the app (you, and later maybe helpers)
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.OWNER, nullable=False)
    is_active = Column(Boolean, default=True)
    # Set only for customer logins — they can see this one customer row.
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="login_user")


# ---------------------------------------------------------------------------
# CUSTOMERS
# ---------------------------------------------------------------------------

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, index=True)
    mobile = Column(String(20), nullable=False, index=True)
    address = Column(Text, nullable=True)

    milk_type = Column(Enum(MilkType), default=MilkType.BUFFALO, nullable=False)
    price_per_litre = Column(Float, nullable=False, default=0.0)

    start_date = Column(Date, default=date.today)

    morning_enabled = Column(Boolean, default=False)
    morning_default_qty = Column(Float, default=0.0)

    evening_enabled = Column(Boolean, default=False)
    evening_default_qty = Column(Float, default=0.0)

    # Balances carried at the customer level.
    # `previous_balance` = balance owed BEFORE this system was started
    #   (i.e. the number you type in once, from your notebook).
    # `advance_amount` = money the customer has pre-paid, reduces what they owe.
    previous_balance = Column(Float, default=0.0)
    advance_amount = Column(Float, default=0.0)

    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    deliveries = relationship("Delivery", back_populates="customer", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="customer", cascade="all, delete-orphan")
    bills = relationship("MonthlyBill", back_populates="customer", cascade="all, delete-orphan")
    login_user = relationship("User", back_populates="customer", uselist=False)


# ---------------------------------------------------------------------------
# DELIVERIES - one row per customer, per date, per shift
# ---------------------------------------------------------------------------

class Delivery(Base):
    __tablename__ = "deliveries"
    __table_args__ = (
        # A customer can only have ONE morning record and ONE evening
        # record per date - prevents accidental duplicate entries.
        UniqueConstraint("customer_id", "date", "shift", name="uq_customer_date_shift"),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    date = Column(Date, nullable=False, index=True)
    shift = Column(Enum(Shift), nullable=False)

    planned_quantity = Column(Float, default=0.0)   # copied from customer default at creation time
    actual_quantity = Column(Float, default=0.0)    # what was really delivered

    status = Column(Enum(DeliveryStatus), default=DeliveryStatus.DELIVERED)

    # extra_quantity is simply max(actual - planned, 0). Stored explicitly
    # (rather than only computed) so reports can query/sum it directly.
    extra_quantity = Column(Float, default=0.0)

    # Snapshot of the customer's rate at the moment of delivery - see the
    # big comment at the top of this file for why this matters.
    rate_applied = Column(Float, nullable=False, default=0.0)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="deliveries")


# ---------------------------------------------------------------------------
# PAYMENTS
# ---------------------------------------------------------------------------

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    date = Column(Date, default=date.today, nullable=False)
    amount = Column(Float, nullable=False)
    method = Column(Enum(PaymentMethod), default=PaymentMethod.CASH)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="payments")


# ---------------------------------------------------------------------------
# MONTHLY BILLS - a frozen snapshot generated at month-end (or on demand)
# ---------------------------------------------------------------------------

class MonthlyBill(Base):
    __tablename__ = "monthly_bills"
    __table_args__ = (
        UniqueConstraint("customer_id", "year", "month", name="uq_customer_year_month"),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1-12

    morning_total = Column(Float, default=0.0)
    evening_total = Column(Float, default=0.0)
    extra_total = Column(Float, default=0.0)
    total_litres = Column(Float, default=0.0)

    rate_applied = Column(Float, default=0.0)  # rate used for this bill (weighted/blended if rate changed mid-month)
    milk_charges = Column(Float, default=0.0)

    opening_balance = Column(Float, default=0.0)
    payments_during_month = Column(Float, default=0.0)
    closing_balance = Column(Float, default=0.0)

    days_delivered = Column(Integer, default=0)
    days_not_taken = Column(Integer, default=0)

    generated_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="bills")
