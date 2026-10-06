import { useState } from "react";
import { Plus, Trash2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, Field, Group, PageHeader, Pill, Section, Stat, inputCls, selectCls } from "@/components/bits";
import { BillingTabs } from "@/pages/Billing";
import { JobDetail, JobForm } from "@/pages/Jobs";
import { api, fmtDate, fmtTime, go, isOffice, money, refreshAll, shiftDay, todayStr, useApi, useAuth, JOB_STATUS } from "@/lib/app";
import type { Job, Staff } from "@/lib/app";
import { cn } from "@/lib/utils";

type Tx = { id: number; type: "income" | "expense"; category: string; amount: number; description: string; date: string };
const CATS = ["Service revenue", "Parts & supplies", "Fuel", "Vehicle", "Tools", "Insurance", "Advertising", "Payroll", "Other"];

export function Books() {
  const { data: d } = useApi<any>("/dashboard");
  const { data: tx } = useApi<Tx[]>("/transactions");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ type: "expense", category: "Parts & supplies", amount: "", description: "", date: todayStr() });
  const save = async () => {
    if (!+f.amount) { toast.error("Enter an amount"); return; }
    await api("/transactions", { body: { ...f, amount: +f.amount } });
    setOpen(false); refreshAll(); toast.success("Recorded");
  };
  return (
    <div>
      <PageHeader title="Billing" action={<Button className="h-12 rounded-full px-5" onClick={() => setOpen(true)}><Plus className="h-5 w-5 mr-1" />Entry</Button>} />
      <BillingTabs active="books" />
      {d && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat label="Revenue (month)" value={money(d.revenue_month)} tone="good" />
          <Stat label="Expenses (month)" value={money(d.expenses_month)} />
          <Stat label="Net (month)" value={money(d.net_month)} tone={d.net_month >= 0 ? "good" : "bad"} />
          <Stat label="Outstanding" value={money(d.outstanding_total)} sub={`${d.overdue_count} overdue`} tone="warn" />
        </div>
      )}
      <Section title="Income & expenses">
        {tx && tx.length ? (
          <Group>
            {tx.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 min-h-16">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{t.description || t.category}</div>
                  <div className="text-sm text-muted-foreground">{t.category} · {fmtDate(t.date)}</div>
                </div>
                <div className={cn("font-semibold", t.type === "income" ? "text-green-600" : "text-foreground")}>{t.type === "income" ? "+" : "−"}{money(t.amount)}</div>
                <button className="p-2 text-muted-foreground" onClick={async () => { await api(`/transactions/${t.id}`, { method: "DELETE" }); refreshAll(); }}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </Group>
        ) : <Empty>No entries.</Empty>}
      </Section>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl safe-bottom max-h-[94vh] overflow-y-auto">
          <SheetHeader className="text-left"><SheetTitle className="text-2xl">New entry</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-1 bg-muted rounded-xl p-1">
              {(["expense", "income"] as const).map((t) => (
                <button key={t} onClick={() => setF({ ...f, type: t, category: t === "income" ? "Service revenue" : "Parts & supplies" })}
                  className={cn("h-11 rounded-lg font-semibold capitalize", f.type === t ? "bg-card shadow" : "text-muted-foreground")}>{t}</button>
              ))}
            </div>
            <Field label="Amount"><Input type="number" inputMode="decimal" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Category">
              <select className={selectCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Description"><Input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Button className="w-full h-14 text-base rounded-xl" onClick={save}>Save</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function Dispatch() {
  const [day, setDay] = useState(todayStr());
  const { data } = useApi<{ techs: Staff[]; jobs: Job[] }>(`/dispatch?date=${day}`, [day]);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState(false);
  const cols = [...(data?.techs ?? []).map((t) => ({ id: t.id as number | null, name: t.name, sub: t.truck })), { id: null, name: "Unassigned", sub: "Needs a tech" }];
  const jobs = data?.jobs ?? [];
  const counts = Object.keys(JOB_STATUS).map((k) => ({ k, n: jobs.filter((j) => j.status === k).length }));
  return (
    <div>
      <PageHeader title="Dispatch board" sub={`${jobs.length} jobs`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-11" onClick={() => setDay(shiftDay(day, -1))}>‹</Button>
            <Button variant="outline" className="h-11" onClick={() => setDay(todayStr())}>{day === todayStr() ? "Today" : fmtDate(day)}</Button>
            <Button variant="outline" className="h-11" onClick={() => setDay(shiftDay(day, 1))}>›</Button>
            <Button className="h-11" onClick={() => setForm(true)}><Plus className="h-4 w-4 mr-1" />Job</Button>
          </div>
        } />
      <div className="flex gap-2 mb-4 flex-wrap">
        {counts.map(({ k, n }) => <Pill key={k} status={k} className="text-sm px-3">{JOB_STATUS[k].label}: {n}</Pill>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cols.map((c) => {
          const mine = jobs.filter((j) => (j.tech_id ?? null) === c.id);
          return (
            <div key={c.name} className="bg-muted/60 rounded-2xl p-3">
              <div className="flex items-baseline justify-between px-1 mb-2">
                <div className="font-bold text-lg">{c.name}</div>
                <div className="text-sm text-muted-foreground">{c.sub} · {mine.length} jobs</div>
              </div>
              <div className="space-y-2">
                {mine.length ? mine.map((j) => (
                  <button key={j.id} onClick={() => setOpen(j.id)} className="w-full text-left bg-card rounded-xl p-3 border border-border/60 shadow-sm hover:shadow">
                    <div className="flex justify-between gap-2 mb-1"><span className="font-semibold text-sm">{fmtTime(j.scheduled_at)}</span><Pill status={j.status} /></div>
                    <div className="font-medium">{j.title}</div>
                    <div className="text-sm text-muted-foreground">{j.customer_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{j.address}</div>
                  </button>
                )) : <div className="text-sm text-muted-foreground text-center py-6">No jobs</div>}
              </div>
            </div>
          );
        })}
      </div>
      <JobDetail jobId={open} onClose={() => setOpen(null)} />
      <JobForm open={form} onClose={() => setForm(false)} defaultDate={day} />
    </div>
  );
}

export function More() {
  const { user, logout } = useAuth();
  const { data: staff } = useApi<Staff[]>("/staff");
  const office = isOffice(user);
  const links = [
    office && { to: "/dispatch", label: "Dispatch board", sub: "All techs & today's jobs" },
    office && { to: "/estimates", label: "Estimates" },
    office && { to: "/invoices", label: "Invoices" },
    office && { to: "/books", label: "Books & expenses" },
  ].filter(Boolean) as { to: string; label: string; sub?: string }[];
  return (
    <div>
      <PageHeader title="More" />
      {links.length > 0 && (
        <Group className="mb-6">
          {links.map((l) => (
            <button key={l.to} onClick={() => go(l.to)} className="w-full text-left px-4 min-h-14 py-2.5">
              <div className="font-medium">{l.label}</div>{l.sub && <div className="text-sm text-muted-foreground">{l.sub}</div>}
            </button>
          ))}
        </Group>
      )}
      <Section title="Team">
        <Group>
          {staff?.filter((s) => (s as any).active !== false).map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 min-h-14 py-2">
              <div><div className="font-medium">{s.name}</div><div className="text-sm text-muted-foreground capitalize">{s.role}{s.truck ? ` · ${s.truck}` : ""}</div></div>
              {s.phone && <a className="text-primary text-sm" href={`tel:${s.phone}`}>{s.phone}</a>}
            </div>
          ))}
        </Group>
      </Section>
      <Button variant="outline" className="w-full h-14 rounded-xl text-base text-destructive" onClick={logout}><LogOut className="h-5 w-5 mr-2" />Sign out ({user?.name})</Button>
    </div>
  );
}
