import { useEffect, useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Empty, Field, Group, PageHeader, Pill, inputCls, selectCls } from "@/components/bits";
import { api, fmtDate, go, money, refreshAll, useApi } from "@/lib/app";
import type { Customer, Doc, Item } from "@/lib/app";
import { cn } from "@/lib/utils";

export function BillingTabs({ active }: { active: "estimates" | "invoices" | "books" }) {
  return (
    <div className="grid grid-cols-3 gap-1 bg-muted rounded-xl p-1 mb-4 no-print">
      {(["estimates", "invoices", "books"] as const).map((t) => (
        <a key={t} href={`#/${t}`} className={cn("h-10 flex items-center justify-center rounded-lg text-sm font-semibold capitalize", active === t ? "bg-card shadow text-foreground" : "text-muted-foreground")}>{t}</a>
      ))}
    </div>
  );
}

export function DocList({ kind }: { kind: "estimates" | "invoices" }) {
  const { data } = useApi<Doc[]>(`/${kind}`);
  const [filter, setFilter] = useState("all");
  const statuses = kind === "estimates" ? ["all", "draft", "sent", "approved"] : ["all", "unpaid", "overdue", "paid"];
  const rows = (data ?? []).filter((d) => filter === "all" || d.status === filter);
  return (
    <div>
      <PageHeader title="Billing" action={<Button className="h-12 rounded-full px-5" onClick={() => go(`/${kind}/new`)}><Plus className="h-5 w-5 mr-1" />New</Button>} />
      <BillingTabs active={kind} />
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
        {statuses.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={cn("h-10 px-4 rounded-full text-sm font-semibold capitalize border shrink-0", filter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card")}>{s}</button>
        ))}
      </div>
      {rows.length ? (
        <Group>
          {rows.map((d) => (
            <a key={d.id} href={`#/${kind}/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[68px] active:bg-muted/70">
              <div className="min-w-0">
                <div className="font-semibold truncate">{d.customer_name}</div>
                <div className="text-sm text-muted-foreground truncate">{d.number}{d.title ? ` · ${d.title}` : ""}{d.due_date ? ` · due ${fmtDate(d.due_date)}` : ""}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold">{money(d.total)}</div>
                <Pill status={d.status} />
              </div>
            </a>
          ))}
        </Group>
      ) : <Empty>Nothing here yet.</Empty>}
    </div>
  );
}

function totals(items: Item[], rate: number) {
  const sub = items.reduce((s, i) => s + (+i.qty || 0) * (+i.unit_price || 0), 0);
  const tax = Math.round(sub * rate) / 100;
  return { sub, tax, total: sub + tax };
}

function Editor({ kind, doc, customerId, onDone }: { kind: "estimates" | "invoices"; doc: Doc | null; customerId?: number; onDone: (d: Doc) => void }) {
  const { data: customers } = useApi<Customer[]>("/customers");
  const [f, setF] = useState<any>({
    customer_id: doc?.customer_id ?? customerId ?? "", title: doc?.title ?? "", notes: doc?.notes ?? "",
    tax_rate: doc?.tax_rate ?? 7.5, due_date: doc?.due_date ?? "", status: doc?.status ?? "draft", job_id: doc?.job_id ?? null,
  });
  const [items, setItems] = useState<Item[]>(doc?.items?.length ? doc.items : [{ description: "", qty: 1, unit_price: 0 }]);
  const t = totals(items, +f.tax_rate || 0);
  const setItem = (i: number, k: keyof Item, v: any) => setItems((p) => p.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  const save = async () => {
    if (!f.customer_id) { toast.error("Pick a customer"); return; }
    const body = { ...f, customer_id: +f.customer_id, tax_rate: +f.tax_rate || 0, due_date: f.due_date || null,
      status: kind === "invoices" ? "draft" : f.status,
      items: items.filter((i) => i.description.trim()).map((i) => ({ ...i, qty: +i.qty || 0, unit_price: +i.unit_price || 0 })) };
    const saved = await api<Doc>(doc ? `/${kind}/${doc.id}` : `/${kind}`, { method: doc ? "PUT" : "POST", body });
    toast.success("Saved"); refreshAll(); onDone(saved);
  };

  return (
    <div className="space-y-4">
      <Field label="Customer">
        <select className={selectCls} value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
          <option value="">Select customer…</option>
          {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {kind === "estimates" ? (
        <Field label="Title"><Input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Water heater replacement" /></Field>
      ) : (
        <Field label="Due date"><Input type="date" className={inputCls} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
      )}
      <div>
        <div className="text-sm font-medium text-muted-foreground mb-1.5">Line items</div>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="bg-card border rounded-2xl p-3 space-y-2">
              <div className="flex gap-2">
                <Input className={cn(inputCls, "flex-1")} placeholder="Description" value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} />
                <Button variant="ghost" size="icon" className="h-12 w-12 text-destructive" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-5 w-5" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Qty"><Input type="number" inputMode="decimal" className={inputCls} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} /></Field>
                <Field label="Unit price"><Input type="number" inputMode="decimal" className={inputCls} value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} /></Field>
              </div>
              <div className="text-right text-sm text-muted-foreground">{money((+it.qty || 0) * (+it.unit_price || 0))}</div>
            </div>
          ))}
        </div>
        <Button variant="outline" className="w-full h-12 rounded-xl mt-3" onClick={() => setItems((p) => [...p, { description: "", qty: 1, unit_price: 0 }])}><Plus className="h-4 w-4 mr-1" />Add line item</Button>
      </div>
      <Field label="Tax rate (%)"><Input type="number" inputMode="decimal" className={inputCls} value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} /></Field>
      <Field label="Notes"><Textarea className="text-base rounded-xl bg-card" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="bg-card border rounded-2xl p-4 space-y-1">
        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(t.sub)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(t.tax)}</span></div>
        <div className="flex justify-between text-xl font-bold"><span>Total</span><span>{money(t.total)}</span></div>
      </div>
      <Button className="w-full h-14 text-base rounded-xl" onClick={save}>Save {kind === "estimates" ? "estimate" : "invoice"}</Button>
    </div>
  );
}

export function DocPage({ kind, id }: { kind: "estimates" | "invoices"; id: string }) {
  const isNew = id === "new";
  const { data: doc, reload } = useApi<Doc>(isNew ? null : `/${kind}/${id}`);
  const [edit, setEdit] = useState(isNew);
  useEffect(() => { setEdit(isNew); }, [isNew]);
  const cParam = Number(new URLSearchParams(location.hash.split("?")[1] || "").get("c")) || undefined;
  const label = kind === "estimates" ? "Estimate" : "Invoice";

  if (isNew || edit) {
    if (!isNew && !doc) return null;
    return (
      <div>
        <PageHeader title={isNew ? `New ${label.toLowerCase()}` : `Edit ${doc?.number}`} back={isNew ? `/${kind}` : undefined} />
        <Editor kind={kind} doc={isNew ? null : doc} customerId={cParam}
          onDone={(d) => { setEdit(false); if (isNew) go(`/${kind}/${d.id}`); else reload(); }} />
      </div>
    );
  }
  if (!doc) return null;

  const setStatus = async (status: string) => { await api(`/estimates/${doc.id}/status`, { body: { status } }); reload(); refreshAll(); };
  const toInvoice = async () => { const i = await api<Doc>(`/estimates/${doc.id}/invoice`, { method: "POST", body: {} }); refreshAll(); go(`/invoices/${i.id}`); };
  const togglePaid = async () => { await api(`/invoices/${doc.id}/paid?paid=${doc.status !== "paid"}`, { method: "POST", body: {} }); reload(); refreshAll(); };
  const del = async () => { if (!confirm(`Delete ${doc.number}?`)) return; await api(`/${kind}/${doc.id}`, { method: "DELETE" }); refreshAll(); go(`/${kind}`); };

  return (
    <div>
      <PageHeader title={doc.number} back={`/${kind}`} action={<Pill status={doc.status} className="text-sm" />} />
      <div className="grid grid-cols-2 gap-2 mb-4 no-print">
        {kind === "estimates" ? (
          <>
            <div className="col-span-2 grid grid-cols-3 gap-1 bg-muted rounded-xl p-1">
              {["draft", "sent", "approved"].map((s) => (
                <button key={s} onClick={() => setStatus(s)} className={cn("h-11 rounded-lg text-sm font-semibold capitalize", doc.status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{s}</button>
              ))}
            </div>
            <Button className="h-12 rounded-xl" onClick={toInvoice}>Make invoice</Button>
          </>
        ) : (
          <Button className={cn("h-12 rounded-xl", doc.status === "paid" && "bg-green-600 hover:bg-green-600")} onClick={togglePaid}>{doc.status === "paid" ? "Paid ✓ (undo)" : "Mark paid"}</Button>
        )}
        <Button variant="outline" className="h-12 rounded-xl" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print</Button>
        <Button variant="outline" className="h-12 rounded-xl" onClick={() => setEdit(true)}>Edit</Button>
        <Button variant="outline" className="h-12 rounded-xl text-destructive" onClick={del}>Delete</Button>
      </div>

      <div className="print-area bg-card rounded-2xl border shadow-sm p-5 space-y-5">
        <div className="flex justify-between gap-4">
          <div>
            <div className="text-2xl font-bold text-primary">FieldFlow Plumbing</div>
            <div className="text-sm text-muted-foreground">Licensed & insured · 555-0100</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold uppercase tracking-wide">{label}</div>
            <div className="text-sm">{doc.number}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground">Bill to</div>
            <div className="font-semibold">{doc.customer_name}</div>
            {doc.customer_address && <div>{doc.customer_address}{doc.customer_city ? `, ${doc.customer_city}` : ""}</div>}
            {doc.customer_phone && <div>{doc.customer_phone}</div>}
          </div>
          <div className="text-right">
            {doc.issued_date && <div>Issued: {fmtDate(doc.issued_date)}</div>}
            {doc.due_date && <div>Due: {fmtDate(doc.due_date)}</div>}
            {doc.paid_date && <div className="text-green-700">Paid: {fmtDate(doc.paid_date)}</div>}
            {doc.title && <div className="font-medium">{doc.title}</div>}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">Description</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i} className="border-b border-border/60 align-top">
                <td className="py-2 pr-2">{it.description}</td><td className="text-right">{it.qty}</td>
                <td className="text-right">{money(it.unit_price)}</td><td className="text-right">{money(it.qty * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-56 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(doc.subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax ({doc.tax_rate}%)</span><span>{money(doc.tax)}</span></div>
          <div className="flex justify-between text-lg font-bold border-t pt-1"><span>Total</span><span>{money(doc.total)}</span></div>
        </div>
        {doc.notes && <p className="text-sm text-muted-foreground">{doc.notes}</p>}
        <p className="text-center text-xs text-muted-foreground">Thank you for your business!</p>
      </div>
    </div>
  );
}
