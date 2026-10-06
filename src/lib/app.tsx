import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

// ---------- types ----------
export type Role = "owner" | "dispatcher" | "technician";
export type User = { id: number; name: string; role: Role; truck: string | null };
export type Customer = {
  id: number; name: string; phone: string | null; email: string | null;
  address: string | null; city: string | null; notes: string | null;
};
export type Job = {
  id: number; customer_id: number; title: string; description: string | null; status: string;
  scheduled_at: string | null; tech_id: number | null; address: string | null;
  customer_name: string; customer_phone: string | null; tech_name: string | null; truck: string | null;
};
export type Item = { description: string; qty: number; unit_price: number };
export type Doc = {
  id: number; number: string; customer_id: number; customer_name: string; title?: string | null;
  status: string; tax_rate: number; notes: string | null; items: Item[]; subtotal: number; tax: number; total: number;
  due_date?: string; issued_date?: string; paid_date?: string | null; job_id?: number | null; created_at?: string;
  customer_phone?: string; customer_email?: string; customer_address?: string; customer_city?: string;
};
export type Staff = { id: number; name: string; role: Role; truck: string | null; phone?: string | null };

// ---------- api ----------
const TOKEN_KEY = "ff_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && path !== "/auth/login") {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("ff-logout"));
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!path) return;
    api<T>(path).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [path]);
  useEffect(() => { setLoading(true); reload(); }, [reload, ...deps]);
  useEffect(() => {
    const h = () => reload();
    window.addEventListener("ff-refresh", h);
    return () => window.removeEventListener("ff-refresh", h);
  }, [reload]);
  return { data, loading, error, reload, setData };
}
export const refreshAll = () => window.dispatchEvent(new Event("ff-refresh"));

// ---------- auth ----------
type AuthCtx = { user: User | null; ready: boolean; login: (t: string, u: User) => void; logout: () => void };
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);
export const isOffice = (u: User | null) => !!u && u.role !== "technician";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api<User>("/auth/me").then(setUser).catch(() => {}).finally(() => setReady(true));
    const h = () => setUser(null);
    window.addEventListener("ff-logout", h);
    return () => window.removeEventListener("ff-logout", h);
  }, []);
  const login = (t: string, u: User) => { localStorage.setItem(TOKEN_KEY, t); setUser(u); location.hash = "#/"; };
  const logout = () => { api("/auth/logout", { method: "POST", body: {} }).catch(() => {}); localStorage.removeItem(TOKEN_KEY); setUser(null); };
  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

// ---------- hash router ----------
export function useRoute() {
  const get = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const [path, setPath] = useState(get());
  useEffect(() => {
    const h = () => { setPath(get()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  return path.split("/").filter(Boolean);
}
export const go = (p: string) => { location.hash = "#" + p; };

// ---------- formatting ----------
export const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Unscheduled";
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + "T00:00" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
export const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const shiftDay = (s: string, n: number) => {
  const d = new Date(s + "T00:00"); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const JOB_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-slate-100 text-slate-700" },
  en_route: { label: "En route", cls: "bg-amber-100 text-amber-800" },
  on_site: { label: "On site", cls: "bg-blue-100 text-blue-800" },
  complete: { label: "Complete", cls: "bg-green-100 text-green-800" },
};
export const DOC_STATUS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700", sent: "bg-blue-100 text-blue-800", approved: "bg-green-100 text-green-800",
  unpaid: "bg-amber-100 text-amber-800", paid: "bg-green-100 text-green-800", overdue: "bg-red-100 text-red-800",
};
