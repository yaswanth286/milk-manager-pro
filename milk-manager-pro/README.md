# 🥛 Milk Manager Pro

A real, working, production-style web application for managing a daily
buffalo/cow milk delivery business — customers, morning & evening
deliveries, payments, and monthly billing.

Built from scratch with:

- **Frontend:** React + Vite + JavaScript, Axios, React Router
- **Backend:** Python + FastAPI
- **Database:** PostgreSQL
- **ORM:** SQLAlchemy
- **Auth:** JWT (JSON Web Tokens) + bcrypt password hashing

This README explains how to run it, and how it's built, in plain language
— written for someone learning as they go.

---

## 1. How the pieces fit together

```
Your phone / laptop browser
        │  (HTTPS/HTTP requests, e.g. "mark Ramesh delivered")
        ▼
  React app (frontend/)  ──axios──►  FastAPI backend (backend/)
        ▲                                   │
        │  JSON responses                   │ SQLAlchemy
        └───────────────────────────────────▼
                                     PostgreSQL database
```

- The **frontend** is everything you see and tap — it has NO direct
  access to the database. It only talks to the backend over HTTP.
- The **backend** is the only thing allowed to talk to PostgreSQL. It
  checks that you're logged in (via JWT) before doing anything.
- The **database** just stores rows in tables. It doesn't know anything
  about "business rules" — all of that logic lives in the backend code.

This separation is what "REST API" architecture means, and it's why the
same backend could later power a mobile app too, without changing a line
of backend code.

---

## 2. Project structure

```
milk-manager-pro/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app entrypoint
│   │   ├── database.py      # PostgreSQL connection setup
│   │   ├── models.py        # SQLAlchemy tables (Customer, Delivery, Payment...)
│   │   ├── schemas.py       # Pydantic request/response shapes
│   │   ├── auth.py          # JWT + password hashing
│   │   └── routers/         # One file per feature area (customers, deliveries...)
│   ├── requirements.txt
│   ├── .env.example
│   └── create_admin.py      # Run once to create your login
│
└── frontend/
    ├── src/
    │   ├── pages/            # One folder per screen
    │   ├── components/       # Reusable pieces (layout, delivery row, etc.)
    │   ├── services/         # Axios calls to the backend, grouped by feature
    │   ├── context/          # AuthContext (global "who is logged in")
    │   ├── routes/           # ProtectedRoute (blocks pages if not logged in)
    │   ├── utils/             # Formatting helpers (currency, dates, litres)
    │   ├── constants/         # Shared constant values
    │   └── styles/            # global.css - the whole design system
    ├── package.json
    └── .env.example
```

---

## 3. Prerequisites

Install these first if you don't have them:

- **Python 3.11+** — https://www.python.org/downloads/
- **Node.js 18+** (includes npm) — https://nodejs.org/
- **PostgreSQL 14+** — https://www.postgresql.org/download/

---

## 4. Set up PostgreSQL

Open a terminal and log into PostgreSQL (the exact command depends on
your OS — on many systems it's `psql -U postgres`), then run:

```sql
CREATE DATABASE milk_manager_pro;
CREATE USER milkuser WITH PASSWORD 'milkpass';
GRANT ALL PRIVILEGES ON DATABASE milk_manager_pro TO milkuser;
```

(Feel free to use a different username/password — just remember to update
`backend/.env` to match in the next step.)

---

## 5. Set up the backend

```bash
cd backend

# Create and activate a virtual environment (keeps this project's Python
# packages separate from the rest of your system)
python3 -m venv venv
source venv/bin/activate        # on Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Open .env in a text editor and check DATABASE_URL matches what you
# created in step 4, and set a real JWT_SECRET_KEY (any long random string).

# Create your login (username + password) - this also creates all the
# database tables automatically on first run.
python create_admin.py

# Start the server
uvicorn app.main:app --reload
```

The API is now running at **http://localhost:8000**.
Open **http://localhost:8000/docs** in a browser to see the interactive
API documentation (Swagger UI) — you can test every endpoint there
directly, which is a great way to understand what the backend can do.

---

## 6. Set up the frontend

Open a **new** terminal (leave the backend running in the first one):

```bash
cd frontend
npm install
npm run dev
```

The app is now running at **http://localhost:5173**. Open it in a
browser and log in with the username/password you created with
`create_admin.py`.

### Using it from your phone
Because `vite.config.js` is set to `host: true`, you can also open the
app from your phone if it's on the same WiFi network as your computer:
find your computer's local IP address (e.g. `192.168.1.5`) and visit
`http://192.168.1.5:5173` on your phone. You'll also need to update
`frontend/.env` (`VITE_API_BASE_URL=http://192.168.1.5:8000`) and restart
`npm run dev` so the phone can reach the backend too.

---

## 7. First steps once you're logged in

1. Go to **Customers → +** and add your first customer (e.g. "Ramesh",
   Morning 1L, Evening 0.5L, rate ₹80/L).
2. Go to **Delivery → Morning**, find Ramesh, tap **Delivered**, adjust
   the quantity if needed, and tap **Save**.
3. Go to **Payments → + New Payment** to record money received.
4. Go to **Bills**, pick Ramesh + the current month, to see the
   automatically calculated bill.
5. Check the **Dashboard** for today's overview.

---

## 8. Key design decisions worth understanding

**Why does every delivery store its own rate (`rate_applied`)?**
So that if you change a customer's price per litre next month, all the
OLD delivery records and bills stay exactly as they were. Only new
deliveries use the new rate. This is what makes historical bills
trustworthy.

**Why doesn't browsing the Morning Delivery screen create database
rows for every customer, every day?**
The backend builds a "virtual" view: it starts from your list of active
morning customers, and only shows a REAL saved record if you already
marked one for that date. A row is only written to the database the
moment you tap Save. This keeps the database clean — no fake "not
delivered" spam for days you didn't even open the app.

**Why is `current_balance` always calculated, not stored?**
`previous_balance − advance_amount + (all milk charges ever) − (all
payments ever)`. Because it's calculated fresh every time from the raw
delivery and payment records, it can never drift out of sync — there's
no "update the balance" step to forget.

**Why is there no public sign-up page?**
This is a private, single-business tool — not a public app. Accounts are
created once, from the command line, with `create_admin.py`. This avoids
exposing an API endpoint that lets anyone create a login.

---

## 9. API overview

All endpoints (except `/auth/login`) require a header:
`Authorization: Bearer <token>` — the frontend adds this automatically
once you're logged in (see `frontend/src/services/api.js`).

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login` | Log in, get a JWT |
| GET | `/auth/me` | Who am I? |
| GET/POST | `/customers` | List / create customers |
| GET/PUT/DELETE | `/customers/{id}` | View / edit / delete a customer |
| GET | `/customers/{id}/consumption?year&month` | Monthly consumption history |
| GET | `/deliveries/morning?date=` | Morning delivery screen data |
| GET | `/deliveries/evening?date=` | Evening delivery screen data |
| POST | `/deliveries/mark` | Quick mark delivered/not-taken |
| GET/POST | `/deliveries` | List / create raw delivery records |
| PUT | `/deliveries/{id}` | Edit a delivery record |
| GET/POST | `/payments` | List / record payments |
| GET | `/payments/customer/{id}` | One customer's payment history |
| GET | `/bills/{customer_id}/{year}/{month}` | Live-calculated bill |
| POST | `/bills/generate?customer_id&year&month` | Save a frozen bill snapshot |
| GET | `/dashboard?date=` | Today's summary |
| GET | `/reports/outstanding-balances` | Who owes money |
| GET | `/reports/litres-and-revenue?date_from&date_to` | Sales report |
| GET | `/reports/payments-summary?date_from&date_to` | Collections report |
| GET | `/reports/daily?date=` | Full breakdown of one day |

Full interactive docs (with request/response shapes) are always at
`/docs` while the backend is running.

---

## 10. Where to go next (the app is built to expand)

The architecture was deliberately kept modular so you can grow it:

- **Database migrations:** right now `Base.metadata.create_all()` handles
  table creation for local development. For a real production rollout,
  add [Alembic](https://alembic.sqlalchemy.org/) for versioned schema
  migrations so you can safely change tables without losing data.
- **PDF bills:** add a library like `reportlab` or `weasyprint` in the
  backend, and a new `GET /bills/{id}/pdf` endpoint. The bill data shape
  (`BillOut`) is already exactly what you'd need.
- **Multiple staff logins:** the `User` model already has a `role` field
  (`owner` / `staff`) — add permission checks in routers as needed.
- **Rate change history:** add a `MilkRateHistory` table, and use it when
  computing "planned charges" going forward, without touching how past
  deliveries are billed (they're already protected via `rate_applied`).
- **WhatsApp/SMS reminders:** hook into a service like Twilio from a new
  backend script that reads `/reports/outstanding-balances`.
- **Deployment:** the backend is a standard FastAPI app (deploy via
  Docker, Render, Railway, a VPS with `gunicorn` + `uvicorn` workers,
  etc.) and the frontend is a standard Vite app (deploy the `dist/`
  folder from `npm run build` to Netlify, Vercel, or any static host —
  just point `VITE_API_BASE_URL` at your deployed backend).

---

## 11. Troubleshooting

- **"Could not validate credentials" / constantly logged out** — your
  `JWT_SECRET_KEY` in `backend/.env` may have changed since you logged
  in. Log in again.
- **Frontend can't reach the backend** — check `frontend/.env`'s
  `VITE_API_BASE_URL` matches where the backend is actually running, and
  that the backend terminal shows no errors.
- **`psycopg2` install fails** — make sure PostgreSQL's development
  headers are installed on your system, or fall back to
  `psycopg2-binary` (already what's in `requirements.txt`).
- **CORS errors in the browser console** — check `CORS_ORIGINS` in
  `backend/.env` includes the exact URL you're opening the frontend from.
