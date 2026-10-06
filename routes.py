import os
import secrets
import datetime as dt
from typing import Optional

from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import services as sv
from db import init_db, q, q1

STATUSES = ("scheduled", "en_route", "on_site", "complete")


# ---------- models ----------
class Login(BaseModel):
    staff_id: int
    pin: str


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None


class JobIn(BaseModel):
    customer_id: int
    title: str
    description: Optional[str] = None
    scheduled_at: Optional[str] = None
    tech_id: Optional[int] = None
    status: str = "scheduled"
    address: Optional[str] = None


class Item(BaseModel):
    description: str
    qty: float = 1
    unit_price: float = 0


class DocIn(BaseModel):
    customer_id: int
    title: Optional[str] = None
    status: str = "draft"
    tax_rate: float = 0
    notes: Optional[str] = None
    job_id: Optional[int] = None
    due_date: Optional[str] = None
    items: list[Item] = []


class StatusIn(BaseModel):
    status: str


class TxIn(BaseModel):
    type: str
    category: Optional[str] = None
    amount: float
    description: Optional[str] = None
    date: Optional[str] = None


class StaffIn(BaseModel):
    name: str
    role: str
    pin: str
    truck: Optional[str] = None
    phone: Optional[str] = None


class ChatIn(BaseModel):
    messages: list[dict]


# ---------- auth ----------
def current_user(request: Request) -> dict:
    h = request.headers.get("authorization", "")
    token = h[7:] if h.lower().startswith("bearer ") else ""
    row = q1("SELECT s.id,s.name,s.role,s.truck FROM ff_sessions t JOIN ff_staff s ON s.id=t.staff_id "
             "WHERE t.token=:t AND s.active", {"t": token}) if token else None
    if not row:
        raise HTTPException(401, "Not signed in")
    return row


def office(user: dict = Depends(current_user)) -> dict:
    if user["role"] not in ("owner", "dispatcher"):
        raise HTTPException(403, "Office access required")
    return user


def owner(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "owner":
        raise HTTPException(403, "Owner access required")
    return user


def create_app(static_dir: str) -> FastAPI:
    init_db()
    api = APIRouter()

    @api.get("/health")
    def health():
        return {"ok": True}

    # ----- auth -----
    @api.get("/auth/staff")
    def login_choices():
        return q("SELECT id,name,role,truck FROM ff_staff WHERE active ORDER BY id")

    @api.post("/auth/login")
    def login(b: Login):
        s = q1("SELECT id,name,role,truck,pin FROM ff_staff WHERE id=:i AND active", {"i": b.staff_id})
        if not s or s["pin"] != b.pin:
            raise HTTPException(401, "Wrong PIN")
        token = secrets.token_urlsafe(32)
        q("INSERT INTO ff_sessions(token,staff_id) VALUES (:t,:s)", {"t": token, "s": s["id"]})
        s.pop("pin")
        return {"token": token, "user": s}

    @api.get("/auth/me")
    def me(user=Depends(current_user)):
        return user

    @api.post("/auth/logout")
    def logout(request: Request, user=Depends(current_user)):
        q("DELETE FROM ff_sessions WHERE token=:t", {"t": request.headers["authorization"][7:]})
        return {"ok": True}

    # ----- staff -----
    @api.get("/staff")
    def staff(user=Depends(current_user)):
        return q("SELECT id,name,role,truck,phone,active FROM ff_staff ORDER BY id")

    @api.post("/staff")
    def add_staff(b: StaffIn, user=Depends(owner)):
        if b.role not in ("owner", "dispatcher", "technician") or len(b.pin) < 4:
            raise HTTPException(400, "Invalid role or PIN (min 4 digits)")
        return q1("INSERT INTO ff_staff(name,role,pin,truck,phone) VALUES (:n,:r,:p,:t,:ph) "
                  "RETURNING id,name,role,truck,phone,active", dict(n=b.name, r=b.role, p=b.pin, t=b.truck, ph=b.phone))

    @api.delete("/staff/{sid}")
    def del_staff(sid: int, user=Depends(owner)):
        if sid == user["id"]:
            raise HTTPException(400, "Cannot remove yourself")
        q("UPDATE ff_staff SET active=FALSE WHERE id=:i", {"i": sid})
        q("DELETE FROM ff_sessions WHERE staff_id=:i", {"i": sid})
        return {"ok": True}

    # ----- customers -----
    @api.get("/customers")
    def customers(search: str = "", user=Depends(office)):
        if search.strip():
            return sv.find_customers(search)
        return q("SELECT * FROM ff_customers ORDER BY name")

    @api.post("/customers")
    def new_customer(b: CustomerIn, user=Depends(office)):
        return sv.add_customer(b.name, b.phone, b.email, b.address, b.city, b.notes)

    @api.get("/customers/{cid}")
    def customer(cid: int, user=Depends(current_user)):
        c = q1("SELECT * FROM ff_customers WHERE id=:i", {"i": cid})
        if not c:
            raise HTTPException(404, "Not found")
        jobs = q(sv.JOB_SELECT + " WHERE j.customer_id=:c ORDER BY j.scheduled_at DESC", {"c": cid})
        if user["role"] == "technician":
            jobs = [j for j in jobs if j["tech_id"] == user["id"]]
            if not jobs:
                raise HTTPException(403, "Not your customer")
            return {**c, "jobs": jobs, "estimates": [], "invoices": []}
        return {**c, "jobs": jobs, "estimates": sv.list_estimates(cid), "invoices": sv.list_invoices(cid)}

    @api.put("/customers/{cid}")
    def edit_customer(cid: int, b: CustomerIn, user=Depends(office)):
        return q1("UPDATE ff_customers SET name=:n,phone=:p,email=:e,address=:a,city=:c,notes=:no WHERE id=:i RETURNING *",
                  dict(n=b.name, p=b.phone, e=b.email, a=b.address, c=b.city, no=b.notes, i=cid))

    @api.delete("/customers/{cid}")
    def del_customer(cid: int, user=Depends(owner)):
        q("DELETE FROM ff_customers WHERE id=:i", {"i": cid})
        return {"ok": True}

    # ----- jobs -----
    @api.get("/jobs")
    def jobs(date: Optional[str] = None, upcoming: bool = False, user=Depends(current_user)):
        tech = user["id"] if user["role"] == "technician" else None
        if date:
            return sv.jobs_for_day(date, tech)
        sql = sv.JOB_SELECT + " WHERE TRUE"
        p: dict = {}
        if tech:
            sql += " AND j.tech_id=:t"
            p["t"] = tech
        if upcoming:
            sql += " AND j.scheduled_at::date >= CURRENT_DATE"
        return q(sql + " ORDER BY j.scheduled_at", p)

    @api.post("/jobs")
    def new_job(b: JobIn, user=Depends(office)):
        return sv.create_job(b.customer_id, b.title, b.description, b.scheduled_at, b.tech_id, b.status, b.address)

    @api.get("/jobs/{jid}")
    def job(jid: int, user=Depends(current_user)):
        j = sv.get_job(jid)
        if not j or (user["role"] == "technician" and j["tech_id"] != user["id"]):
            raise HTTPException(404, "Not found")
        c = q1("SELECT * FROM ff_customers WHERE id=:i", {"i": j["customer_id"]})
        return {**j, "customer": c}

    @api.put("/jobs/{jid}")
    def edit_job(jid: int, b: JobIn, user=Depends(office)):
        q("UPDATE ff_jobs SET customer_id=:c,title=:t,description=:d,status=:s,scheduled_at=:w,tech_id=:te,address=:a WHERE id=:i",
          dict(c=b.customer_id, t=b.title, d=b.description, s=b.status, w=b.scheduled_at or None,
               te=b.tech_id, a=b.address, i=jid))
        return sv.get_job(jid)

    @api.post("/jobs/{jid}/status")
    def job_status(jid: int, b: StatusIn, user=Depends(current_user)):
        j = sv.get_job(jid)
        if b.status not in STATUSES:
            raise HTTPException(400, "Bad status")
        if not j or (user["role"] == "technician" and j["tech_id"] != user["id"]):
            raise HTTPException(404, "Not found")
        q("UPDATE ff_jobs SET status=:s WHERE id=:i", {"s": b.status, "i": jid})
        return sv.get_job(jid)

    @api.delete("/jobs/{jid}")
    def del_job(jid: int, user=Depends(office)):
        q("DELETE FROM ff_jobs WHERE id=:i", {"i": jid})
        return {"ok": True}

    @api.post("/jobs/{jid}/invoice")
    def job_invoice(jid: int, user=Depends(office)):
        inv = sv.invoice_from_job(jid)
        if not inv:
            raise HTTPException(404, "Not found")
        return inv

    @api.get("/dispatch")
    def dispatch(date: Optional[str] = None, user=Depends(office)):
        day = date or dt.date.today().isoformat()
        techs = q("SELECT id,name,truck,phone FROM ff_staff WHERE role='technician' AND active ORDER BY id")
        jobs_ = sv.jobs_for_day(day)
        return {"date": day, "techs": techs, "jobs": jobs_}

    # ----- estimates -----
    @api.get("/estimates")
    def estimates(user=Depends(office)):
        return sv.list_estimates()

    @api.post("/estimates")
    def new_estimate(b: DocIn, user=Depends(office)):
        return sv.save_estimate(b.model_dump())

    @api.get("/estimates/{eid}")
    def estimate(eid: int, user=Depends(office)):
        e = sv.get_estimate(eid)
        if not e:
            raise HTTPException(404, "Not found")
        return e

    @api.put("/estimates/{eid}")
    def edit_estimate(eid: int, b: DocIn, user=Depends(office)):
        return sv.save_estimate(b.model_dump(), eid)

    @api.post("/estimates/{eid}/status")
    def estimate_status(eid: int, b: StatusIn, user=Depends(office)):
        if b.status not in ("draft", "sent", "approved"):
            raise HTTPException(400, "Bad status")
        q("UPDATE ff_estimates SET status=:s WHERE id=:i", {"s": b.status, "i": eid})
        return sv.get_estimate(eid)

    @api.post("/estimates/{eid}/invoice")
    def estimate_to_invoice(eid: int, user=Depends(office)):
        e = sv.get_estimate(eid)
        if not e:
            raise HTTPException(404, "Not found")
        return sv.save_invoice({"customer_id": e["customer_id"], "tax_rate": e["tax_rate"], "items": e["items"],
                                "notes": e["title"]})

    @api.delete("/estimates/{eid}")
    def del_estimate(eid: int, user=Depends(office)):
        q("DELETE FROM ff_estimates WHERE id=:i", {"i": eid})
        return {"ok": True}

    # ----- invoices -----
    @api.get("/invoices")
    def invoices(status: Optional[str] = None, user=Depends(office)):
        return sv.list_invoices(status=status)

    @api.post("/invoices")
    def new_invoice(b: DocIn, user=Depends(office)):
        return sv.save_invoice(b.model_dump())

    @api.get("/invoices/{iid}")
    def invoice(iid: int, user=Depends(office)):
        i = sv.get_invoice(iid)
        if not i:
            raise HTTPException(404, "Not found")
        return i

    @api.put("/invoices/{iid}")
    def edit_invoice(iid: int, b: DocIn, user=Depends(office)):
        return sv.save_invoice(b.model_dump(), iid)

    @api.post("/invoices/{iid}/paid")
    def invoice_paid(iid: int, paid: bool = True, user=Depends(office)):
        i = sv.set_invoice_paid(iid, paid)
        if not i:
            raise HTTPException(404, "Not found")
        return i

    @api.delete("/invoices/{iid}")
    def del_invoice(iid: int, user=Depends(office)):
        q("DELETE FROM ff_transactions WHERE invoice_id=:i", {"i": iid})
        q("DELETE FROM ff_invoices WHERE id=:i", {"i": iid})
        return {"ok": True}

    # ----- bookkeeping -----
    @api.get("/dashboard")
    def dashboard(user=Depends(office)):
        return sv.dashboard()

    @api.get("/transactions")
    def transactions(user=Depends(office)):
        return q("SELECT * FROM ff_transactions ORDER BY date DESC, id DESC LIMIT 200")

    @api.post("/transactions")
    def new_tx(b: TxIn, user=Depends(office)):
        if b.type not in ("income", "expense"):
            raise HTTPException(400, "Bad type")
        return q1("INSERT INTO ff_transactions(type,category,amount,description,date) "
                  "VALUES (:t,:c,:a,:d,COALESCE(:dt, CURRENT_DATE)) RETURNING *",
                  dict(t=b.type, c=b.category, a=b.amount, d=b.description, dt=b.date))

    @api.delete("/transactions/{tid}")
    def del_tx(tid: int, user=Depends(office)):
        q("DELETE FROM ff_transactions WHERE id=:i", {"i": tid})
        return {"ok": True}

    # ----- assistant -----
    @api.post("/assistant")
    def assistant_chat(b: ChatIn, user=Depends(current_user)):
        import assistant
        try:
            return {"reply": assistant.chat(user, b.messages)}
        except Exception as e:  # surface a friendly error
            raise HTTPException(502, f"Assistant unavailable: {str(e)[:200]}")

    app = FastAPI()
    app.include_router(api, prefix="/api")

    if os.path.isdir(static_dir):
        assets_dir = os.path.join(static_dir, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{path:path}")
        async def spa_fallback(request: Request, path: str):
            file_path = os.path.join(static_dir, path)
            if path and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(
                os.path.join(static_dir, "index.html"),
                headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"},
            )

    return app
