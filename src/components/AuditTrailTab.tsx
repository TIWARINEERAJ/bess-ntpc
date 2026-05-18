import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";

type Audit = { id: string; user_email: string | null; entity_type: string; entity_id: string | null; action: string; created_at: string; old_value: string | null; new_value: string | null };

const ENTITIES = ["all", "station_task_status", "issues", "delay_register", "station_boi_status", "station_compliance"];
const labelMap: Record<string, string> = {
  station_task_status: "L2 Task", issues: "Issue", delay_register: "Delay", station_boi_status: "BOI", station_compliance: "Compliance",
};

export function AuditTrailTab({ stationId }: { stationId: string }) {
  const [entity, setEntity] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({ queryKey: ["audit", stationId, entity], queryFn: async () => {
    let qb = supabase.from("audit_log").select("*").eq("station_id", stationId).order("created_at", { ascending: false }).limit(500);
    if (entity !== "all") qb = qb.eq("entity_type", entity);
    const { data, error } = await qb; if (error) throw error; return data as Audit[];
  }});

  const rows = (q.data ?? []).filter(r => !search || (r.user_email ?? "").toLowerCase().includes(search.toLowerCase()));

  const diff = (a: Audit) => {
    try {
      const oldV = a.old_value ? JSON.parse(a.old_value) : {};
      const newV = a.new_value ? JSON.parse(a.new_value) : {};
      const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
      const changes: string[] = [];
      for (const k of keys) {
        if (["updated_at", "updated_by", "id"].includes(k)) continue;
        if (JSON.stringify(oldV[k]) !== JSON.stringify(newV[k])) {
          const o = oldV[k] === null || oldV[k] === undefined ? "∅" : String(oldV[k]);
          const n = newV[k] === null || newV[k] === undefined ? "∅" : String(newV[k]);
          changes.push(`${k}: ${o} → ${n}`);
        }
      }
      return changes.slice(0, 4).join(" · ") || "—";
    } catch { return "—"; }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{ENTITIES.map(e => <SelectItem key={e} value={e}>{e === "all" ? "All entities" : labelMap[e]}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Filter by user email…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-64" />
        <Badge variant="outline" className="ml-auto text-[10px]">{rows.length} entries</Badge>
      </div>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-xs">
          <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>{["When", "User", "Entity", "Action", "Changes"].map(h =>
              <th key={h} className="border-b border-border px-2 py-1.5 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No audit entries.</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{format(parseISO(r.created_at), "dd-MMM HH:mm")}</td>
                <td className="px-2 py-1.5">{r.user_email ?? "—"}</td>
                <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{labelMap[r.entity_type] ?? r.entity_type}</Badge></td>
                <td className="px-2 py-1.5 text-[10px]" style={{ color: r.action === "DELETE" ? "var(--status-red)" : r.action === "INSERT" ? "var(--status-green)" : "var(--status-blue)" }}>{r.action}</td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{diff(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
