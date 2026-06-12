import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/DatePicker";

type VendorRow = {
  id: string;
  station_id: string;
  package: string;
  vendor_name: string | null;
  sort_order: number;
  docs_submitted: string | null;
  engg_approved: string | null;
  cqa_approved: string | null;
  final_approved: string | null;
  remarks: string | null;
};

function stageChip(v: VendorRow): { label: string; c: string } {
  if (v.final_approved) return { label: "Final Approved", c: "var(--status-green)" };
  if (v.cqa_approved) return { label: "CQA Approved", c: "var(--status-blue)" };
  if (v.engg_approved) return { label: "Engg Approved", c: "var(--status-blue)" };
  if (v.docs_submitted) return { label: "Docs Submitted", c: "var(--status-amber)" };
  return { label: "Not Started", c: "var(--status-grey)" };
}

export function VendorApprovalTab({ stationId, canEdit }: { stationId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const vendorsQ = useQuery({
    queryKey: ["vendor_status", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station_vendor_status")
        .select("*")
        .eq("station_id", stationId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as VendorRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (row: VendorRow) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("station_vendor_status")
        .update({
          vendor_name: row.vendor_name,
          docs_submitted: row.docs_submitted,
          engg_approved: row.engg_approved,
          cqa_approved: row.cqa_approved,
          final_approved: row.final_approved,
          remarks: row.remarks,
          updated_by: user?.id ?? null,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_status", stationId] });
      qc.invalidateQueries({ queryKey: ["all_vendor_status"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = vendorsQ.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-dashed bg-secondary/20 p-3 text-xs text-muted-foreground">
        Provenness / vendor approval chain — the documented critical-path bottleneck for NTPC BESS packages.
        Each package advances through <b>Docs Submitted → Engg Approved → CQA Approved → Final Approved</b>.
        This feeds the <b>Vendor Approval (15%)</b> weight in the station readiness score.
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Package", "Vendor / OEM", "Docs Submitted", "Engg Approved", "CQA Approved", "Final Approved", "Stage", "Remarks"].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-border px-2 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <VendorRowEditor key={v.id} v={v} canEdit={canEdit} onSave={(p) => save.mutate({ ...v, ...p })} />
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No vendor packages configured for this station.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function VendorRowEditor({ v, canEdit, onSave }: { v: VendorRow; canEdit: boolean; onSave: (p: Partial<VendorRow>) => void }) {
  const [local, setLocal] = useState<VendorRow>(v);
  const chip = stageChip(local);
  const date = (k: keyof VendorRow) => (
    <DatePicker
      disabled={!canEdit}
      className="h-7 w-32 text-xs"
      value={(local[k] as string) ?? ""}
      onChange={(val) => {
        const n = { ...local, [k]: val || null };
        setLocal(n);
        onSave(n);
      }}
    />
  );
  return (
    <tr className="border-b border-border/40 hover:bg-secondary/30">
      <td className="px-2 py-1 font-medium">{v.package}</td>
      <td className="px-1 py-1">
        <Input
          disabled={!canEdit}
          className="h-7 w-40 bg-transparent text-xs"
          placeholder="e.g. CATL / Sungrow…"
          value={local.vendor_name ?? ""}
          onChange={(e) => setLocal({ ...local, vendor_name: e.target.value || null })}
          onBlur={() => JSON.stringify(local) !== JSON.stringify(v) && onSave(local)}
        />
      </td>
      <td className="px-1 py-1">{date("docs_submitted")}</td>
      <td className="px-1 py-1">{date("engg_approved")}</td>
      <td className="px-1 py-1">{date("cqa_approved")}</td>
      <td className="px-1 py-1">{date("final_approved")}</td>
      <td className="px-2 py-1">
        <Badge variant="outline" className="text-[10px]" style={{ color: chip.c, borderColor: chip.c }}>{chip.label}</Badge>
      </td>
      <td className="px-1 py-1">
        <Input
          disabled={!canEdit}
          className="h-7 w-44 bg-transparent text-xs"
          value={local.remarks ?? ""}
          onChange={(e) => setLocal({ ...local, remarks: e.target.value || null })}
          onBlur={() => JSON.stringify(local) !== JSON.stringify(v) && onSave(local)}
        />
      </td>
    </tr>
  );
}
