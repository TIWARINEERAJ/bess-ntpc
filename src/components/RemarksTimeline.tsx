import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquarePlus, History } from "lucide-react";
import { toast } from "sonner";

/**
 * Generic, reusable remark history / audit trail for ANY entity in the app.
 * Every saved remark is appended (never overwritten) so the full timeline of
 * previous remarks stays visible. Backed by the `entity_remarks` table.
 */
export type RemarkEntityType =
  | "task"
  | "boi"
  | "drawing"
  | "compliance"
  | "issue"
  | "vendor"
  | "delay"
  | "meeting";

export type EntityRemark = {
  id: string;
  station_id: string;
  entity_type: string;
  entity_id: string;
  remark: string;
  author_name: string | null;
  created_by: string | null;
  created_at: string;
};

const db = supabase as unknown as { from: (t: string) => any; auth: typeof supabase.auth };

export function remarksKey(stationId: string, entityType: string, entityId: string) {
  return ["entity-remarks", stationId, entityType, entityId];
}

export async function fetchRemarks(stationId: string, entityType: string, entityId: string) {
  const { data, error } = await db
    .from("entity_remarks")
    .select("*")
    .eq("station_id", stationId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EntityRemark[];
}

export async function addRemark(args: {
  stationId: string;
  entityType: RemarkEntityType;
  entityId: string;
  remark: string;
}) {
  const { data: u } = await db.auth.getUser();
  const user = u?.user;
  const authorName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    null;
  const { error } = await db.from("entity_remarks").insert({
    station_id: args.stationId,
    entity_type: args.entityType,
    entity_id: args.entityId,
    remark: args.remark.trim(),
    author_name: authorName,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function RemarksTimeline({
  stationId,
  entityType,
  entityId,
  canEdit,
  compact = false,
  onAdded,
}: {
  stationId: string;
  entityType: RemarkEntityType;
  entityId: string | null | undefined;
  canEdit: boolean;
  compact?: boolean;
  /** Optional: keep a legacy single-text column in sync with the latest remark. */
  onAdded?: (latest: string) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const remarksQ = useQuery({
    queryKey: remarksKey(stationId, entityType, entityId ?? ""),
    queryFn: () => fetchRemarks(stationId, entityType, entityId as string),
    enabled: !!entityId,
  });

  const add = useMutation({
    mutationFn: async () => {
      await addRemark({ stationId, entityType, entityId: entityId as string, remark: draft });
    },
    onSuccess: () => {
      const latest = draft.trim();
      setDraft("");
      qc.invalidateQueries({ queryKey: remarksKey(stationId, entityType, entityId ?? "") });
      onAdded?.(latest);
      toast.success("Remark added to trail");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remarks = remarksQ.data ?? [];

  if (!entityId) {
    return <p className="text-[11px] text-muted-foreground">Save this item first to start its remarks trail.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <History className="h-3.5 w-3.5" /> Remarks trail
        {remarks.length > 0 && <span className="text-muted-foreground/70">({remarks.length})</span>}
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={compact ? 2 : 3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a new remark… previous remarks are kept as a timeline"
          />
          <Button
            size="sm"
            className="self-end"
            disabled={!draft.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />}
            Add remark
          </Button>
        </div>
      )}

      <div className="max-h-60 space-y-0 overflow-y-auto">
        {remarksQ.isLoading && <p className="text-[11px] text-muted-foreground">Loading trail…</p>}
        {!remarksQ.isLoading && remarks.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No remarks yet. The first remark you add starts the trail.</p>
        )}
        <ol className="relative space-y-3 border-l border-border/60 pl-4">
          {remarks.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" />
              <div className="rounded-md border border-border/60 bg-card/60 p-2">
                <p className="whitespace-pre-wrap text-xs text-foreground/90">{r.remark}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>{r.author_name ?? "Unknown"}</span>
                  <span title={new Date(r.created_at).toLocaleString()}>{relTime(r.created_at)}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
