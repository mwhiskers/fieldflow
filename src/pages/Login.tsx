import { useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, useApi, useAuth } from "@/lib/app";
import type { Staff, User } from "@/lib/app";
import { cn } from "@/lib/utils";

export default function Login() {
  const { login } = useAuth();
  const { data: staff } = useApi<Staff[]>("/auth/staff");
  const [sel, setSel] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (p: string) => {
    if (!sel) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ token: string; user: User }>("/auth/login", { body: { staff_id: sel.id, pin: p } });
      login(r.token, r.user);
    } catch (e: any) { setErr(e.message); setPin(""); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg mb-3"><Wrench className="h-8 w-8" /></div>
          <h1 className="text-3xl font-bold">FieldFlow</h1>
          <p className="text-muted-foreground">Field service for plumbing crews</p>
        </div>
        {!sel ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground px-1">Who's signing in?</p>
            {staff?.map((s) => (
              <button key={s.id} onClick={() => { setSel(s); setPin(""); setErr(""); }}
                className="w-full min-h-16 bg-card rounded-2xl border border-border/60 shadow-sm px-4 py-3 text-left active:scale-[.98] transition">
                <div className="text-lg font-semibold">{s.name}</div>
                <div className="text-sm text-muted-foreground capitalize">{s.role}{s.truck ? ` · ${s.truck}` : ""}</div>
              </button>
            ))}
            <p className="text-xs text-center text-muted-foreground pt-3">Demo PINs: owner 1111 · dispatcher 2222 · techs 3333 / 4444</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-xl font-semibold">{sel.name}</div>
              <div className="text-sm text-muted-foreground">Enter your PIN</div>
            </div>
            <div className="flex justify-center gap-3 h-5">
              {[0, 1, 2, 3].map((i) => <div key={i} className={cn("h-4 w-4 rounded-full border-2 border-primary", i < pin.length && "bg-primary")} />)}
            </div>
            {err && <p className="text-center text-sm text-destructive">{err}</p>}
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <Button key={n} variant="secondary" disabled={busy} className="h-16 text-2xl rounded-2xl bg-card border"
                  onClick={() => { const p = (pin + n).slice(0, 4); setPin(p); if (p.length === 4) submit(p); }}>{n}</Button>
              ))}
              <Button variant="ghost" className="h-16 text-base" onClick={() => setSel(null)}>Back</Button>
              <Button variant="secondary" disabled={busy} className="h-16 text-2xl rounded-2xl bg-card border"
                onClick={() => { const p = (pin + "0").slice(0, 4); setPin(p); if (p.length === 4) submit(p); }}>0</Button>
              <Button variant="ghost" className="h-16 text-base" onClick={() => setPin(pin.slice(0, -1))}>Delete</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
