import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, AlertTriangle, Calendar, Package, FileWarning, ShieldCheck, CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { loadNotifications, type Notif } from "@/lib/notifications";

const iconFor = (k: Notif["kind"]) => {
  if (k === "task") return <Calendar className="h-3.5 w-3.5" />;
  if (k === "boi") return <Package className="h-3.5 w-3.5" />;
  if (k === "issue") return <AlertTriangle className="h-3.5 w-3.5" />;
  if (k === "delay") return <FileWarning className="h-3.5 w-3.5" />;
  if (k === "meeting") return <CalendarClock className="h-3.5 w-3.5" />;
  return <ShieldCheck className="h-3.5 w-3.5" />;
};

export function NotificationBell() {
  const q = useQuery({ queryKey: ["notifications"], queryFn: loadNotifications, refetchInterval: 60000 });
  const list = q.data ?? [];
  const high = list.filter(n => n.severity === "high").length;
  const count = list.length;

  return (
    <Popover>
      <PopoverTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: high > 0 ? "var(--status-red)" : "var(--status-amber)" }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Due-Date Notifications</span>
            <Badge variant="outline" className="text-[10px]">{count} active</Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Meetings · L2 tasks · BOI POs · Issues · Delays · Compliance expiries</p>
        </div>
        <ScrollArea className="h-[420px]">
          {list.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">All clear. No imminent due dates.</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {list.slice(0, 50).map(n => (
                <li key={n.key}>
                  <Link to="/stations/$stationId" params={{ stationId: n.stationId }} className="block px-3 py-2 hover:bg-secondary/60">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5" style={{ color: n.severity === "high" ? "var(--status-red)" : "var(--status-amber)" }}>
                        {iconFor(n.kind)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">{n.title}</span>
                          <span className="shrink-0 font-mono text-[10px]" style={{ color: n.daysUntil < 0 ? "var(--status-red)" : n.daysUntil <= 2 ? "var(--status-red)" : "var(--status-amber)" }}>
                            {n.daysUntil < 0 ? `${-n.daysUntil}d late` : `${n.daysUntil}d`}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{n.detail}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
