
import os
from dotenv import load_dotenv
import psycopg2

# Load environment variables from backend/.env
load_dotenv()

url = os.getenv("DATABASE_URL")

if not url:
    print("ERROR: DATABASE_URL not found in .env")
    exit()

conn = None
cur = None

try:
    # Connect to PostgreSQL
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    # Check database connection
    cur.execute("""
        SELECT
            current_database(),
            current_schema(),
            current_user,
            inet_server_addr()
    """)

    print("Database connection:", cur.fetchone())

    # Check billstatus enum values
    cur.execute("""
        SELECT
            n.nspname,
            t.typname,
            e.enumlabel
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'billstatus'
        ORDER BY e.enumsortorder
    """)

    print("\nBillstatus enum values:")

    for row in cur.fetchall():
        print(row)

    # Test lowercase draft value
    cur.execute("SELECT 'draft'::billstatus")

    print("\nDraft enum test:", cur.fetchone())

except Exception as e:
    print("\nDatabase diagnostic failed:")
    print(type(e).__name__, e)

finally:
    if cur:
        cur.close()

    if conn:
        conn.close()

    print("\nDatabase connection closed.")
