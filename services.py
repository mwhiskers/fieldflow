import datetime as dt

from db import q, q1

JOB_SELECT = """
SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, s.name AS tech_name, s.truck AS truck
FROM ff_jobs j
JOIN ff_customers c ON c.id = j.customer_id
LEFT JOIN ff_staff s ON s.id = j.tech_id
"""

EST_SELECT = """
SELECT e.*, c.name AS customer_name, 'EST-' || (1000 + e.id) AS number,
  COALESCE((SELECT SUM(qty*unit_price) FROM ff_estimate_items WHERE estimate_id=e.id),0) AS subtotal
FROM ff_estimates e JOIN ff_customers c ON c.id = e.customer_id
"""

INV_SELECT = """
SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
  c.address AS customer_address, c.city AS customer_city,
  'INV-' || (1000 + i.id) AS number,
  CASE WHEN i.status='unpaid' AND i.due_date < CURRENT_DATE THEN 'overdue' ELSE i.status END AS eff_status,
  COALESCE((SELECT SUM(qty*unit_price) FROM ff_invoice_items WHERE invoice_id=i.id),0) AS subtotal
FROM ff_invoices i JOIN ff_customers c ON c.id = i.customer_id
"""


def _totals(r: dict) -> dict:
    sub = r["subtotal"] or 0
    r["tax"] = round(sub * (r["tax_rate"] or 0) / 100, 2)
    r["total"] = round(sub + r["tax"], 2)
    return r


# ---------- customers ----------
def find_customers(term: str) -> list[dict]:
    like = f"%{term.strip()}%"
    digits = "".join(ch for ch in term if ch.isdigit())
    return q("SELECT * FROM ff_customers WHERE name ILIKE :l OR email ILIKE :l OR address ILIKE :l "
             "OR (:d <> '' AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || :d || '%') "
             "ORDER BY name LIMIT 20", {"l": like, "d": digits})


def add_customer(name, phone=None, email=None, address=None, city=None, notes=None) -> dict:
    return q1("INSERT INTO ff_customers(name,phone,email,address,city,notes) "
              "VALUES (:n,:p,:e,:a,:c,:no) RETURNING *",
              dict(n=name, p=phone, e=email, a=address, c=city, no=notes))


# ---------- jobs ----------
def get_job(job_id: int) -> dict | None:
    return q1(JOB_SELECT + " WHERE j.id=:i", {"i": job_id})


def create_job(customer_id, title, description=None, scheduled_at=None, tech_id=None, status="scheduled", address=None):
    cust = q1("SELECT * FROM ff_customers WHERE id=:i", {"i": customer_id})
    if not cust:
        raise ValueError("Customer not found")
    addr = address or ", ".join(x for x in [cust["address"], cust["city"]] if x)
    r = q1("INSERT INTO ff_jobs(customer_id,title,description,status,scheduled_at,tech_id,address) "
           "VALUES (:c,:t,:d,:s,:w,:te,:a) RETURNING id",
           dict(c=customer_id, t=title, d=description, s=status, w=scheduled_at or None,
                te=tech_id or None, a=addr))
    return get_job(r["id"])


def jobs_for_day(day: str, tech_id: int | None = None) -> list[dict]:
    sql = JOB_SELECT + " WHERE j.scheduled_at::date = :d"
    p: dict = {"d": day}
    if tech_id:
        sql += " AND j.tech_id = :t"
        p["t"] = tech_id
    return q(sql + " ORDER BY j.scheduled_at", p)


# ---------- estimates / invoices ----------
def _items(table: str, fk: str, id_: int) -> list[dict]:
    return q(f"SELECT * FROM {table} WHERE {fk}=:i ORDER BY id", {"i": id_})


def get_estimate(id_: int) -> dict | None:
    r = q1(EST_SELECT + " WHERE e.id=:i", {"i": id_})
    if not r:
        return None
    r["items"] = _items("ff_estimate_items", "estimate_id", id_)
    return _totals(r)


def get_invoice(id_: int) -> dict | None:
    r = q1(INV_SELECT + " WHERE i.id=:i", {"i": id_})
    if not r:
        return None
    r["status"] = r.pop("eff_status")
    r["items"] = _items("ff_invoice_items", "invoice_id", id_)
    return _totals(r)


def list_estimates(customer_id=None) -> list[dict]:
    w, p = ("WHERE e.customer_id=:c", {"c": customer_id}) if customer_id else ("", {})
    return [_totals(r) for r in q(EST_SELECT + f" {w} ORDER BY e.id DESC", p)]


def list_invoices(customer_id=None, status=None) -> list[dict]:
    w, p = ("WHERE i.customer_id=:c", {"c": customer_id}) if customer_id else ("", {})
    out = []
    for r in q(INV_SELECT + f" {w} ORDER BY i.id DESC", p):
        r["status"] = r.pop("eff_status")
        out.append(_totals(r))
    if status:
        out = [r for r in out if r["status"] == status]
    return out


def _write_items(table, fk, id_, items):
    q(f"DELETE FROM {table} WHERE {fk}=:i", {"i": id_})
    for it in items:
        if not str(it.get("description", "")).strip():
            continue
        q(f"INSERT INTO {table}({fk},description,qty,unit_price) VALUES (:i,:d,:q,:p)",
          dict(i=id_, d=it["description"], q=it.get("qty", 1), p=it.get("unit_price", 0)))


def save_estimate(data: dict, id_: int | None = None) -> dict:
    if id_ is None:
        id_ = q1("INSERT INTO ff_estimates(customer_id,title,status,tax_rate,notes) "
                 "VALUES (:c,:t,:s,:x,:n) RETURNING id",
                 dict(c=data["customer_id"], t=data.get("title"), s=data.get("status", "draft"),
                      x=data.get("tax_rate", 0), n=data.get("notes")))["id"]
    else:
        q("UPDATE ff_estimates SET customer_id=:c,title=:t,status=:s,tax_rate=:x,notes=:n WHERE id=:i",
          dict(c=data["customer_id"], t=data.get("title"), s=data.get("status", "draft"),
               x=data.get("tax_rate", 0), n=data.get("notes"), i=id_))
    _write_items("ff_estimate_items", "estimate_id", id_, data.get("items", []))
    return get_estimate(id_)


def save_invoice(data: dict, id_: int | None = None) -> dict:
    due = data.get("due_date") or (dt.date.today() + dt.timedelta(days=14)).isoformat()
    if id_ is None:
        id_ = q1("INSERT INTO ff_invoices(customer_id,job_id,tax_rate,due_date,notes) "
                 "VALUES (:c,:j,:x,:d,:n) RETURNING id",
                 dict(c=data["customer_id"], j=data.get("job_id"), x=data.get("tax_rate", 0),
                      d=due, n=data.get("notes")))["id"]
    else:
        q("UPDATE ff_invoices SET customer_id=:c,job_id=:j,tax_rate=:x,due_date=:d,notes=:n WHERE id=:i",
          dict(c=data["customer_id"], j=data.get("job_id"), x=data.get("tax_rate", 0), d=due,
               n=data.get("notes"), i=id_))
    _write_items("ff_invoice_items", "invoice_id", id_, data.get("items", []))
    return get_invoice(id_)


def set_invoice_paid(id_: int, paid: bool) -> dict | None:
    inv = get_invoice(id_)
    if not inv:
        return None
    q("DELETE FROM ff_transactions WHERE invoice_id=:i", {"i": id_})
    if paid:
        q("UPDATE ff_invoices SET status='paid', paid_date=CURRENT_DATE WHERE id=:i", {"i": id_})
        q("INSERT INTO ff_transactions(type,category,amount,description,invoice_id) "
          "VALUES ('income','Service revenue',:a,:d,:i)",
          dict(a=inv["total"], d=f"Invoice {inv['number']} - {inv['customer_name']}", i=id_))
    else:
        q("UPDATE ff_invoices SET status='unpaid', paid_date=NULL WHERE id=:i", {"i": id_})
    return get_invoice(id_)


def invoice_from_job(job_id: int, tax_rate: float = 7.5) -> dict | None:
    job = get_job(job_id)
    if not job:
        return None
    existing = q1("SELECT id FROM ff_invoices WHERE job_id=:j", {"j": job_id})
    if existing:
        return get_invoice(existing["id"])
    est = q1("SELECT id FROM ff_estimates WHERE customer_id=:c AND status='approved' "
             "AND lower(title)=lower(:t) ORDER BY id DESC LIMIT 1", {"c": job["customer_id"], "t": job["title"]})
    items = _items("ff_estimate_items", "estimate_id", est["id"]) if est else \
        [{"description": job["title"], "qty": 1, "unit_price": 0}]
    return save_invoice({"customer_id": job["customer_id"], "job_id": job_id, "tax_rate": tax_rate, "items": items})


# ---------- dashboard ----------
def dashboard() -> dict:
    month = q1("""SELECT
        COALESCE(SUM(amount) FILTER (WHERE type='income'),0) AS revenue,
        COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) AS expenses
        FROM ff_transactions WHERE date_trunc('month',date)=date_trunc('month',CURRENT_DATE)""")
    unpaid = [i for i in list_invoices() if i["status"] in ("unpaid", "overdue")]
    overdue = [i for i in unpaid if i["status"] == "overdue"]
    series = q("""SELECT to_char(m,'Mon') AS month,
        COALESCE((SELECT SUM(amount) FROM ff_transactions t WHERE t.type='income' AND date_trunc('month',t.date)=m),0) AS income,
        COALESCE((SELECT SUM(amount) FROM ff_transactions t WHERE t.type='expense' AND date_trunc('month',t.date)=m),0) AS expense
        FROM generate_series(date_trunc('month',CURRENT_DATE)-interval '5 months', date_trunc('month',CURRENT_DATE), interval '1 month') m
        ORDER BY m""")
    today = q1("SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE status='complete') AS done "
               "FROM ff_jobs WHERE scheduled_at::date=CURRENT_DATE")
    return {
        "revenue_month": month["revenue"], "expenses_month": month["expenses"],
        "net_month": round(month["revenue"] - month["expenses"], 2),
        "outstanding_total": round(sum(i["total"] for i in unpaid), 2), "outstanding_count": len(unpaid),
        "overdue_total": round(sum(i["total"] for i in overdue), 2), "overdue_count": len(overdue),
        "jobs_today": today["n"], "jobs_today_done": today["done"],
        "series": series,
        "estimates_open": len([e for e in list_estimates() if e["status"] in ("draft", "sent")]),
    }
