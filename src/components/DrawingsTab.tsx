import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileStack } from "lucide-react";
import { toast } from "sonner";
import { drawingCounts, uniqueCategories, isApproved, isSubmitted, isOverdue, isUpcoming, isSubmissionOverdue, type StationDrawing } from "@/lib/drawings";


export function DrawingsTab({ stationId, canEdit }: { stationId: string; canEdit: boolean }) {
  const qc = useQueryClient();

  const stationQ = useQuery({
    queryKey: ["station_mdl_total", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("mdl_total").eq("id", stationId).single();
      if (error) throw error;
      return data.mdl_total as number;
    },
  });

  const drawingsQ = useQuery({
    queryKey: ["station_drawings", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station_drawings")
        .select("*")
        .eq("station_id", stationId)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return data as StationDrawing[];
    },
  });

  const rows = useMemo(() => drawingsQ.data ?? [], [drawingsQ.data]);
  const mdlTotal = stationQ.data ?? 0;
  const counts = useMemo(() => drawingCounts(mdlTotal, rows), [mdlTotal, rows]);
  const categories = useMemo(() => uniqueCategories(rows), [rows]);
  const catClasses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.cat).filter(Boolean))).sort() as string[],
    [rows],
  );

  const [filter, setFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const matchesStatus = (r: StationDrawing) => {
    switch (statusFilter) {
      case "approved": return isApproved(r);
      case "submitted": return isSubmitted(r) && !isApproved(r);
      case "pending": return !isSubmitted(r);
      case "overdue": return isOverdue(r);
      case "sub_overdue": return isSubmissionOverdue(r);
      case "upcoming": return isUpcoming(r);
      default: return true;
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.category !== filter) return false;
      if (catFilter !== "all") {
        if (catFilter === "_none" ? !!r.cat : r.cat !== catFilter) return false;
      }
      if (!matchesStatus(r)) return false;
      if (q && !(`${r.drg_ref} ${r.drg_desc} ${r.category} ${r.cat ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, catFilter, statusFilter, search]);

  const save = useMutation({
    mutationFn: async (row: Partial<StationDrawing> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("station_drawings").update({ ...row, updated_by: user?.id ?? null }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station_drawings", stationId] });
      qc.invalidateQueries({ queryKey: ["all_drawings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const add = useMutation({
    mutationFn: async () => {
      const cat = filter === "all" ? "General" : filter;
      const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
      const { error } = await supabase.from("station_drawings").insert({
        station_id: stationId, category: cat, drg_ref: "", drg_desc: "", sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station_drawings", stationId] });
      qc.invalidateQueries({ queryKey: ["all_drawings"] });
      toast.success("Drawing added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("station_drawings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station_drawings", stationId] });
      qc.invalidateQueries({ queryKey: ["all_drawings"] });
      toast.success("Drawing removed");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setTotal = useMutation({
    mutationFn: async (val: number) => {
      const { error } = await supabase.from("stations").update({ mdl_total: val }).eq("id", stationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station_mdl_total", stationId] });
      qc.invalidateQueries({ queryKey: ["stations"] });
      toast.success("Total MDL updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <SummaryCard label="Total MDL" value={counts.total} editable={canEdit} onCommit={(v) => v !== mdlTotal && setTotal.mutate(v)} initial={mdlTotal} />
        <SummaryCard label="Submitted" value={counts.submitted} pct={counts.submittedPct} tone="blue" />
        <SummaryCard label="Approved" value={counts.approved} pct={counts.approvedPct} tone="green" />
        <SummaryCard label="Pending" value={counts.pending} tone="amber" />
        <SummaryCard label="Sub. Overdue" value={counts.submissionOverdue} tone="red" />
        <SummaryCard label="Apprvl Overdue" value={counts.overdue} tone="red" />
        <SummaryCard label="Due in 2 mo" value={counts.upcoming} tone="violet" />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileStack className="h-4 w-4 text-primary" /> Master Drawing List Register
            <Badge variant="outline" className="text-[10px]">{counts.registered} of {counts.total} listed</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => add.mutate()} disabled={add.isPending}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Drawing
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Category", "Drg Ref", "Drawing Description", "Sch. Sub", "Sch. Apprvl", "Submitted", "Re-submitted", "Approved", "Cat", "Status", canEdit ? "" : null].filter((h) => h !== null).map((h, i) =>
                  <th key={i} className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No drawings listed yet.</td></tr>
              )}
              {visible.map((r) => (
                <DrawingRow key={r.id} row={r} canEdit={canEdit} onSave={(p) => save.mutate({ ...p, id: r.id })} onDelete={() => remove.mutate(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function statusOf(r: StationDrawing) {
  if (isApproved(r)) return { label: "Approved", c: "var(--status-green)" };
  if (isOverdue(r)) return { label: "Overdue", c: "var(--status-red)" };
  if (isUpcoming(r)) return { label: "Due soon", c: "#8b5cf6" };
  if (r.submitted_date || r.resubmitted_date) return { label: "Submitted", c: "var(--status-blue)" };
  return { label: "Pending", c: "var(--status-amber)" };
}

const CAT_OPTIONS = ["CAT-I", "CAT-II", "CAT-III", "CATREL"];

function DrawingRow({ row, canEdit, onSave, onDelete }: {
  row: StationDrawing; canEdit: boolean; onSave: (p: Partial<StationDrawing>) => void; onDelete: () => void;
}) {
  const [local, setLocal] = useState<StationDrawing>(row);
  const st = statusOf(local);

  // Editable actual-date fields (commit immediately).
  const date = (k: "submitted_date" | "resubmitted_date" | "approved_date") => (
    <Input type="date" disabled={!canEdit} className="h-7 w-32 bg-transparent text-xs" value={local[k] ?? ""}
      onChange={(e) => { const n = { ...local, [k]: e.target.value || null }; setLocal(n); onSave(n); }} />
  );
  // Editable category-class (Cat) dropdown — commits immediately.
  const catSelect = (
    <Select
      value={local.cat ?? "_none"}
      disabled={!canEdit}
      onValueChange={(v) => { const n = { ...local, cat: v === "_none" ? null : v }; setLocal(n); onSave(n); }}
    >
      <SelectTrigger className="h-7 w-24 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">—</SelectItem>
        {CAT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  // Frozen master fields — read-only display, never editable.
  const frozenText = (v: string | null | undefined, cls = "") => (
    <span className={`block text-xs text-foreground/90 ${cls}`}>{v || "—"}</span>
  );
  const frozenDate = (v: string | null | undefined) => (
    <span className="block whitespace-nowrap font-mono text-[10px] text-muted-foreground">{v || "—"}</span>
  );

  return (
    <tr className="border-b border-border/40 align-top hover:bg-secondary/30">
      <td className="px-2 py-1.5 align-middle">{frozenText(local.category, "whitespace-nowrap font-medium")}</td>
      <td className="px-2 py-1.5 align-middle">{frozenText(local.drg_ref, "whitespace-nowrap font-mono text-[10px] text-muted-foreground")}</td>
      <td className="px-2 py-1.5 align-middle">{frozenText(local.drg_desc, "min-w-[18rem] max-w-[28rem] whitespace-normal break-words leading-snug")}</td>
      <td className="px-2 py-1.5 align-middle">{frozenDate(local.sch_date)}</td>
      <td className="px-2 py-1.5 align-middle">{frozenDate(local.sch_apprvl_date)}</td>
      <td className="px-1 py-1">{date("submitted_date")}</td>
      <td className="px-1 py-1">{date("resubmitted_date")}</td>
      <td className="px-1 py-1">{date("approved_date")}</td>
      <td className="px-1 py-1 align-middle">{catSelect}</td>
      <td className="px-2 py-1.5 align-middle"><Badge variant="outline" className="text-[10px]" style={{ color: st.c, borderColor: st.c }}>{st.label}</Badge></td>
      {canEdit && (
        <td className="px-1 py-1">
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-[color:var(--status-red)]" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </td>
      )}
    </tr>
  );
}

function SummaryCard({ label, value, pct, tone, editable, onCommit, initial }: {
  label: string; value: number; pct?: number; tone?: "blue" | "green" | "amber" | "red" | "violet";
  editable?: boolean; onCommit?: (v: number) => void; initial?: number;
}) {
  const color = tone === "green" ? "var(--status-green)" : tone === "blue" ? "var(--status-blue)" : tone === "amber" ? "var(--status-amber)" : tone === "red" ? "var(--status-red)" : tone === "violet" ? "#8b5cf6" : "var(--primary)";
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(String(initial ?? value));
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {editable && edit ? (
        <Input
          autoFocus type="number" className="mt-1 h-8 w-24 text-lg" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setEdit(false); onCommit?.(Math.max(0, Math.round(Number(draft) || 0))); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      ) : (
        <div
          className={`mt-1 font-mono text-2xl font-bold ${editable ? "cursor-pointer" : ""}`}
          style={{ color }}
          onClick={() => editable && (setDraft(String(initial ?? value)), setEdit(true))}
          title={editable ? "Click to edit" : undefined}
        >
          {value.toLocaleString()}
        </div>
      )}
      {typeof pct === "number" && (
        <>
          <Progress value={pct} className="mt-2 h-1.5" />
          <div className="mt-1 text-[10px] text-muted-foreground">{pct}% of MDL</div>
        </>
      )}
    </Card>
  );
}
