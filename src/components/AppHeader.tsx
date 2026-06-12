import { Link, useRouter } from "@tanstack/react-router";
import { Battery, LogOut, Shield, CalendarDays, Users, LineChart, FileStack, BookOpen, Gauge } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/NotificationBell";

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-sidebar/95 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Battery className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">NTPC BESS — L2 Monitor</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">5,004 MWh · 15 Stations · 16 Contracts</div>
          </div>
        </Link>
        <nav className="ml-6 hidden gap-1 md:flex">
          <Link to="/" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }} activeOptions={{ exact: true }}>Dashboard</Link>
          <Link to="/readiness" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
            <Gauge className="h-3.5 w-3.5" /> Readiness
          </Link>
          <Link to="/drawings" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }} title="Drawings = Master Drawing List (MDL)">
            <FileStack className="h-3.5 w-3.5" /> Drawings (MDL)
          </Link>
          <Link to="/schedule-health" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
            <LineChart className="h-3.5 w-3.5" /> Schedule Health
          </Link>
          <Link to="/weekly-planner" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
            <CalendarDays className="h-3.5 w-3.5" /> Weekly Planner
          </Link>
          <Link to="/repository" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
            <BookOpen className="h-3.5 w-3.5" /> Repository
          </Link>
          {role === "admin" && (
            <Link to="/admin" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
              <Users className="h-3.5 w-3.5" /> Users
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          {role && (
            <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
              <Shield className="h-3 w-3" /> {role.toUpperCase()}
            </Badge>
          )}
          <div className="hidden text-xs text-muted-foreground md:block">{user?.email}</div>
          <Button size="sm" variant="ghost" onClick={async () => { await signOut(); router.navigate({ to: "/login" }); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
