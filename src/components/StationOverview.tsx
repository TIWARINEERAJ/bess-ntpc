import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Pencil, Loader2, Plus, Trash2, FileStack, Package } from "lucide-react";
import { toast } from "sonner";
import { fmtD } from "@/lib/gantt-utils";
import { drawingCounts, type StationDrawing } from "@/lib/drawings";

type Contact = { name?: string; role?: string; phone?: string; email?: string };

export type StationRow = {
  id: string;
  name: string;
  lot: string | null;
  capacity_mwh: number | null;
  capacity_mw: number | null;
  poi: string | null;
  agency: string | null;
  agency_contacts: unknown;
  ntpc_eic: string | null;
  eic_contact: string | null;
  eic_email: string | null;
  pm_coordinator: string | null;
  engg_taskforce: string | null;
  noa_date: string | null;
  completion_date: string | null;
  project_start_date: string | null;
  transformer_rating: string | null;
  transformer_qty: number | null;
  project_cost_cr: number | null;
  connectivity_status: string | null;
};

function parseContacts(raw: unknown): Contact[] {
  if (Array.isArray(raw)) return raw as Contact[];
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function StationOverview({ station, canEdit }: { station: StationRow; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const contacts = parseContacts(station.agency_contacts);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Station Details</h2>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit Details
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="space-y-3 p-4">
          <SectionTitle>Project Profile</SectionTitle>
          <Field label="Lot" value={station.lot} />
          <Field label="Capacity" value={[station.capacity_mwh ? `${Number(station.capacity_mwh).toLocaleString()} MWh` : null, station.capacity_mw ? `${Number(station.capacity_mw)} MW` : null].filter(Boolean).join(" · ") || null} />
          <Field label="Project Cost" value={station.project_cost_cr != null ? `₹ ${Number(station.project_cost_cr).toLocaleString()} Cr` : null} highlight />
          <Field label="POI" value={station.poi} />
        </Card>

        <Card className="space-y-3 p-4">
          <SectionTitle>Schedule</SectionTitle>
          <Field label="Project Start" value={fmtD(station.project_start_date)} />
          <Field label="NOA Date" value={fmtD(station.noa_date)} />
          <Field label="Completion Date" value={fmtD(station.completion_date)} highlight />
        </Card>

        <Card className="space-y-3 p-4">
          <SectionTitle>Connectivity & Transformer</SectionTitle>
          <Field label="Connectivity Status" value={station.connectivity_status} multiline />
          <Field label="Transformer Rating" value={station.transformer_rating} />
          <Field label="Transformer Qty" value={station.transformer_qty != null ? String(station.transformer_qty) : null} />
        </Card>

        <Card className="space-y-3 p-4">
          <SectionTitle>NTPC Team</SectionTitle>
          <Field label="EIC" value={station.ntpc_eic} />
          <Field label="EIC Contact" value={station.eic_contact} />
          <Field label="EIC Email" value={station.eic_email} />
          <Field label="PM / Coordinator" value={station.pm_coordinator} />
          <Field label="Engg. Taskforce" value={station.engg_taskforce} />
        </Card>

        <Card className="space-y-3 p-4 md:col-span-2">
          <SectionTitle>Agency & Contacts</SectionTitle>
          <Field label="Agency" value={station.agency} />
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No agency contacts recorded.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c, i) => (
                <div key={i} className="rounded-md border border-border/60 bg-secondary/30 p-2 text-xs">
                  <div className="font-medium">{c.name || "—"}{c.role ? <span className="ml-1 text-muted-foreground">· {c.role}</span> : null}</div>
                  <div className="mt-0.5 text-muted-foreground">{[c.phone, c.email].filter(Boolean).join("  ·  ") || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <EditDetailsSheet station={station} contacts={contacts} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">{children}</div>;
}

function Field({ label, value, highlight, multiline }: { label: string; value: string | null | undefined; highlight?: boolean; multiline?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-right text-xs ${highlight ? "font-semibold text-primary" : "text-foreground/90"} ${multiline ? "max-w-[60%]" : ""}`}>{value && value !== "—" ? value : "—"}</span>
    </div>
  );
}

function EditDetailsSheet({ station, contacts, onClose }: { station: StationRow; contacts: Contact[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    agency: station.agency ?? "",
    ntpc_eic: station.ntpc_eic ?? "",
    eic_contact: station.eic_contact ?? "",
    eic_email: station.eic_email ?? "",
    pm_coordinator: station.pm_coordinator ?? "",
    engg_taskforce: station.engg_taskforce ?? "",
    noa_date: station.noa_date ?? "",
    completion_date: station.completion_date ?? "",
    transformer_rating: station.transformer_rating ?? "",
    transformer_qty: station.transformer_qty != null ? String(station.transformer_qty) : "",
    project_cost_cr: station.project_cost_cr != null ? String(station.project_cost_cr) : "",
    poi: station.poi ?? "",
    connectivity_status: station.connectivity_status ?? "",
  });
  const [list, setList] = useState<Contact[]>(contacts);

  useEffect(() => { setList(contacts); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      const cleaned = list.filter(c => (c.name || c.role || c.phone || c.email));
      const { error } = await supabase.from("stations").update({
        agency: form.agency || null,
        ntpc_eic: form.ntpc_eic || null,
        eic_contact: form.eic_contact || null,
        eic_email: form.eic_email || null,
        pm_coordinator: form.pm_coordinator || null,
        engg_taskforce: form.engg_taskforce || null,
        noa_date: form.noa_date || null,
        completion_date: form.completion_date || null,
        transformer_rating: form.transformer_rating || null,
        transformer_qty: form.transformer_qty ? Number(form.transformer_qty) : null,
        project_cost_cr: form.project_cost_cr ? Number(form.project_cost_cr) : null,
        poi: form.poi || null,
        connectivity_status: form.connectivity_status || null,
        agency_contacts: cleaned,
      }).eq("id", station.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["station", station.id] });
      qc.invalidateQueries({ queryKey: ["stations"] });
      toast.success("Station details saved");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setC = (i: number, key: keyof Contact, v: string) => {
    setList(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: v } : c));
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Edit {station.name} Details</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-4 px-4 pb-10">
          <Two>
            <FormField label="Agency" value={form.agency} onChange={v => setForm({ ...form, agency: v })} />
            <FormField label="Project Cost (₹ Cr)" type="number" value={form.project_cost_cr} onChange={v => setForm({ ...form, project_cost_cr: v })} />
          </Two>
          <Two>
            <FormField label="NOA Date" type="date" value={form.noa_date} onChange={v => setForm({ ...form, noa_date: v })} />
            <FormField label="Completion Date" type="date" value={form.completion_date} onChange={v => setForm({ ...form, completion_date: v })} />
          </Two>
          <Two>
            <FormField label="Transformer Rating" value={form.transformer_rating} onChange={v => setForm({ ...form, transformer_rating: v })} />
            <FormField label="Transformer Qty" type="number" value={form.transformer_qty} onChange={v => setForm({ ...form, transformer_qty: v })} />
          </Two>
          <FormField label="POI" value={form.poi} onChange={v => setForm({ ...form, poi: v })} />
          <div>
            <Label>Connectivity Status</Label>
            <Textarea rows={2} value={form.connectivity_status} onChange={e => setForm({ ...form, connectivity_status: e.target.value })} placeholder="e.g. CTU connectivity granted; bay under construction" />
          </div>

          <div className="rounded-md border border-border/60 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">NTPC Team</div>
            <div className="mt-2 space-y-3">
              <FormField label="EIC" value={form.ntpc_eic} onChange={v => setForm({ ...form, ntpc_eic: v })} />
              <Two>
                <FormField label="EIC Contact" value={form.eic_contact} onChange={v => setForm({ ...form, eic_contact: v })} />
                <FormField label="EIC Email" value={form.eic_email} onChange={v => setForm({ ...form, eic_email: v })} />
              </Two>
              <Two>
                <FormField label="PM / Coordinator" value={form.pm_coordinator} onChange={v => setForm({ ...form, pm_coordinator: v })} />
                <FormField label="Engg. Taskforce" value={form.engg_taskforce} onChange={v => setForm({ ...form, engg_taskforce: v })} />
              </Two>
            </div>
          </div>

          <div className="rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Agency Contacts</div>
              <Button size="sm" variant="ghost" onClick={() => setList(prev => [...prev, {}])}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
            </div>
            <div className="mt-2 space-y-3">
              {list.length === 0 && <p className="text-xs text-muted-foreground">No contacts. Click Add to create one.</p>}
              {list.map((c, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border/40 bg-secondary/20 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Contact {i + 1}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setList(prev => prev.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Two>
                    <FormField label="Name" value={c.name ?? ""} onChange={v => setC(i, "name", v)} />
                    <FormField label="Role" value={c.role ?? ""} onChange={v => setC(i, "role", v)} />
                  </Two>
                  <Two>
                    <FormField label="Phone" value={c.phone ?? ""} onChange={v => setC(i, "phone", v)} />
                    <FormField label="Email" value={c.email ?? ""} onChange={v => setC(i, "email", v)} />
                  </Two>
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Details
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function FormField({ label, value, onChange, type }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
