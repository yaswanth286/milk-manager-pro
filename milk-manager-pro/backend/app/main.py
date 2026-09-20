"""
main.py
-------
The entrypoint. This is what you run to start the backend server:

    uvicorn app.main:app --reload

What happens here:
1. Create the FastAPI `app` object.
2. Turn on CORS so the React frontend (running on a different port/domain)
   is allowed to call this API from the browser.
3. Auto-create database tables from our models (for local dev - in a real
   production setup you'd use Alembic migrations instead, see README).
4. "Include" each router - this is what actually wires up
   /auth, /customers, /deliveries, /payments, /bills, /dashboard, /reports.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app import models  # noqa: F401 - importing registers the models with Base
from app.routers import auth, customers, deliveries, payments, bills, dashboard, reports

# Creates any tables that don't exist yet. Safe to call every startup -
# it never drops or alters existing tables.
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Milk Manager Pro API",
    description="Backend API for managing daily buffalo/cow milk delivery, customers, payments and billing.",
    version="1.0.0",
)

# In production, replace "*" with your actual frontend domain(s) for security.
allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(deliveries.router)
app.include_router(payments.router)
app.include_router(bills.router)
app.include_router(dashboard.router)
app.include_router(reports.router)


@app.get("/", tags=["Health"])
def health_check():
    """Simple endpoint to confirm the API is alive. Visit /docs for full API docs."""
    return {"status": "ok", "service": "Milk Manager Pro API"}
