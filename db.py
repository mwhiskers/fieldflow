import os
import datetime as dt
from decimal import Decimal

from sqlalchemy import create_engine, text

_engine = None


def get_url() -> str:
    for k, v in os.environ.items():
        if k.endswith("_DATABASE_URL") and v:
            return v
    raise RuntimeError("No *_DATABASE_URL configured")


def engine():
    global _engine
    if _engine is None:
        _engine = create_engine(get_url(), pool_pre_ping=True, pool_size=5, pool_recycle=300)
    return _engine


def _clean(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    return v


def q(sql: str, params: dict | None = None) -> list[dict]:
    with engine().begin() as c:
        res = c.execute(text(sql), params or {})
        if not res.returns_rows:
            return []
        return [{k: _clean(v) for k, v in r._mapping.items()} for r in res]


def q1(sql: str, params: dict | None = None) -> dict | None:
    rows = q(sql, params)
    return rows[0] if rows else None


SCHEMA = """
CREATE TABLE IF NOT EXISTS ff_staff (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
  pin TEXT NOT NULL, truck TEXT, phone TEXT, active BOOLEAN DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS ff_sessions (
  token TEXT PRIMARY KEY, staff_id INT REFERENCES ff_staff(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ff_customers (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT,
  address TEXT, city TEXT, notes TEXT, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ff_jobs (
  id SERIAL PRIMARY KEY, customer_id INT REFERENCES ff_customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'scheduled',
  scheduled_at TIMESTAMP, tech_id INT REFERENCES ff_staff(id) ON DELETE SET NULL,
  address TEXT, created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ff_estimates (
  id SERIAL PRIMARY KEY, customer_id INT REFERENCES ff_customers(id) ON DELETE CASCADE,
  title TEXT, status TEXT DEFAULT 'draft', tax_rate NUMERIC DEFAULT 0, notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ff_estimate_items (
  id SERIAL PRIMARY KEY, estimate_id INT REFERENCES ff_estimates(id) ON DELETE CASCADE,
  description TEXT NOT NULL, qty NUMERIC DEFAULT 1, unit_price NUMERIC DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ff_invoices (
  id SERIAL PRIMARY KEY, customer_id INT REFERENCES ff_customers(id) ON DELETE CASCADE,
  job_id INT REFERENCES ff_jobs(id) ON DELETE SET NULL, status TEXT DEFAULT 'unpaid',
  tax_rate NUMERIC DEFAULT 0, issued_date DATE DEFAULT CURRENT_DATE, due_date DATE,
  paid_date DATE, notes TEXT
);
CREATE TABLE IF NOT EXISTS ff_invoice_items (
  id SERIAL PRIMARY KEY, invoice_id INT REFERENCES ff_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL, qty NUMERIC DEFAULT 1, unit_price NUMERIC DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ff_transactions (
  id SERIAL PRIMARY KEY, type TEXT NOT NULL, category TEXT, amount NUMERIC NOT NULL,
  description TEXT, date DATE DEFAULT CURRENT_DATE, invoice_id INT
);
"""


def init_db():
    with engine().begin() as c:
        for stmt in SCHEMA.split(";"):
            if stmt.strip():
                c.execute(text(stmt))
    if q1("SELECT 1 AS x FROM ff_staff LIMIT 1") is None:
        seed()


def seed():
    today = dt.date.today()
    d = lambda n: today + dt.timedelta(days=n)
    at = lambda n, h, m=0: dt.datetime.combine(d(n), dt.time(h, m))

    staff = [
        ("Mike Torres", "owner", "1111", None, "555-0100"),
        ("Dana Reyes", "dispatcher", "2222", None, "555-0101"),
        ("Sam Carter", "technician", "3333", "Truck 1", "555-0102"),
        ("Luis Ortega", "technician", "4444", "Truck 2", "555-0103"),
    ]
    for n, r, p, t, ph in staff:
        q("INSERT INTO ff_staff(name,role,pin,truck,phone) VALUES (:n,:r,:p,:t,:ph)",
          dict(n=n, r=r, p=p, t=t, ph=ph))
    sam = q1("SELECT id FROM ff_staff WHERE name='Sam Carter'")["id"]
    luis = q1("SELECT id FROM ff_staff WHERE name='Luis Ortega'")["id"]

    customers = [
        ("Jennifer Walsh", "555-2211", "jwalsh@example.com", "42 Maple Street", "Springfield", "Dog in backyard. Gate code 4471."),
        ("Robert Chen", "555-3398", "rchen@example.com", "118 Oak Avenue", "Springfield", None),
        ("Maria Gonzalez", "555-7720", "maria.g@example.com", "9 Birch Lane", "Shelbyville", "Prefers text messages."),
        ("Harbor Diner", "555-4410", "manager@harbordiner.example", "300 Main Street", "Springfield", "Commercial account. Call before 10am."),
        ("Tom Alvarez", "555-9082", None, "77 Cedar Court", "Springfield", None),
        ("Patricia Nguyen", "555-6153", "pnguyen@example.com", "21 Elm Road", "Capital City", "Older home, galvanized pipes."),
        ("Greg Foster", "555-1876", "gfoster@example.com", "560 Pine Street", "Shelbyville", None),
        ("Sunrise Apartments", "555-3030", "office@sunriseapts.example", "1500 River Road", "Springfield", "Property manager: Linda. 12 units."),
    ]
    for n, ph, e, a, c, no in customers:
        q("INSERT INTO ff_customers(name,phone,email,address,city,notes) VALUES (:n,:ph,:e,:a,:c,:no)",
          dict(n=n, ph=ph, e=e, a=a, c=c, no=no))
    cid = {r["name"]: r["id"] for r in q("SELECT id,name FROM ff_customers")}
    addr = {r["name"]: r["address"] + ", " + r["city"] for r in q("SELECT name,address,city FROM ff_customers")}

    jobs = [  # customer, title, desc, status, when, tech
        ("Jennifer Walsh", "Water heater replacement", "Replace 40-gal gas heater with 50-gal.", "on_site", at(0, 8, 30), sam),
        ("Harbor Diner", "Grease trap cleaning", "Quarterly service.", "en_route", at(0, 10), luis),
        ("Robert Chen", "Kitchen faucet install", "Customer-supplied faucet.", "scheduled", at(0, 13), sam),
        ("Sunrise Apartments", "Unit 6B leaking toilet", "Replace wax ring and fill valve.", "scheduled", at(0, 14, 30), luis),
        ("Tom Alvarez", "Clogged main drain", "Camera inspection if needed.", "scheduled", at(0, 16), sam),
        ("Maria Gonzalez", "Garbage disposal replacement", None, "scheduled", at(1, 9), luis),
        ("Patricia Nguyen", "Repipe quote walkthrough", "Galvanized to PEX evaluation.", "scheduled", at(1, 11), sam),
        ("Greg Foster", "Outdoor spigot repair", None, "scheduled", at(2, 10), sam),
        ("Robert Chen", "Sump pump install", "Completed last week.", "complete", at(-6, 9), sam),
        ("Harbor Diner", "Dishwasher line repair", None, "complete", at(-12, 8), luis),
        ("Maria Gonzalez", "Shower valve replacement", None, "complete", at(-20, 13), sam),
        ("Sunrise Apartments", "Backflow preventer test", None, "complete", at(-35, 9), luis),
        ("Jennifer Walsh", "Hose bib freeze repair", None, "complete", at(-45, 11), sam),
    ]
    for c, t, de, s, w, tech in jobs:
        q("INSERT INTO ff_jobs(customer_id,title,description,status,scheduled_at,tech_id,address) "
          "VALUES (:c,:t,:de,:s,:w,:tech,:a)",
          dict(c=cid[c], t=t, de=de, s=s, w=w, tech=tech, a=addr[c]))
    jid = {r["title"]: r["id"] for r in q("SELECT id,title FROM ff_jobs")}

    def invoice(cust, job, status, issued, due, paid, items, tax=7.5):
        r = q1("INSERT INTO ff_invoices(customer_id,job_id,status,tax_rate,issued_date,due_date,paid_date) "
               "VALUES (:c,:j,:s,:t,:i,:d,:p) RETURNING id",
               dict(c=cid[cust], j=jid.get(job), s=status, t=tax, i=issued, d=due, p=paid))
        total = 0
        for de, qty, price in items:
            q("INSERT INTO ff_invoice_items(invoice_id,description,qty,unit_price) VALUES (:i,:de,:q,:p)",
              dict(i=r["id"], de=de, q=qty, p=price))
            total += qty * price
        if status == "paid":
            q("INSERT INTO ff_transactions(type,category,amount,description,date,invoice_id) "
              "VALUES ('income','Service revenue',:a,:de,:d,:i)",
              dict(a=round(total * (1 + tax / 100), 2), de=f"Invoice INV-{1000 + r['id']} - {cust}", d=paid, i=r["id"]))

    invoice("Robert Chen", "Sump pump install", "unpaid", d(-6), d(8), None,
            [("Sump pump 1/3 HP", 1, 289), ("Labor (3 hrs)", 3, 95), ("PVC fittings", 1, 38)])
    invoice("Harbor Diner", "Dishwasher line repair", "unpaid", d(-12), d(-2), None,
            [("Labor (2 hrs)", 2, 110), ("Supply line + fittings", 1, 64)])
    invoice("Maria Gonzalez", "Shower valve replacement", "paid", d(-20), d(-6), d(-15),
            [("Shower valve cartridge", 1, 142), ("Labor (2.5 hrs)", 2.5, 95)])
    invoice("Sunrise Apartments", "Backflow preventer test", "paid", d(-35), d(-5), d(-28),
            [("Backflow test & certification", 1, 175)], tax=0)
    invoice("Jennifer Walsh", "Hose bib freeze repair", "paid", d(-45), d(-30), d(-40),
            [("Frost-free hose bib", 1, 58), ("Labor (1.5 hrs)", 1.5, 95)])

    def estimate(cust, title, status, items, tax=7.5, ago=0):
        r = q1("INSERT INTO ff_estimates(customer_id,title,status,tax_rate,created_at) VALUES (:c,:t,:s,:x,:ca) RETURNING id",
               dict(c=cid[cust], t=title, s=status, x=tax, ca=dt.datetime.now() - dt.timedelta(days=ago)))
        for de, qty, price in items:
            q("INSERT INTO ff_estimate_items(estimate_id,description,qty,unit_price) VALUES (:e,:de,:q,:p)",
              dict(e=r["id"], de=de, q=qty, p=price))

    estimate("Jennifer Walsh", "Water heater replacement", "approved",
             [("50-gal gas water heater", 1, 780), ("Install labor (4 hrs)", 4, 95), ("Venting & code upgrades", 1, 140)], ago=9)
    estimate("Patricia Nguyen", "Whole-house repipe (PEX)", "sent",
             [("PEX tubing & fittings", 1, 1850), ("Labor (28 hrs)", 28, 95), ("Drywall access & patching", 1, 650)], ago=3)
    estimate("Greg Foster", "Tankless water heater upgrade", "draft",
             [("Tankless unit", 1, 1150), ("Install labor (5 hrs)", 5, 95)], ago=1)

    exp = [
        ("Parts & supplies", 412.50, "Ferguson - fittings & valves", -3),
        ("Fuel", 186.20, "Fuel - Truck 1 & 2", -5),
        ("Parts & supplies", 640.00, "Water heater (Walsh job)", -9),
        ("Insurance", 380.00, "Liability insurance", -14),
        ("Vehicle", 95.00, "Truck 2 oil change", -18),
        ("Tools", 229.99, "Drain camera battery & tools", -22),
        ("Advertising", 150.00, "Local ads", -26),
    ]
    for cat, a, de, n in exp:
        q("INSERT INTO ff_transactions(type,category,amount,description,date) VALUES ('expense',:c,:a,:de,:d)",
          dict(c=cat, a=a, de=de, d=d(n)))
    for cat, a, de, n in [("Service revenue", 340.00, "Cash job - Foster, drain clean", -7),
                          ("Service revenue", 225.00, "Cash job - Alvarez, faucet", -11)]:
        q("INSERT INTO ff_transactions(type,category,amount,description,date) VALUES ('income',:c,:a,:de,:d)",
          dict(c=cat, a=a, de=de, d=d(n)))
