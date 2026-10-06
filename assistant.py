import os
import datetime as dt

from google import genai
from google.genai import types

import services as sv
from db import q, q1

MODEL = "gemini-3.8-flash"


_c = None


def _client():
    global _c
    if _c is None:
        _c = genai.Client(
            api_key=os.environ.get("GEMINI_WORKSHOP_API_KEY"),
            http_options={"api_version": "v1alpha", "base_url": os.environ.get("GEMINI_WORKSHOP_BASE_URL")},
        )
    return _c


def _pick_customer(name: str):
    rows = sv.find_customers(name)
    exact = [r for r in rows if r["name"].lower() == name.lower()]
    rows = exact or rows
    return rows


def build_tools(user: dict):
    """Return role-appropriate tool functions (callables with docstrings for Gemini)."""
    is_tech = user["role"] == "technician"
    uid = user["id"]

    def show_jobs(date: str = "today") -> dict:
        """List jobs for a day. date is 'today', 'tomorrow', or YYYY-MM-DD."""
        today = dt.date.today()
        day = {"today": today, "tomorrow": today + dt.timedelta(days=1)}.get(date.lower())
        day = (day or dt.date.fromisoformat(date)).isoformat()
        jobs = sv.jobs_for_day(day, uid if is_tech else None)
        return {"date": day, "jobs": [
            {"id": j["id"], "time": (j["scheduled_at"] or "")[11:16], "title": j["title"],
             "customer": j["customer_name"], "status": j["status"], "tech": j["tech_name"],
             "address": j["address"]} for j in jobs]}

    def update_job_status(job_id: int, status: str) -> dict:
        """Set a job's status. status is one of scheduled, en_route, on_site, complete."""
        if status not in ("scheduled", "en_route", "on_site", "complete"):
            return {"error": "invalid status"}
        job = sv.get_job(job_id)
        if not job or (is_tech and job["tech_id"] != uid):
            return {"error": "job not found"}
        q("UPDATE ff_jobs SET status=:s WHERE id=:i", {"s": status, "i": job_id})
        return {"ok": True, "job": job["title"], "status": status}

    tools = [show_jobs, update_job_status]
    if is_tech:
        return tools

    def add_customer(name: str, phone: str = "", email: str = "", address: str = "", city: str = "") -> dict:
        """Add a new customer."""
        c = sv.add_customer(name, phone or None, email or None, address or None, city or None)
        return {"ok": True, "customer": c}

    def find_customer(search: str) -> dict:
        """Search customers by name, phone digits, email or address."""
        return {"customers": sv.find_customers(search)}

    def create_estimate(customer_name: str, description: str, amount: float, tax_rate: float = 7.5) -> dict:
        """Create a draft estimate for an existing customer with one line item (description, amount in dollars)."""
        rows = _pick_customer(customer_name)
        if len(rows) != 1:
            return {"error": "ambiguous or unknown customer", "matches": [r["name"] for r in rows]}
        e = sv.save_estimate({"customer_id": rows[0]["id"], "title": description, "tax_rate": tax_rate,
                              "items": [{"description": description, "qty": 1, "unit_price": amount}]})
        return {"ok": True, "estimate": e["number"], "customer": rows[0]["name"], "total": e["total"]}

    def schedule_job(customer_name: str, title: str, date: str = "today", time: str = "09:00",
                     technician_name: str = "") -> dict:
        """Schedule a job. date is 'today', 'tomorrow' or YYYY-MM-DD; time is HH:MM 24h."""
        rows = _pick_customer(customer_name)
        if len(rows) != 1:
            return {"error": "ambiguous or unknown customer", "matches": [r["name"] for r in rows]}
        today = dt.date.today()
        day = {"today": today, "tomorrow": today + dt.timedelta(days=1)}.get(date.lower()) or dt.date.fromisoformat(date)
        when = dt.datetime.combine(day, dt.time.fromisoformat(time))
        tech = None
        if technician_name:
            tech = q1("SELECT id FROM ff_staff WHERE role='technician' AND name ILIKE :n", {"n": f"%{technician_name}%"})
        j = sv.create_job(rows[0]["id"], title, None, when, tech["id"] if tech else None)
        return {"ok": True, "job_id": j["id"], "when": when.isoformat(), "tech": j["tech_name"]}

    def list_unpaid_invoices() -> dict:
        """List unpaid and overdue invoices."""
        inv = [i for i in sv.list_invoices() if i["status"] != "paid"]
        return {"invoices": [{"number": i["number"], "customer": i["customer_name"], "total": i["total"],
                              "status": i["status"], "due": i["due_date"]} for i in inv]}

    def business_summary() -> dict:
        """Revenue, expenses, outstanding invoices summary for this month."""
        d = sv.dashboard()
        d.pop("series", None)
        return d

    return tools + [add_customer, find_customer, create_estimate, schedule_job, list_unpaid_invoices, business_summary]


def chat(user: dict, messages: list[dict]) -> str:
    today = dt.date.today()
    sys = (
        f"You are FieldFlow's assistant for a small plumbing shop. Today is {today.strftime('%A %Y-%m-%d')}. "
        f"The user is {user['name']} ({user['role']}). Use tools to act; never invent data. "
        "Your replies are spoken aloud, so keep them short (1-3 sentences), plain text, no markdown, no lists. "
        "Speak money naturally (e.g. 'twelve hundred dollars'-style digits are fine). "
        "If a customer match is ambiguous, ask which one. "
        + ("This user is a technician: they can only see their own jobs and update job status." if user["role"] == "technician" else "")
    )
    contents = [
        types.Content(role="user" if m["role"] == "user" else "model", parts=[types.Part(text=m["text"])])
        for m in messages[-12:]
    ]
    resp = _client().models.generate_content(
        model=MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=sys,
            tools=build_tools(user),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=6),
        ),
    )
    return (resp.text or "Done.").strip()
