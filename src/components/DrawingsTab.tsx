import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileStack, Link2 } from "lucide-react";
import { toast } from "sonner";
import { drawingCounts, drawingCatSummary, uniqueCategories, isApproved, isSubmitted, isOverdue, isUpcoming, isSubmissionOverdue, catCode, type StationDrawing } from "@/lib/drawings";
import { DrawingsLifecycleChart } from "@/components/DrawingsLifecycleChart";
import { DatePicker } from "@/components/DatePicker";
import type { BoiLite } from "@/lib/boi-links";


/**
 * Summary "view" predicates — these map 1:1 to the Station-wise MDL Summary
 * (Approval Category Conclusion) columns so that clicking a digit there lands
 * here and filters the register to exactly the rows behind that number.
 */
export const MDL_VIEWS: Record<string, { label: string; pred: (r: StationDrawing) => boolean }> = {
  total: { label: "Total MDL", pred: () => true },
  submitted: { label: "Submitted", pred: (r) => isSubmitted(r) },
  appr12: { label: "Approved (CAT I+II)", pred: (r) => catCode(r.cat) === "I" || catCode(r.cat) === "II" },
  appr12rel: { label: "Approved (CAT I+II+REL)", pred: (r) => ["I", "II", "REL"].includes(catCode(r.cat) ?? "") },
  catI: { label: "CAT-I", pred: (r) => catCode(r.cat) === "I" },
  catII: { label: "CAT-II", pred: (r) => catCode(r.cat) === "II" },
  catREL: { label: "CAT-REL", pred: (r) => catCode(r.cat) === "REL" },
  catIII: { label: "CAT-III", pred: (r) => catCode(r.cat) === "III" },
  categorized: { label: "Categorised (I+II+III+REL)", pred: (r) => ["I", "II", "REL", "III"].includes(catCode(r.cat) ?? "") },
  pending: { label: "Approval Pending", pred: (r) => isSubmitted(r) && catCode(r.cat) === null },
  balance: { label: "Balance Submission", pred: (r) => catCode(r.cat) === null },
};

export function DrawingsTab({
  stationId,
  canEdit,
  boiByDrawing,
  focusId,
  view,
  onClearView,
  onFocusBoi,
}: {
  stationId: string;
  canEdit: boolean;
  boiByDrawing?: Map<string, BoiLite[]>;
  focusId?: string | null;
  view?: string;
  onClearView?: () => void;
  onFocusBoi?: (boiId: string) => void;
}) {
  const qc = useQueryClient();

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
  // Total MDL is the count of rows in this station's Master Drawing List —
  // the single source of truth. There is no separate planned total.
  const counts = useMemo(() => drawingCounts(rows), [rows]);
  const catSum = useMemo(() => drawingCatSummary(rows), [rows]);
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

  const viewPred = view ? MDL_VIEWS[view]?.pred : undefined;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (viewPred && !viewPred(r)) return false;
      if (filter !== "all" && r.category !== filter) return false;
      if (catFilter !== "all") {
        if (catFilter === "_none" ? !!r.cat : r.cat !== catFilter) return false;
      }
      if (!matchesStatus(r)) return false;
      if (q && !(`${r.drg_ref} ${r.drg_desc} ${r.category} ${r.cat ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, catFilter, statusFilter, search, view]);

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

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <SummaryCard label="Total MDL Drawings" value={counts.total} />

        <SummaryCard label="Submitted" value={counts.submitted} pct={counts.submittedPct} tone="blue" />
        <SummaryCard label="Approved" value={counts.approved} pct={counts.approvedPct} tone="green" />
        <SummaryCard label="Pending" value={counts.pending} tone="amber" />
        <SummaryCard label="Sub. Overdue" value={counts.submissionOverdue} tone="red" />
        <SummaryCard label="Apprvl Overdue" value={counts.overdue} tone="red" />
        <SummaryCard label="Due in 2 mo" value={counts.upcoming} tone="violet" />
      </div>

      {/* MDL approval-category conclusion (mirrors the consolidated MDL Station Summary) */}
      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            MDL Approval Summary — Conclusion
          </div>
          {view && MDL_VIEWS[view] && (
            <button
              type="button"
              onClick={() => onClearView?.()}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
            >
              Filtered: {MDL_VIEWS[view].label} · clear ✕
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5 lg:grid-cols-9">
          {[
            { l: "Total MDL", v: catSum.total, view: "total" },
            { l: "Submitted", v: catSum.submitted, c: "var(--status-blue)", view: "submitted" },
            { l: "Appr. (I+II)", v: catSum.approvedCat12, view: "appr12" },
            { l: "Appr. (I+II+REL)", v: catSum.approvedCat12Rel, c: "var(--status-green)", view: "appr12rel" },
            { l: "CAT-I", v: catSum.catI, view: "catI" },
            { l: "CAT-II", v: catSum.catII, view: "catII" },
            { l: "CATREL", v: catSum.catREL, view: "catREL" },
            { l: "CAT-III", v: catSum.catIII, c: "var(--status-red)", view: "catIII" },
            { l: "Apprvl Pending", v: catSum.approvalPending, c: "var(--status-amber)", view: "pending" },
          ].map((x) => (
            <Link
              key={x.l}
              to="/stations/$stationId"
              params={{ stationId }}
              search={(prev: Record<string, unknown>) => ({ ...prev, tab: "mdl", focus: undefined, dview: x.view })}
              className={`rounded-md border bg-secondary/20 px-2 py-1.5 transition-colors hover:bg-secondary/50 ${view === x.view ? "border-primary ring-1 ring-primary/50" : "border-border/60"}`}
              title={`Show ${x.l} drawings`}
            >
              <div className="font-mono text-base font-semibold" style={x.c ? { color: x.c } : undefined}>{x.v}</div>
              <div className="text-[10px] leading-tight text-muted-foreground">{x.l}</div>
            </Link>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Balance submission pending:{" "}
          <Link
            to="/stations/$stationId"
            params={{ stationId }}
            search={(prev: Record<string, unknown>) => ({ ...prev, tab: "mdl", focus: undefined, dview: "balance" })}
            className="font-mono font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {catSum.balanceSubmission}
          </Link>{" "}
          of {catSum.total} drawings not yet categorised.
        </div>
      </Card>

      <DrawingsLifecycleChart rows={view && viewPred ? rows.filter(viewPred) : rows} />




      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileStack className="h-4 w-4 text-primary" /> Master Drawing List Register
            <Badge variant="outline" className="text-[10px]">{visible.length} of {counts.registered} shown</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search ref / description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 text-xs"
            />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sub_overdue">Sub. overdue</SelectItem>
                <SelectItem value="overdue">Apprvl overdue</SelectItem>
                <SelectItem value="upcoming">Due in 2 mo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Cat" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cat</SelectItem>
                <SelectItem value="_none">No Cat</SelectItem>
                {catClasses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Category", "Drg Ref", "Drawing Description", "Sch. Sub", "Sch. Apprvl", "Submitted", "Re-submitted", "Approved", "Cat", "Status"].map((h, i) =>
                  <th key={i} className="border-b border-border px-2 py-2 text-left font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">No drawings listed yet.</td></tr>
              )}
              {visible.map((r) => (
                <DrawingRow
                  key={r.id}
                  row={r}
                  canEdit={canEdit}
                  bois={boiByDrawing?.get(r.id)}
                  focused={focusId === r.id}
                  onFocusBoi={onFocusBoi}
                  onSave={(p) => save.mutate({ ...p, id: r.id })}
                />
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

function DrawingRow({ row, canEdit, bois, focused, onFocusBoi, onSave }: {
  row: StationDrawing; canEdit: boolean;
  bois?: BoiLite[]; focused?: boolean; onFocusBoi?: (boiId: string) => void;
  onSave: (p: Partial<StationDrawing>) => void;
}) {
  const [local, setLocal] = useState<StationDrawing>(row);
  const st = statusOf(local);
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);


  // Editable actual-date fields (commit immediately).
  const date = (k: "submitted_date" | "resubmitted_date" | "approved_date") => (
    <DatePicker disabled={!canEdit} className="h-7 w-full min-w-0 px-1 text-[11px]" value={local[k] ?? ""}
      onChange={(v) => { const n = { ...local, [k]: v || null }; setLocal(n); onSave(n); }} />
  );
  // Editable category-class (Cat) dropdown — commits immediately.
  const catSelect = (
    <Select
      value={local.cat ?? "_none"}
      disabled={!canEdit}
      onValueChange={(v) => { const n = { ...local, cat: v === "_none" ? null : v }; setLocal(n); onSave(n); }}
    >
      <SelectTrigger className="h-7 w-full min-w-0 px-1 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
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
    <tr
      ref={rowRef}
      className={`border-b border-border/40 align-top hover:bg-secondary/30 ${focused ? "bg-primary/10 ring-1 ring-primary/50" : ""}`}
    >
      <td className="px-2 py-1.5 align-middle">{frozenText(local.category, "break-words font-medium")}</td>
      <td className="px-2 py-1.5 align-middle">{frozenText(local.drg_ref, "break-all font-mono text-[10px] text-muted-foreground")}</td>
      <td className="px-2 py-1.5 align-middle">
        {frozenText(local.drg_desc, "whitespace-normal break-words leading-snug")}
        {bois && bois.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {bois.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onFocusBoi?.(b.id)}
                className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-0.5 text-[9px] text-primary hover:bg-primary/20"
                title="Open linked BOI item"
              >
                <Link2 className="h-2.5 w-2.5" /> {b.name}
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 align-middle">{frozenDate(local.sch_date)}</td>
      <td className="px-2 py-1.5 align-middle">{frozenDate(local.sch_apprvl_date)}</td>
      <td className="px-1 py-1">{date("submitted_date")}</td>
      <td className="px-1 py-1">{date("resubmitted_date")}</td>
      <td className="px-1 py-1">{date("approved_date")}</td>
      <td className="px-1 py-1 align-middle">{catSelect}</td>
      <td className="px-2 py-1.5 align-middle"><Badge variant="outline" className="text-[10px]" style={{ color: st.c, borderColor: st.c }}>{st.label}</Badge></td>
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
