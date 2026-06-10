import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { DocumentUploads } from "@/components/DocumentUploads";
import { CommitmentHistory } from "@/components/CommitmentHistory";
import { useCommitmentRevisions, type CommitmentRevision } from "@/lib/commitments";
import { DatePicker } from "@/components/DatePicker";

type Master = { id: string; category: string; name: string; authority: string | null; sort_order: number };
type Stat = { id?: string; station_id: string; compliance_id: string; application_date: string | null; approval_date: string | null; committed_date: string | null; expiry_date: string | null; status: string; document_ref: string | null; owner: string | null; remarks: string | null };

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

function emptyStat(stationId: string, complianceId: string): Stat {
  return { station_id: stationId, compliance_id: complianceId, application_date: null, approval_date: null, committed_date: null, expiry_date: null, status: "not_applied", document_ref: null, owner: null, remarks: null };
}

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

  const map = useMemo(() => new Map((statQ.data ?? []).map(s => [s.compliance_id, s])), [statQ.data]);
  const revQ = useCommitmentRevisions(stationId, "compliance");

  const save = useMutation({
    mutationFn: async (row: Stat) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("station_compliance").upsert({ ...row, updated_by: user?.id ?? null }, { onConflict: "station_id,compliance_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["station_compl", stationId] }); qc.invalidateQueries({ queryKey: ["commitment_revisions", "compliance", stationId] }); qc.invalidateQueries({ queryKey: ["notifications"] }); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");

  const categories = useMemo(() => Array.from(new Set((masterQ.data ?? []).map(m => m.category))).sort(), [masterQ.data]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const g: Record<string, Master[]> = {};
    for (const m of masterQ.data ?? []) {
      if (catFilter !== "all" && m.category !== catFilter) continue;
      const st = map.get(m.id) ?? emptyStat(stationId, m.id);
      if (statusFilter !== "all" && st.status !== statusFilter) continue;
      if (q && !(`${m.name} ${m.authority ?? ""} ${m.category} ${st.owner ?? ""} ${st.document_ref ?? ""}`.toLowerCase().includes(q))) continue;
      (g[m.category] ??= []).push(m);
    }
    return g;
  }, [masterQ.data, map, search, statusFilter, catFilter, stationId]);

  const summary = useMemo(() => {
    const total = (masterQ.data ?? []).length;
    const approved = (statQ.data ?? []).filter(s => s.status === "approved").length;
    const shown = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);
    return { total, approved, shown };
  }, [masterQ.data, statQ.data, grouped]);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="text-xs text-muted-foreground">
          {summary.approved} of {summary.total} compliance items cleared · {summary.shown} shown
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search item / authority / owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 text-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(x => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {Object.keys(grouped).length === 0 && (
        <Card className="p-8 text-center text-xs text-muted-foreground">No compliance items match the filters.</Card>
      )}
      {Object.entries(grouped).map(([cat, items]) => (
        <Card key={cat} className="overflow-hidden p-0">
          <div className="border-b border-border bg-sidebar/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary">{cat}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>{["Item", "Authority", "Status", "Committed", "Applied", "Approved", "Expires", "Doc Ref", "Owner", "Remarks", "Docs"].map(h =>
                  <th key={h} className="border-b border-border px-2 py-1.5 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map(m => {
                  const s = map.get(m.id) ?? emptyStat(stationId, m.id);
                  return <ComplRow key={m.id} m={m} s={s} canEdit={canEdit} revisions={revQ.data?.get(m.id)} onSave={(p) => save.mutate({ ...s, ...p })} />;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ComplRow({ m, s, canEdit, revisions, onSave }: { m: Master; s: Stat; canEdit: boolean; revisions?: CommitmentRevision[]; onSave: (p: Partial<Stat>) => void }) {
  const [local, setLocal] = useState<Stat>(s);
  const dirty = JSON.stringify(local) !== JSON.stringify(s);
  const inp = (k: keyof Stat, type: "date" | "text" = "text", w = "w-32") =>
    type === "date" ? (
      <DatePicker disabled={!canEdit} className={`h-7 ${w} text-xs`} value={(local[k] as string) ?? ""}
        onChange={v => { const n = { ...local, [k]: v || null }; setLocal(n); onSave(n); }} />
    ) : (
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
      <td className="px-1 py-1"><div className="flex items-center gap-1">{inp("committed_date", "date")}<CommitmentHistory revisions={revisions} /></div></td>
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
