import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

type Boi = { id: string; sl_no: number; name: string; drawings_count: number | null; scheduled_po_date: string | null; inspection_category: string | null };
type BoiStatus = { id?: string; station_id: string; boi_id: string; actual_po_date: string | null; sub_vendor_category: string | null; sub_vendor_details: string | null; delivery_date: string | null; site_receipt_date: string | null; mobilization_status: string | null; remarks: string | null };

function statusChip(b: Boi, s: BoiStatus | undefined) {
  if (!s?.actual_po_date) {
    if (b.scheduled_po_date && differenceInCalendarDays(new Date(), parseISO(b.scheduled_po_date)) > 0) return { label: "Overdue", c: "var(--status-red)" };
    return { label: "Pending", c: "var(--status-amber)" };
  }
  if (s.site_receipt_date) return { label: "Received", c: "var(--status-green)" };
  if (s.delivery_date) return { label: "In Transit", c: "var(--status-blue)" };
  return { label: "Ordered", c: "var(--status-blue)" };
}

export function BoiStatusTab({ stationId, canEdit }: { stationId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const masterQ = useQuery({ queryKey: ["boi_master"], queryFn: async () => {
    const { data, error } = await supabase.from("boi_master").select("*").order("sort_order");
    if (error) throw error; return data as Boi[];
  }});
  const statusQ = useQuery({ queryKey: ["boi_status", stationId], queryFn: async () => {
    const { data, error } = await supabase.from("station_boi_status").select("*").eq("station_id", stationId);
    if (error) throw error; return data as BoiStatus[];
  }});

  const map = new Map((statusQ.data ?? []).map(s => [s.boi_id, s]));

  const save = useMutation({
    mutationFn: async (row: BoiStatus) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("station_boi_status").upsert({ ...row, updated_by: user?.id ?? null }, { onConflict: "station_id,boi_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["boi_status", stationId] }); qc.invalidateQueries({ queryKey: ["notifications"] }); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {["SL", "BOI Equipment", "Dwgs", "Sched PO", "Actual PO", "Sub-Vendor Cat", "Sub-Vendor", "Insp.", "Delivery", "Site Receipt", "Mobilization", "Status", "Remarks"].map(h =>
                <th key={h} className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(masterQ.data ?? []).map(b => {
              const s = map.get(b.id) ?? { station_id: stationId, boi_id: b.id, actual_po_date: null, sub_vendor_category: null, sub_vendor_details: null, delivery_date: null, site_receipt_date: null, mobilization_status: null, remarks: null };
              const chip = statusChip(b, s);
              return <BoiRow key={b.id} b={b} s={s} chip={chip} canEdit={canEdit} onSave={(p) => save.mutate({ ...s, ...p })} />;
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BoiRow({ b, s, chip, canEdit, onSave }: { b: Boi; s: BoiStatus; chip: { label: string; c: string }; canEdit: boolean; onSave: (p: Partial<BoiStatus>) => void }) {
  const [local, setLocal] = useState<BoiStatus>(s);
  const dirty = JSON.stringify(local) !== JSON.stringify(s);
  const cell = (k: keyof BoiStatus, type: "date" | "text" = "text", w = "w-32") => (
    <Input type={type} disabled={!canEdit} className={`h-7 ${w} bg-transparent text-xs`} value={(local[k] as string) ?? ""}
      onChange={e => setLocal({ ...local, [k]: e.target.value || null })}
      onBlur={() => dirty && onSave(local)} />
  );
  return (
    <tr className="border-b border-border/40 hover:bg-secondary/30">
      <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{b.sl_no}</td>
      <td className="px-2 py-1 font-medium">{b.name}</td>
      <td className="px-2 py-1 text-center font-mono text-[10px]">{b.drawings_count ?? "—"}</td>
      <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{b.scheduled_po_date ?? "—"}</td>
      <td className="px-1 py-1">{cell("actual_po_date", "date", "w-32")}</td>
      <td className="px-1 py-1">{cell("sub_vendor_category", "text", "w-20")}</td>
      <td className="px-1 py-1">{cell("sub_vendor_details", "text", "w-36")}</td>
      <td className="px-2 py-1 text-center text-[10px]" style={{ color: "var(--primary)" }}>{b.inspection_category ?? "—"}</td>
      <td className="px-1 py-1">{cell("delivery_date", "date", "w-32")}</td>
      <td className="px-1 py-1">{cell("site_receipt_date", "date", "w-32")}</td>
      <td className="px-1 py-1">{cell("mobilization_status", "text", "w-28")}</td>
      <td className="px-2 py-1"><Badge variant="outline" className="text-[10px]" style={{ color: chip.c, borderColor: chip.c }}>{chip.label}</Badge></td>
      <td className="px-1 py-1">{cell("remarks", "text", "w-40")}</td>
    </tr>
  );
}
