import { useEffect, useState } from "react";
import { MapPin, Phone, Plus, Navigation, ChevronRight, FileText, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, Field, Group, PageHeader, Pill, inputCls, selectCls } from "@/components/bits";
import { api, fmtDay, fmtTime, go, isOffice, refreshAll, shiftDay, todayStr, useApi, useAuth, JOB_STATUS } from "@/lib/app";
import type { Customer, Job, Staff } from "@/lib/app";
import { cn } from "@/lib/utils";

export function JobCard({ job, onClick, showDay }: { job: Job; onClick: () => void; showDay?: boolean }) {
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-3.5 min-h-[72px] flex items-center gap-3 active:bg-muted/70">
      <div className="w-16 shrink-0 text-center">
        {showDay && <div className="text-[11px] text-muted-foreground leading-none mb-0.5">{fmtDay(job.scheduled_at)}</div>}
        <div className="text-sm font-semibold">{fmtTime(job.scheduled_at)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{job.title}</div>
        <div className="text-sm text-muted-foreground truncate">{job.customer_name}{job.tech_name ? ` · ${job.tech_name.split(" ")[0]}` : ""}</div>
      </div>
      <Pill status={job.status} />
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export function JobDetail({ jobId, onClose }: { jobId: number | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data: job, reload } = useApi<Job & { customer: Customer }>(jobId ? `/jobs/${jobId}` : null);
  const [edit, setEdit] = useState(false);
  const office = isOffice(user);

  const setStatus = async (status: string) => {
    await api(`/jobs/${jobId}/status`, { body: { status } });
    reload(); refreshAll();
  };
  const invoice = async () => {
    const inv = await api(`/jobs/${jobId}/invoice`, { method: "POST", body: {} });
    onClose(); go(`/invoices/${inv.id}`);
  };
  const del = async () => {
    if (!confirm("Delete this job?")) return;
    await api(`/jobs/${jobId}`, { method: "DELETE" }); onClose(); refreshAll();
  };

  return (
    <>
      <Sheet open={!!jobId && !edit} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl safe-bottom">
          {job && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="text-2xl pr-6">{job.title}</SheetTitle>
                <p className="text-muted-foreground">{fmtDay(job.scheduled_at)} · {fmtTime(job.scheduled_at)}{job.tech_name ? ` · ${job.tech_name}` : ""}{job.truck ? ` (${job.truck})` : ""}</p>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-4 gap-1.5 bg-muted rounded-2xl p-1.5">
                  {Object.entries(JOB_STATUS).map(([k, v]) => (
                    <button key={k} onClick={() => setStatus(k)}
                      className={cn("h-14 rounded-xl text-[13px] font-semibold leading-tight px-1 transition", job.status === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground active:bg-card")}>
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="font-semibold text-lg">{job.customer_name}</div>
                {job.description && <p className="text-base">{job.description}</p>}
                {job.customer?.notes && <p className="text-sm bg-amber-50 text-amber-900 rounded-xl p-3">📌 {job.customer.notes}</p>}
                <div className="grid grid-cols-2 gap-3">
                  {job.customer_phone && (
                    <Button asChild size="lg" className="h-14 rounded-xl text-base"><a href={`tel:${job.customer_phone}`}><Phone className="h-5 w-5 mr-2" />Call</a></Button>
                  )}
                  {job.address && (
                    <Button asChild size="lg" variant="secondary" className="h-14 rounded-xl text-base">
                      <a href={`https://maps.apple.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer"><Navigation className="h-5 w-5 mr-2" />Navigate</a>
                    </Button>
                  )}
                </div>
                {job.address && <div className="flex gap-2 text-muted-foreground"><MapPin className="h-5 w-5 shrink-0" />{job.address}</div>}
                {office && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="outline" className="h-12 rounded-xl" onClick={() => setEdit(true)}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
                    <Button variant="outline" className="h-12 rounded-xl" onClick={invoice}><FileText className="h-4 w-4 mr-2" />Invoice</Button>
                    <Button variant="outline" className="h-12 rounded-xl" onClick={() => { onClose(); go(`/customers/${job.customer_id}`); }}>Customer</Button>
                    <Button variant="outline" className="h-12 rounded-xl text-destructive" onClick={del}><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {job && <JobForm open={edit} job={job} onClose={() => { setEdit(false); reload(); onClose(); }} />}
    </>
  );
}

export function JobForm({ open, onClose, job, defaultCustomer, defaultDate }: {
  open: boolean; onClose: () => void; job?: Job | null; defaultCustomer?: number; defaultDate?: string;
}) {
  const { data: customers } = useApi<Customer[]>(open ? "/customers" : null);
  const { data: staff } = useApi<Staff[]>(open ? "/staff" : null);
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (!open) return;
    setF(job ? { ...job, when: job.scheduled_at?.slice(0, 16) ?? "" }
      : { customer_id: defaultCustomer ?? "", title: "", description: "", tech_id: "", status: "scheduled", when: `${defaultDate ?? todayStr()}T09:00` });
  }, [open, job, defaultCustomer, defaultDate]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.customer_id || !f.title) { toast.error("Customer and title are required"); return; }
    const body = { customer_id: +f.customer_id, title: f.title, description: f.description || null, status: f.status,
      scheduled_at: f.when || null, tech_id: f.tech_id ? +f.tech_id : null, address: f.address || null };
    await api(job ? `/jobs/${job.id}` : "/jobs", { method: job ? "PUT" : "POST", body });
    toast.success("Job saved"); refreshAll(); onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[94vh] overflow-y-auto rounded-t-3xl safe-bottom">
        <SheetHeader className="text-left"><SheetTitle className="text-2xl">{job ? "Edit job" : "New job"}</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <Field label="Customer">
            <select className={selectCls} value={f.customer_id ?? ""} onChange={(e) => set("customer_id", e.target.value)}>
              <option value="">Select customer…</option>
              {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Job title"><Input className={inputCls} value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Water heater replacement" /></Field>
          <Field label="Details"><Textarea className="text-base rounded-xl bg-card" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Date & time"><Input type="datetime-local" className={inputCls} value={f.when ?? ""} onChange={(e) => set("when", e.target.value)} /></Field>
          <Field label="Assigned technician / truck">
            <select className={selectCls} value={f.tech_id ?? ""} onChange={(e) => set("tech_id", e.target.value)}>
              <option value="">Unassigned</option>
              {staff?.filter((s) => s.role === "technician").map((s) => <option key={s.id} value={s.id}>{s.name}{s.truck ? ` — ${s.truck}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Job address (defaults to customer's)"><Input className={inputCls} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <Button className="w-full h-14 text-base rounded-xl" onClick={save}>Save job</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function JobsPage() {
  const { user } = useAuth();
  const [day, setDay] = useState(todayStr());
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState(false);
  const { data: jobs, loading } = useApi<Job[]>(`/jobs?date=${day}`, [day]);
  const office = isOffice(user);
  const isToday = day === todayStr();

  return (
    <div>
      <PageHeader title="Jobs" action={office && <Button className="h-12 rounded-full px-5" onClick={() => setForm(true)}><Plus className="h-5 w-5 mr-1" />New</Button>} />
      <div className="flex items-center justify-between bg-card rounded-2xl border border-border/60 p-1.5 mb-4">
        <Button variant="ghost" className="h-11 w-14 text-xl" onClick={() => setDay(shiftDay(day, -1))}>‹</Button>
        <button className="font-semibold" onClick={() => setDay(todayStr())}>{isToday ? "Today · " : ""}{fmtDay(day + "T00:00")}</button>
        <Button variant="ghost" className="h-11 w-14 text-xl" onClick={() => setDay(shiftDay(day, 1))}>›</Button>
      </div>
      {loading ? null : jobs && jobs.length ? (
        <Group>{jobs.map((j) => <JobCard key={j.id} job={j} onClick={() => setOpen(j.id)} />)}</Group>
      ) : <Empty>No jobs {isToday ? "today" : "this day"}.</Empty>}
      <JobDetail jobId={open} onClose={() => setOpen(null)} />
      {office && <JobForm open={form} onClose={() => setForm(false)} defaultDate={day} />}
    </div>
  );
}
