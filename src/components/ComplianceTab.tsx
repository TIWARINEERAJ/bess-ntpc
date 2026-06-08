import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { DocumentUploads } from "@/components/DocumentUploads";

type Master = { id: string; category: string; name: string; authority: string | null; sort_order: number };
type Stat = { id?: string; station_id: string; compliance_id: string; application_date: string | null; approval_date: string | null; expiry_date: string | null; status: string; document_ref: string | null; owner: string | null; remarks: string | null };

const STATUSES = ["not_applied", "not_applicable", "applied", "under_review", "approved", "rejected", "expired"];
const statusColor = (s: string, expiry?: string | null) => {
  if (s === "approved") {
    if (expiry) { const d = differenceInCalendarDays(parseISO(expiry), new Date()); if (d < 0) return "var(--status-red)"; if (d < 30) return "var(--status-amber)"; }
    return "var(--status-green)";
  }
  if (s === "rejected" || s === "expired") return "var(--status-red)";
  if (s === "applied" || s === "under_review") return "var(--status-blue)";
  if (s === "not_applicable") return "#8b5cf6";
  return "var(--status-grey)";
};

export function ComplianceTab({ stationId, canEdit }: { stationId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const masterQ = useQuery({ queryKey: ["compl_master"], queryFn: async () => {
    const { data, error } = await supabase.from("compliance_master").select("*").order("sort_order");
    if (error) throw error; return data as Master[];
  }});
  const statQ = useQuery({ queryKey: ["station_compl", stationId], queryFn: async () => {
    const { data, error } = await supabase.from("station_compliance").select("*").eq("station_id", stationId);
    if (error) throw error; return data as Stat[];
  }});

  const map = new Map((statQ.data ?? []).map(s => [s.compliance_id, s]));

  const save = useMutation({
    mutationFn: async (row: Stat) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("station_compliance").upsert({ ...row, updated_by: user?.id ?? null }, { onConflict: "station_id,compliance_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["station_compl", stationId] }); qc.invalidateQueries({ queryKey: ["notifications"] }); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const grouped = useMemo(() => {
    const g: Record<string, Master[]> = {};
    for (const m of masterQ.data ?? []) (g[m.category] ??= []).push(m);
    return g;
  }, [masterQ.data]);

  const summary = useMemo(() => {
    const total = (masterQ.data ?? []).length;
    const approved = (statQ.data ?? []).filter(s => s.status === "approved").length;
    return { total, approved };
  }, [masterQ.data, statQ.data]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{summary.approved} of {summary.total} compliance items cleared</div>
      {Object.entries(grouped).map(([cat, items]) => (
        <Card key={cat} className="overflow-hidden p-0">
          <div className="border-b border-border bg-sidebar/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary">{cat}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>{["Item", "Authority", "Status", "Applied", "Approved", "Expires", "Doc Ref", "Owner", "Remarks", "Docs"].map(h =>
                  <th key={h} className="border-b border-border px-2 py-1.5 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map(m => {
                  const s = map.get(m.id) ?? { station_id: stationId, compliance_id: m.id, application_date: null, approval_date: null, expiry_date: null, status: "not_applied", document_ref: null, owner: null, remarks: null };
                  return <ComplRow key={m.id} m={m} s={s} canEdit={canEdit} onSave={(p) => save.mutate({ ...s, ...p })} />;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ComplRow({ m, s, canEdit, onSave }: { m: Master; s: Stat; canEdit: boolean; onSave: (p: Partial<Stat>) => void }) {
  const [local, setLocal] = useState<Stat>(s);
  const dirty = JSON.stringify(local) !== JSON.stringify(s);
  const inp = (k: keyof Stat, type: "date" | "text" = "text", w = "w-32") => (
    <Input type={type} disabled={!canEdit} className={`h-7 ${w} bg-transparent text-xs`} value={(local[k] as string) ?? ""}
      onChange={e => setLocal({ ...local, [k]: e.target.value || null })}
      onBlur={() => dirty && onSave(local)} />
  );
  return (
    <tr className="border-b border-border/40 hover:bg-secondary/30">
      <td className="px-2 py-1 font-medium">{m.name}</td>
      <td className="px-2 py-1 text-[11px] text-muted-foreground">{m.authority ?? "—"}</td>
      <td className="px-1 py-1">
        <Select value={local.status} disabled={!canEdit} onValueChange={(v) => { const n = { ...local, status: v }; setLocal(n); onSave(n); }}>
          <SelectTrigger className="h-7 w-32 text-xs" style={{ color: statusColor(local.status, local.expiry_date) }}><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map(x => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-1 py-1">{inp("application_date", "date")}</td>
      <td className="px-1 py-1">{inp("approval_date", "date")}</td>
      <td className="px-1 py-1">{inp("expiry_date", "date")}</td>
      <td className="px-1 py-1">{inp("document_ref", "text", "w-28")}</td>
      <td className="px-1 py-1">{inp("owner", "text", "w-28")}</td>
      <td className="px-1 py-1">{inp("remarks", "text", "w-36")}</td>
      <td className="px-1 py-1"><DocumentUploads kind="compliance" stationId={s.station_id} refId={m.id} canEdit={canEdit} compact /></td>
    </tr>
  );
}
