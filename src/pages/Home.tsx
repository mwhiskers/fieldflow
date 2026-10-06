import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, Group, PageHeader, Section, Stat } from "@/components/bits";
import { JobCard, JobDetail } from "@/pages/Jobs";
import { go, isOffice, money, todayStr, useApi, useAuth } from "@/lib/app";
import type { Job } from "@/lib/app";

type Dash = {
  revenue_month: number; expenses_month: number; net_month: number; outstanding_total: number; outstanding_count: number;
  overdue_total: number; overdue_count: number; jobs_today: number; jobs_today_done: number; estimates_open: number;
  series: { month: string; income: number; expense: number }[];
};

export default function Home() {
  const { user } = useAuth();
  const office = isOffice(user);
  const { data: jobs } = useApi<Job[]>(`/jobs?date=${todayStr()}`);
  const { data: d } = useApi<Dash>(office ? "/dashboard" : null);
  const [open, setOpen] = useState<number | null>(null);
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <PageHeader title={`${greet}, ${user?.name.split(" ")[0]}`} sub={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />
      {office && d && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Stat label="Revenue (month)" value={money(d.revenue_month)} tone="good" />
            <Stat label="Expenses (month)" value={money(d.expenses_month)} />
            <Stat label="Outstanding" value={money(d.outstanding_total)} sub={`${d.outstanding_count} invoices`} tone="warn" />
            <Stat label="Overdue" value={money(d.overdue_total)} sub={`${d.overdue_count} invoices`} tone={d.overdue_count ? "bad" : undefined} />
          </div>
          <Section title="Last 6 months" action={<button className="text-primary text-sm font-medium" onClick={() => go("/books")}>Books</button>}>
            <div className="bg-card rounded-2xl border border-border/60 p-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.series}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={44} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Bar dataKey="income" name="Income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </>
      )}
      <Section title={office ? "Today's jobs" : "My jobs today"}
        action={<button className="text-primary text-sm font-medium" onClick={() => go("/jobs")}>All jobs</button>}>
        {jobs && jobs.length ? <Group>{jobs.map((j) => <JobCard key={j.id} job={j} onClick={() => setOpen(j.id)} />)}</Group> : <Empty>Nothing scheduled today.</Empty>}
      </Section>
      <JobDetail jobId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
