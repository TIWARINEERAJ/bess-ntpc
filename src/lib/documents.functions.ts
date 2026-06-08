import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { extractPdfText, chunkText, embedTexts, embedQuery, chatComplete, type ChatMsg } from "@/lib/ai-rag.server";

const BUCKET = "project-docs";

// ---------- Ingest: extract text, chunk, embed, store ----------
export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { documentId } = data;

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("project_documents").select("*").eq("id", documentId).single();
    if (docErr || !doc) throw new Error("Document not found");

    await supabaseAdmin.from("project_documents").update({ status: "processing", error: null }).eq("id", documentId);

    try {
      const { data: file, error: dlErr } = await supabaseAdmin.storage.from(BUCKET).download(doc.file_path);
      if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message ?? "unknown"}`);
      const bytes = new Uint8Array(await file.arrayBuffer());

      let text = "";
      let pages = 0;
      const mime = doc.mime_type ?? "";
      if (mime.includes("pdf") || doc.file_path.toLowerCase().endsWith(".pdf")) {
        const r = await extractPdfText(bytes);
        text = r.text; pages = r.pages;
      } else {
        text = new TextDecoder().decode(bytes);
      }

      const chunks = chunkText(text);
      if (chunks.length === 0) throw new Error("No readable text extracted from this file.");

      // Replace any prior chunks for idempotent re-ingest
      await supabaseAdmin.from("document_chunks").delete().eq("document_id", documentId);

      let inserted = 0;
      const BATCH = 40;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const vectors = await embedTexts(slice);
        const rows = slice.map((content, j) => ({
          document_id: documentId,
          chunk_index: i + j,
          content,
          embedding: JSON.stringify(vectors[j]),
        }));
        const { error: insErr } = await supabaseAdmin.from("document_chunks").insert(rows);
        if (insErr) throw new Error(`Chunk insert failed: ${insErr.message}`);
        inserted += rows.length;
      }

      await supabaseAdmin.from("project_documents")
        .update({ status: "ready", page_count: pages || null, chunk_count: inserted, error: null })
        .eq("id", documentId);

      return { ok: true, chunks: inserted, pages };
    } catch (e) {
      const msg = (e as Error).message;
      await supabaseAdmin.from("project_documents").update({ status: "error", error: msg }).eq("id", documentId);
      throw new Error(msg);
    }
  });

// ---------- Build a compact live DB snapshot for the AI ----------
async function buildProjectSnapshot(supabase: any): Promise<string> {
  const { data: stations } = await supabase.from("stations").select("*").order("sort_order");
  const { data: tasks } = await supabase.from("l2_tasks").select("id,station_id,is_section");
  const { data: statuses } = await supabase.from("station_task_status").select("station_id,task_id,percent_complete,status");
  const { data: delays } = await supabase.from("delay_register").select("station_id,status");
  const { data: issues } = await supabase.from("issues").select("station_id,status");

  const leafByStation = new Map<string, Set<string>>();
  for (const t of tasks ?? []) {
    if (t.is_section) continue;
    if (!leafByStation.has(t.station_id)) leafByStation.set(t.station_id, new Set());
    leafByStation.get(t.station_id)!.add(t.id);
  }
  const stStatus = new Map<string, { sum: number; n: number; delayed: number }>();
  for (const s of statuses ?? []) {
    const leaves = leafByStation.get(s.station_id);
    if (leaves && !leaves.has(s.task_id)) continue;
    const e = stStatus.get(s.station_id) ?? { sum: 0, n: 0, delayed: 0 };
    e.sum += Number(s.percent_complete ?? 0); e.n += 1;
    if (s.status === "delayed") e.delayed += 1;
    stStatus.set(s.station_id, e);
  }
  const countBy = (rows: any[] | null, key: string, open: (r: any) => boolean) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) { if (open(r)) m.set(r[key], (m.get(r[key]) ?? 0) + 1); }
    return m;
  };
  const openDelays = countBy(delays, "station_id", r => r.status !== "resolved" && r.status !== "closed");
  const openIssues = countBy(issues, "station_id", r => r.status !== "resolved");

  const lines = (stations ?? []).map((s: any) => {
    const e = stStatus.get(s.id);
    const leaves = leafByStation.get(s.id)?.size ?? 0;
    const pct = e && e.n ? Math.round(e.sum / e.n) : 0;
    return [
      `Station: ${s.name} (Lot ${s.lot ?? "-"})`,
      `  Capacity: ${s.capacity_mwh ?? "-"} MWh / ${s.capacity_mw ?? "-"} MW; Cost: ₹${s.project_cost_cr ?? "-"} Cr`,
      `  Agency: ${s.agency ?? "-"}; NTPC EIC: ${s.ntpc_eic ?? "-"}; PM: ${s.pm_coordinator ?? "-"}`,
      `  NOA: ${s.noa_date ?? "-"}; Completion: ${s.completion_date ?? "-"}; POI: ${s.poi ?? "-"}`,
      `  Connectivity: ${s.connectivity_status ?? "-"}; Transformer: ${s.transformer_rating ?? "-"} x${s.transformer_qty ?? "-"}`,
      `  Physical progress: ${pct}% across ${leaves} L2 activities; Delayed activities: ${e?.delayed ?? 0}`,
      `  Open hindrances: ${openDelays.get(s.id) ?? 0}; Open issues: ${openIssues.get(s.id) ?? 0}`,
    ].join("\n");
  });
  return `PORTFOLIO: ${stations?.length ?? 0} BESS stations.\n\n${lines.join("\n\n")}`;
}

// ---------- RAG chat ----------
export const askProjectAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    question: z.string().min(1).max(2000),
    history: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(8000),
    })).max(20).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const question = data.question.trim();

    // 1) Retrieve relevant document passages
    let docContext = "";
    const sources: string[] = [];
    try {
      const qVec = await embedQuery(question);
      const { data: matches } = await supabase.rpc("match_document_chunks", {
        query_embedding: JSON.stringify(qVec) as unknown as string,
        match_count: 6,
      });
      if (matches && matches.length) {
        docContext = matches.map((m: any, i: number) =>
          `[Doc ${i + 1}: ${m.document_name}]\n${m.content}`).join("\n\n---\n\n");
        for (const m of matches as any[]) if (!sources.includes(m.document_name)) sources.push(m.document_name);
      }
    } catch (e) {
      // Embeddings/search optional — continue with DB snapshot only
      console.error("RAG retrieval failed:", (e as Error).message);
    }

    // 2) Live database snapshot
    const snapshot = await buildProjectSnapshot(supabase);

    // 3) Compose prompt
    const system: ChatMsg = {
      role: "system",
      content:
        "You are the NTPC BESS Project Assistant. Answer questions about the NTPC Battery Energy Storage portfolio. " +
        "Use the LIVE DATABASE SNAPSHOT for current status, progress, dates, contacts, and costs. " +
        "Use the TENDER/PROJECT DOCUMENT EXCERPTS for contractual, scope, specification, and governance questions. " +
        "Always prefer the live snapshot for numbers like progress %, dates, and counts. " +
        "If the answer is not in the provided context, say so clearly rather than guessing. " +
        "Be concise and use markdown (tables/bullets) where helpful. Quote figures with their station name.",
    };
    const contextMsg: ChatMsg = {
      role: "user",
      content:
        `=== LIVE DATABASE SNAPSHOT ===\n${snapshot}\n\n` +
        (docContext ? `=== TENDER/PROJECT DOCUMENT EXCERPTS ===\n${docContext}\n\n` : "=== NO MATCHING DOCUMENT EXCERPTS ===\n\n") +
        `=== QUESTION ===\n${question}`,
    };

    const history: ChatMsg[] = (data.history ?? []).map(h => ({ role: h.role, content: h.content }));
    const answer = await chatComplete([system, ...history.slice(-8), contextMsg]);

    return { answer, sources };
  });
