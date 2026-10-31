"""
schemas.py
----------
Pydantic schemas — shape of data going IN and OUT of the API.

v2.0 changes:
- mobile is Optional everywhere
- customer_code added to all customer schemas
- BillStatus added; BillOut now includes status
- BillReopenRequest added for reopening finalized bills
"""

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

from app.models import MilkType, Shift, DeliveryStatus, PaymentMethod, BillStatus


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    customer_id: Optional[int] = None


# ---------------------------------------------------------------------------
# CUSTOMER
# ---------------------------------------------------------------------------

class CustomerBase(BaseModel):
    name: str
    mobile: Optional[str] = None       # Phone number is OPTIONAL
    address: Optional[str] = None
    milk_type: MilkType = MilkType.BUFFALO
    price_per_litre: float = 0.0
    start_date: Optional[date] = None
    morning_enabled: bool = False
    morning_default_qty: float = 0.0
    evening_enabled: bool = False
    evening_default_qty: float = 0.0
    previous_balance: float = 0.0
    advance_amount: float = 0.0
    is_active: bool = True
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    """All fields optional — only send what you want to change."""
    name: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    milk_type: Optional[MilkType] = None
    price_per_litre: Optional[float] = None
    start_date: Optional[date] = None
    morning_enabled: Optional[bool] = None
    morning_default_qty: Optional[float] = None
    evening_enabled: Optional[bool] = None
    evening_default_qty: Optional[float] = None
    previous_balance: Optional[float] = None
    advance_amount: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CustomerOut(CustomerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_code: Optional[str] = None
    created_at: datetime
    current_balance: Optional[float] = None  # computed by API


class CustomerListItem(BaseModel):
    """Lighter-weight shape used in list/search screens."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_code: Optional[str] = None
    name: str
    mobile: Optional[str] = None
    milk_type: MilkType
    morning_enabled: bool
    evening_enabled: bool
    is_active: bool
    current_balance: Optional[float] = None


# ---------------------------------------------------------------------------
# DELIVERY
# ---------------------------------------------------------------------------

class DeliveryBase(BaseModel):
    customer_id: int
    date: date
    shift: Shift
    planned_quantity: float = 0.0
    actual_quantity: float = 0.0
    status: DeliveryStatus = DeliveryStatus.DELIVERED
    notes: Optional[str] = None


class DeliveryCreate(DeliveryBase):
    pass


class DeliveryUpdate(BaseModel):
    actual_quantity: Optional[float] = None
    status: Optional[DeliveryStatus] = None
    notes: Optional[str] = None


class DeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
    customer_name: Optional[str] = None
    date: date
    shift: Shift
    planned_quantity: float
    actual_quantity: float
    extra_quantity: float
    status: DeliveryStatus
    rate_applied: float
    notes: Optional[str] = None


class DeliveryMarkRequest(BaseModel):
    """Used by the Morning/Evening quick-mark screens."""
    customer_id: int
    date: date
    shift: Shift
    status: DeliveryStatus
    actual_quantity: float
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# PAYMENT
# ---------------------------------------------------------------------------

class PaymentBase(BaseModel):
    customer_id: int
    date: date
    amount: float
    method: PaymentMethod = PaymentMethod.CASH
    notes: Optional[str] = None


class PaymentCreate(PaymentBase):
    pass


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
    customer_name: Optional[str] = None
    date: date
    amount: float
    method: PaymentMethod
    notes: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# BILLS
# ---------------------------------------------------------------------------

class DailyConsumptionRow(BaseModel):
    date: date
    morning: float
    evening: float
    total: float
    status_morning: Optional[str] = None
    status_evening: Optional[str] = None
    extra: float


class BillOut(BaseModel):
    customer_id: int
    customer_name: str
    customer_code: Optional[str] = None
    mobile: Optional[str] = None
    year: int
    month: int
    morning_total: float
    evening_total: float
    extra_total: float
    total_litres: float
    rate_applied: float
    milk_charges: float
    opening_balance: float
    payments_during_month: float
    closing_balance: float
    days_delivered: int
    days_not_taken: int
    daily_rows: List[DailyConsumptionRow]
    # Bill lifecycle fields (present when retrieved from a saved bill record)
    status: Optional[str] = None
    finalized_at: Optional[datetime] = None


class BillReopenRequest(BaseModel):
    reason: str


# ---------------------------------------------------------------------------
# DASHBOARD
# ---------------------------------------------------------------------------

class ShiftSummary(BaseModel):
    delivered: int
    not_taken: int
    pending: int
    total_litres: float


class DashboardOut(BaseModel):
    date: date
    morning: ShiftSummary
    evening: ShiftSummary
    active_customers: int
    todays_total_litres: float
    todays_collection: float
    outstanding_balance: float
