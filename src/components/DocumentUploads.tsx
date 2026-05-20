import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, FileText, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

type Kind = "boi" | "compliance";
type Doc = { id: string; station_id: string; file_path: string; file_name: string; file_size: number | null; mime_type: string | null; created_at: string };

export function DocumentUploads({ kind, stationId, refId, canEdit, compact = false }: { kind: Kind; stationId: string; refId: string; canEdit: boolean; compact?: boolean }) {
  const qc = useQueryClient();
  const table = kind === "boi" ? "boi_documents" : "compliance_documents";
  const fkCol = kind === "boi" ? "boi_id" : "compliance_id";
  const key = ["docs", kind, stationId, refId];
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const qb = supabase.from(table).select("*").eq("station_id", stationId);
      const { data, error } = await (kind === "boi" ? qb.eq("boi_id", refId) : qb.eq("compliance_id", refId)).order("created_at", { ascending: false });
      if (error) throw error; return data as Doc[];
    },
  });

  const docs = q.data ?? [];

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (docs.length >= 3) { toast.error("Maximum 3 documents allowed"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Max 10 MB per file"); return; }
    setUploading(true);
    try {
      const path = `${kind}/${stationId}/${refId}/${Date.now()}_${f.name}`;
      const { error: upErr } = await supabase.storage.from("station-docs").upload(path, f, { contentType: f.type });
      if (upErr) throw upErr;
      const { data: { user } } = await supabase.auth.getUser();
      const insertRow: Record<string, unknown> = {
        station_id: stationId, [fkCol]: refId,
        file_path: path, file_name: f.name, file_size: f.size, mime_type: f.type,
        uploaded_by: user?.id ?? null,
      };
      const { error: insErr } = await supabase.from(table).insert(insertRow);
      if (insErr) { await supabase.storage.from("station-docs").remove([path]); throw insErr; }
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const del = useMutation({
    mutationFn: async (d: Doc) => {
      await supabase.storage.from("station-docs").remove([d.file_path]);
      const { error } = await supabase.from(table).delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const download = async (d: Doc) => {
    const { data, error } = await supabase.storage.from("station-docs").createSignedUrl(d.file_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className={compact ? "flex items-center gap-1" : "space-y-1"}>
      {docs.map(d => (
        <div key={d.id} className="flex items-center gap-1 rounded bg-secondary/50 px-1.5 py-0.5 text-[10px]">
          <FileText className="h-3 w-3 text-primary" />
          <button onClick={() => download(d)} className="max-w-[120px] truncate hover:underline" title={d.file_name}>{d.file_name}</button>
          <button onClick={() => download(d)} className="text-muted-foreground hover:text-foreground"><Download className="h-3 w-3" /></button>
          {canEdit && <button onClick={() => del.mutate(d)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>}
        </div>
      ))}
      {canEdit && docs.length < 3 && (
        <>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Paperclip className="mr-1 h-3 w-3" />}
            Upload
          </Button>
          <input ref={fileInput} type="file" className="hidden" onChange={onPick} />
        </>
      )}
      {docs.length === 0 && !canEdit && <span className="text-[10px] text-muted-foreground">—</span>}
    </div>
  );
}
