import type { ReactNode } from "react";
import { Briefcase, CircleEllipsis, FileText, Home as HomeIcon, LayoutGrid, LogOut, Receipt, Users, Wallet, Wrench } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import Assistant from "@/components/Assistant";
import { AuthProvider, isOffice, useAuth, useRoute } from "@/lib/app";
import { cn } from "@/lib/utils";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import JobsPage from "@/pages/Jobs";
import { CustomerDetail, CustomersPage } from "@/pages/Customers";
import { DocList, DocPage } from "@/pages/Billing";
import { Books, Dispatch, More } from "@/pages/Other";

type Nav = { to: string; label: string; icon: ReactNode; match: string[]; desktopOnly?: boolean };

function Shell() {
  const { user, ready, logout } = useAuth();
  const seg = useRoute();
  if (!ready) return null;
  if (!user) return <Login />;

  const office = isOffice(user);
  const ic = "h-6 w-6";
  const nav: Nav[] = office
    ? [
        { to: "/", label: "Home", icon: <HomeIcon className={ic} />, match: [""] },
        { to: "/jobs", label: "Jobs", icon: <Briefcase className={ic} />, match: ["jobs"] },
        { to: "/customers", label: "Customers", icon: <Users className={ic} />, match: ["customers"] },
        { to: "/estimates", label: "Billing", icon: <Receipt className={ic} />, match: ["estimates", "invoices", "books"] },
        { to: "/more", label: "More", icon: <CircleEllipsis className={ic} />, match: ["more"] },
        { to: "/dispatch", label: "Dispatch", icon: <LayoutGrid className={ic} />, match: ["dispatch"], desktopOnly: true },
      ]
    : [
        { to: "/", label: "Today", icon: <HomeIcon className={ic} />, match: [""] },
        { to: "/jobs", label: "My jobs", icon: <Briefcase className={ic} />, match: ["jobs"] },
        { to: "/more", label: "More", icon: <CircleEllipsis className={ic} />, match: ["more"] },
      ];
  const sidebar: Nav[] = office
    ? [
        nav[0], nav[5], nav[1], nav[2],
        { to: "/estimates", label: "Estimates", icon: <FileText className={ic} />, match: ["estimates"] },
        { to: "/invoices", label: "Invoices", icon: <Receipt className={ic} />, match: ["invoices"] },
        { to: "/books", label: "Books", icon: <Wallet className={ic} />, match: ["books"] },
      ]
    : nav;

  const [a, b] = seg;
  let page: ReactNode;
  if (!a) page = <Home />;
  else if (a === "jobs") page = <JobsPage />;
  else if (a === "more") page = <More />;
  else if (!office && !(a === "customers" && b)) page = <Home />;
  else if (a === "customers") page = b ? <CustomerDetail id={b} key={b} /> : <CustomersPage />;
  else if (a === "estimates") page = b ? <DocPage kind="estimates" id={b} key={"e" + b} /> : <DocList kind="estimates" />;
  else if (a === "invoices") page = b ? <DocPage kind="invoices" id={b} key={"i" + b} /> : <DocList kind="invoices" />;
  else if (a === "books") page = <Books />;
  else if (a === "dispatch") page = <Dispatch />;
  else page = <Home />;

  const wide = a === "dispatch";
  const isActive = (n: Nav) => n.match.includes(a ?? "");

  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print hidden md:flex w-60 shrink-0 flex-col border-r bg-card p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-6 px-2">
          <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><Wrench className="h-5 w-5" /></div>
          <span className="text-xl font-bold">FieldFlow</span>
        </div>
        <nav className="space-y-1 flex-1">
          {sidebar.map((n) => (
            <a key={n.label} href={"#" + n.to} className={cn("flex items-center gap-3 rounded-xl px-3 h-11 font-medium", isActive(n) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              {n.icon}{n.label}
            </a>
          ))}
        </nav>
        <div className="text-sm px-2 mb-2"><div className="font-semibold">{user.name}</div><div className="text-muted-foreground capitalize">{user.role}</div></div>
        <button onClick={logout} className="flex items-center gap-2 px-3 h-10 rounded-xl text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4" />Sign out</button>
      </aside>

      <main className={cn("flex-1 min-w-0 px-4 pt-6 pb-32 md:pb-10 safe-top mx-auto w-full", wide ? "max-w-7xl md:px-8" : "max-w-2xl md:px-8")}>{page}</main>

      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/90 backdrop-blur border-t safe-bottom">
        <div className="flex">
          {nav.filter((n) => !n.desktopOnly).map((n) => (
            <a key={n.label} href={"#" + n.to} className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium", isActive(n) ? "text-primary" : "text-muted-foreground")}>
              {n.icon}{n.label}
            </a>
          ))}
        </div>
      </nav>
      <Assistant />
      <Toaster position="top-center" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
