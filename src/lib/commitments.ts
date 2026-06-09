import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Committed / promised dates are versioned. The first committed date for an
 * activity / BOI item / compliance item is recorded as R0; every subsequent
 * change becomes R1, R2 … so the slippages an agency commits to over time stay
 * fully auditable. Rows are written automatically by database triggers — the
 * app only ever reads this history.
 */
export type CommitmentEntity = "task" | "boi" | "compliance";

export type CommitmentRevision = {
  id: string;
  station_id: string;
  entity_type: CommitmentEntity;
  entity_id: string;
  revision_no: number;
  committed_date: string;
  created_at: string;
};

/** Calendar-day slip of the latest commitment versus the original R0 (positive = slipped later). */
export function totalSlipDays(revisions: CommitmentRevision[]): number {
  if (revisions.length < 2) return 0;
  return differenceInCalendarDays(
    parseISO(revisions[revisions.length - 1].committed_date),
    parseISO(revisions[0].committed_date),
  );
}

/**
 * Fetch every committed-date revision for one station + entity type in a single
 * query and group them by the entity id (task / boi / compliance id), each list
 * ordered R0 → Rn. Components look up an entity's history from the returned map.
 */
export function useCommitmentRevisions(stationId: string, entityType: CommitmentEntity) {
  return useQuery({
    queryKey: ["commitment_revisions", entityType, stationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("commitment_revisions")
        .select("*")
        .eq("station_id", stationId)
        .eq("entity_type", entityType)
        .order("revision_no");
      if (error) throw error;
      const map = new Map<string, CommitmentRevision[]>();
      for (const r of (data ?? []) as CommitmentRevision[]) {
        const arr = map.get(r.entity_id) ?? [];
        arr.push(r);
        map.set(r.entity_id, arr);
      }
      return map;
    },
    enabled: !!stationId,
  });
}
