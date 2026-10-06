import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOC_STATUS, JOB_STATUS } from "@/lib/app";

export function Pill({ status, className, children }: { status: string; className?: string; children?: ReactNode }) {
  const cls = JOB_STATUS[status]?.cls ?? DOC_STATUS[status] ?? "bg-slate-100 text-slate-700";
  const label = JOB_STATUS[status]?.label ?? status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", cls, className)}>{children ?? label}</span>;
}

export function PageHeader({ title, back, action, sub }: { title: string; back?: string; action?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4 no-print">
      <div className="min-w-0">
        {back && (
          <a href={"#" + back} className="inline-flex items-center text-primary text-base font-medium -ml-1 mb-1 h-8">
            <ChevronLeft className="h-5 w-5" /> Back
          </a>
        )}
        <h1 className="text-3xl font-bold tracking-tight truncate">{title}</h1>
        {sub && <p className="text-muted-foreground text-sm">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden divide-y divide-border/70", className)}>{children}</div>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-center text-muted-foreground py-10 px-4 text-base">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "h-12 text-base rounded-xl bg-card";
export const selectCls =
  "h-12 w-full rounded-xl border border-input bg-card px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring";

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "good" | "bad" | "warn"; sub?: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold mt-1", tone === "good" && "text-green-600", tone === "bad" && "text-red-600", tone === "warn" && "text-amber-600")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
