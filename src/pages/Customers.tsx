import { useEffect, useState } from "react";
import { Phone, Plus, Search, ChevronRight, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, Field, Group, PageHeader, Pill, Section, inputCls } from "@/components/bits";
import { JobCard, JobDetail, JobForm } from "@/pages/Jobs";
import { api, fmtDate, go, isOffice, money, refreshAll, useApi, useAuth } from "@/lib/app";
import type { Customer, Doc, Job } from "@/lib/app";

export function CustomerForm({ open, onClose, customer }: { open: boolean; onClose: () => void; customer?: Customer | null }) {
  const [f, setF] = useState<any>(customer ?? {});
  useEffect(() => { if (open) setF(customer ?? {}); }, [open, customer]);
  const set = (k: string, v: string) => setF((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name?.trim()) { toast.error("Name is required"); return; }
    const body = { name: f.name, phone: f.phone || null, email: f.email || null, address: f.address || null, city: f.city || null, notes: f.notes || null };
    const r = await api(customer ? `/customers/${customer.id}` : "/customers", { method: customer ? "PUT" : "POST", body });
    toast.success("Customer saved"); refreshAll(); onClose();
    if (!customer) go(`/customers/${r.id}`);
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[94vh] overflow-y-auto rounded-t-3xl safe-bottom">
        <SheetHeader className="text-left"><SheetTitle className="text-2xl">{customer ? "Edit customer" : "New customer"}</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <Field label="Name"><Input className={inputCls} value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Phone"><Input type="tel" className={inputCls} value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" className={inputCls} value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Street address"><Input className={inputCls} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="City"><Input className={inputCls} value={f.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="Notes (gate codes, pets, preferences)"><Textarea className="text-base rounded-xl bg-card" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
          <Button className="w-full h-14 text-base rounded-xl" onClick={save}>Save customer</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(false);
  const { data } = useApi<Customer[]>(`/customers?search=${encodeURIComponent(search)}`, [search]);
  return (
    <div>
      <PageHeader title="Customers" action={<Button className="h-12 rounded-full px-5" onClick={() => setForm(true)}><Plus className="h-5 w-5 mr-1" />Add</Button>} />
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
        <Input className="h-12 pl-11 rounded-xl bg-card text-base" placeholder="Search name, phone, address" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {data && data.length ? (
        <Group>
          {data.map((c) => (
            <a key={c.id} href={`#/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 min-h-[64px] active:bg-muted/70">
              <div className="h-11 w-11 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0">
                {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-sm text-muted-foreground truncate">{c.phone || c.email || c.address}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
        </Group>
      ) : <Empty>No customers found.</Empty>}
      <CustomerForm open={form} onClose={() => setForm(false)} />
    </div>
  );
}

type Detail = Customer & { jobs: Job[]; estimates: Doc[]; invoices: Doc[] };

export function CustomerDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const office = isOffice(user);
  const { data: c } = useApi<Detail>(`/customers/${id}`);
  const [edit, setEdit] = useState(false);
  const [job, setJob] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  if (!c) return null;
  const addr = [c.address, c.city].filter(Boolean).join(", ");
  const lifetime = c.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  return (
    <div>
      <PageHeader title={c.name} back={office ? "/customers" : "/"}
        action={office && <Button variant="outline" className="h-11 rounded-full" onClick={() => setEdit(true)}>Edit</Button>} />
      <Group className="mb-4">
        {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-3 px-4 min-h-14 text-primary"><Phone className="h-5 w-5" />{c.phone}</a>}
        {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-3 px-4 min-h-14 text-primary"><Mail className="h-5 w-5" />{c.email}</a>}
        {addr && <a href={`https://maps.apple.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 min-h-14 text-primary"><MapPin className="h-5 w-5 shrink-0" />{addr}</a>}
        {c.notes && <div className="px-4 py-3 text-sm bg-amber-50 text-amber-900">📌 {c.notes}</div>}
      </Group>
      {office && (
        <div className="grid grid-cols-3 gap-2 mb-6">
          <Button className="h-12 rounded-xl" onClick={() => setJob(true)}>+ Job</Button>
          <Button variant="secondary" className="h-12 rounded-xl" onClick={() => go(`/estimates/new?c=${c.id}`)}>+ Estimate</Button>
          <Button variant="secondary" className="h-12 rounded-xl" onClick={() => go(`/invoices/new?c=${c.id}`)}>+ Invoice</Button>
        </div>
      )}
      <Section title={`Service history (${c.jobs.length})`}>
        {c.jobs.length ? <Group>{c.jobs.map((j) => <JobCard key={j.id} job={j} showDay onClick={() => setOpen(j.id)} />)}</Group> : <Empty>No jobs yet.</Empty>}
      </Section>
      {office && c.estimates.length > 0 && (
        <Section title="Estimates">
          <Group>{c.estimates.map((e) => (
            <a key={e.id} href={`#/estimates/${e.id}`} className="flex items-center justify-between px-4 min-h-14 py-2">
              <div><div className="font-medium">{e.number} · {e.title}</div><div className="text-sm text-muted-foreground">{money(e.total)}</div></div><Pill status={e.status} />
            </a>))}</Group>
        </Section>
      )}
      {office && c.invoices.length > 0 && (
        <Section title={`Invoices · ${money(lifetime)} paid`}>
          <Group>{c.invoices.map((i) => (
            <a key={i.id} href={`#/invoices/${i.id}`} className="flex items-center justify-between px-4 min-h-14 py-2">
              <div><div className="font-medium">{i.number}</div><div className="text-sm text-muted-foreground">{money(i.total)} · {fmtDate(i.issued_date)}</div></div><Pill status={i.status} />
            </a>))}</Group>
        </Section>
      )}
      <JobDetail jobId={open} onClose={() => setOpen(null)} />
      {office && <CustomerForm open={edit} onClose={() => setEdit(false)} customer={c} />}
      {office && <JobForm open={job} onClose={() => setJob(false)} defaultCustomer={c.id} />}
    </div>
  );
}
