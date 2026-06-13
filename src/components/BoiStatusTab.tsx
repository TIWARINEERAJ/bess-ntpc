import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DocumentUploads } from "@/components/DocumentUploads";
import { BoiLifecycleChart } from "@/components/BoiLifecycleChart";
import type { BoiLifecycleRow } from "@/lib/boi-lifecycle";
import { DatePicker } from "@/components/DatePicker";
import { CommitmentHistory } from "@/components/CommitmentHistory";
import { useCommitmentRevisions, type CommitmentRevision } from "@/lib/commitments";
import { buildBoiLinks, type BoiLink } from "@/lib/boi-links";
import { fmtD, type L2Task } from "@/lib/gantt-utils";
import type { StationDrawing } from "@/lib/drawings";

type Boi = {
  id: string;
  sl_no: number;
  name: string;
  drawings_count: number | null;
  scheduled_po_date: string | null;
  inspection_category: string | null;
};
type BoiStatus = {
  id?: string;
  station_id: string;
  boi_id: string;
  actual_po_date: string | null;
  committed_date: string | null;
  delivery_date: string | null;
  site_receipt_date: string | null;
  mobilization_status: string | null;
  drawings_status: string | null;
  inspection_status: string | null;
  remarks: string | null;
};

const DRAWING_OPTIONS = ["", "Submitted", "Approved"];
const INSPECTION_OPTIONS = ["", "Call Raised", "Pending", "Completed"];

function statusChip(b: Boi, s: BoiStatus | undefined) {
  if (!s?.actual_po_date) {
    if (b.scheduled_po_date && differenceInCalendarDays(new Date(), parseISO(b.scheduled_po_date)) > 0)
      return { label: "Overdue", c: "var(--status-red)" };
    return { label: "Pending", c: "var(--status-amber)" };
  }
  if (s.site_receipt_date) return { label: "Received", c: "var(--status-green)" };
  if (s.delivery_date) return { label: "In Transit", c: "var(--status-blue)" };
  return { label: "Ordered", c: "var(--status-blue)" };
}

export function BoiStatusTab({
  stationId,
  canEdit,
  tasks = [],
  focusId,
  onFocusDrawing,
  onFocusTask,
}: {
  stationId: string;
  canEdit: boolean;
  tasks?: L2Task[];
  focusId?: string | null;
  onFocusDrawing?: (drawingId: string) => void;
  onFocusTask?: (taskId: string) => void;
}) {
  const qc = useQueryClient();
  const masterQ = useQuery({
    queryKey: ["boi_master", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boi_master")
        .select("id,name,sl_no,drawings_count,scheduled_po_date,inspection_category,station_id")
        .eq("station_id", stationId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Boi[];
    },
  });
  const statusQ = useQuery({
    queryKey: ["boi_status", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_boi_status").select("*").eq("station_id", stationId);
      if (error) throw error;
      return (data ?? []) as unknown as BoiStatus[];
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
      return (data ?? []) as StationDrawing[];
    },
  });

  const map = new Map((statusQ.data ?? []).map((s) => [s.boi_id, s]));
  const revQ = useCommitmentRevisions(stationId, "boi");

  const links = useMemo(
    () => buildBoiLinks(masterQ.data ?? [], drawingsQ.data ?? [], tasks),
    [masterQ.data, drawingsQ.data, tasks],
  );


  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const STATUS_OPTIONS = ["Overdue", "Pending", "Ordered", "In Transit", "Received"];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (masterQ.data ?? []).filter((b) => {
      const s = map.get(b.id);
      if (statusFilter !== "all" && statusChip(b, s).label !== statusFilter) return false;
      if (
        q &&
        !`${b.name} ${b.sl_no} ${s?.remarks ?? ""} ${s?.drawings_status ?? ""} ${s?.inspection_status ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterQ.data, statusQ.data, search, statusFilter]);

  const lifecycleRows = useMemo<BoiLifecycleRow[]>(() => {
    return (masterQ.data ?? []).map((b) => {
      const s = map.get(b.id);
      return {
        scheduled_po_date: b.scheduled_po_date,
        actual_po_date: s?.actual_po_date ?? null,
        delivery_date: s?.delivery_date ?? null,
        site_receipt_date: s?.site_receipt_date ?? null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterQ.data, statusQ.data]);

  const save = useMutation({
    mutationFn: async (row: BoiStatus) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("station_boi_status")
        .upsert({ ...row, updated_by: user?.id ?? null }, { onConflict: "station_id,boi_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boi_status", stationId] });
      qc.invalidateQueries({ queryKey: ["commitment_revisions", "boi", stationId] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <BoiLifecycleChart rows={lifecycleRows} />
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="text-xs text-muted-foreground">
            {visible.length} of {(masterQ.data ?? []).length} items shown
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search equipment / remarks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 text-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {[
                  "SL",
                  "BOI Equipment",
                  "Dwgs",
                  "Sched PO",
                  "Actual PO",
                  "Committed",
                  "Drawings",
                  "Inspection",
                  "Dispatch",
                  "Site Receipt",
                  "Status",
                  "Remarks",
                  "Docs",
                  "Quality Plan",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => {
                const s = map.get(b.id) ?? {
                  station_id: stationId,
                  boi_id: b.id,
                  actual_po_date: null,
                  committed_date: null,
                  delivery_date: null,
                  site_receipt_date: null,
                  mobilization_status: null,
                  drawings_status: null,
                  inspection_status: null,
                  remarks: null,
                };
                const chip = statusChip(b, s);
                return (
                  <BoiRow
                    key={b.id}
                    b={b}
                    s={s}
                    chip={chip}
                    canEdit={canEdit}
                    revisions={revQ.data?.get(b.id)}
                    link={links.get(b.id)}
                    focused={focusId === b.id}
                    onFocusDrawing={onFocusDrawing}
                    onFocusTask={onFocusTask}
                    onSave={(p) => save.mutate({ ...s, ...p })}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BoiRow({
  b,
  s,
  chip,
  canEdit,
  revisions,
  link,
  focused,
  onFocusDrawing,
  onFocusTask,
  onSave,
}: {
  b: Boi;
  s: BoiStatus;
  chip: { label: string; c: string };
  canEdit: boolean;
  revisions?: CommitmentRevision[];
  link?: BoiLink;
  focused?: boolean;
  onFocusDrawing?: (drawingId: string) => void;
  onFocusTask?: (taskId: string) => void;
  onSave: (p: Partial<BoiStatus>) => void;
}) {
  const [local, setLocal] = useState<BoiStatus>(s);
  const dirty = JSON.stringify(local) !== JSON.stringify(s);
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);
  const orderDate = link?.orderFinish ?? null;
  const cell = (k: keyof BoiStatus, type: "date" | "text" = "text", w = "w-32") =>
    type === "date" ? (
      <DatePicker
        disabled={!canEdit}
        className={`h-7 ${w} text-xs`}
        value={(local[k] as string) ?? ""}
        onChange={(v) => {
          const n = { ...local, [k]: v || null };
          setLocal(n);
          onSave(n);
        }}
      />
    ) : (
      <Input
        type={type}
        disabled={!canEdit}
        className={`h-7 ${w} bg-transparent text-xs`}
        value={(local[k] as string) ?? ""}
        onChange={(e) => setLocal({ ...local, [k]: e.target.value || null })}
        onBlur={() => dirty && onSave(local)}
      />
    );
  const select = (k: keyof BoiStatus, opts: string[], w = "w-28") => (
    <Select
      value={(local[k] as string) || "_none"}
      disabled={!canEdit}
      onValueChange={(v) => {
        const n = { ...local, [k]: v === "_none" ? null : v };
        setLocal(n);
        onSave(n);
      }}
    >
      <SelectTrigger className={`h-7 ${w} text-xs`}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o || "_none"} value={o || "_none"}>
            {o || "—"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <tr className="border-b border-border/40 hover:bg-secondary/30">
      <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{b.sl_no}</td>
      <td className="px-2 py-1 font-medium">{b.name}</td>
      <td className="px-2 py-1 text-center font-mono text-[10px]">{b.drawings_count ?? "—"}</td>
      <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{b.scheduled_po_date ?? "—"}</td>
      <td className="px-1 py-1">{cell("actual_po_date", "date", "w-32")}</td>
      <td className="px-1 py-1">
        <div className="flex items-center gap-1">
          {cell("committed_date", "date", "w-32")}
          <CommitmentHistory revisions={revisions} />
        </div>
      </td>
      <td className="px-1 py-1">{select("drawings_status", DRAWING_OPTIONS, "w-28")}</td>
      <td className="px-1 py-1">{select("inspection_status", INSPECTION_OPTIONS, "w-28")}</td>
      <td className="px-1 py-1">{cell("delivery_date", "date", "w-32")}</td>
      <td className="px-1 py-1">{cell("site_receipt_date", "date", "w-32")}</td>
      <td className="px-2 py-1">
        <Badge variant="outline" className="text-[10px]" style={{ color: chip.c, borderColor: chip.c }}>
          {chip.label}
        </Badge>
      </td>
      <td className="px-1 py-1">{cell("remarks", "text", "w-40")}</td>
      <td className="px-1 py-1">
        <DocumentUploads
          kind="boi"
          stationId={s.station_id}
          refId={b.id}
          canEdit={canEdit}
          compact
          category="general"
        />
      </td>
      <td className="px-1 py-1">
        <DocumentUploads
          kind="boi"
          stationId={s.station_id}
          refId={b.id}
          canEdit={canEdit}
          compact
          category="quality_plan"
        />
      </td>
    </tr>
  );
}
