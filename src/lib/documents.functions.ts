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

// ---------- Build a comprehensive live DB snapshot for the AI ----------
const PAGE = 1000;
async function fetchAll(supabase: any, table: string, columns: string, order?: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    if (order) q = q.order(order);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) break;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const openIssue = (r: any) => r.status !== "resolved" && r.status !== "closed";
const d = (v: any) => (v ? String(v).slice(0, 10) : "-");

async function buildProjectSnapshot(supabase: any): Promise<string> {
  const [
    stations, tasks, statuses, delays, issues,
    boiMaster, boiStatus, drawings, compliance, complianceMaster, remarks, meetings,
  ] = await Promise.all([
    fetchAll(supabase, "stations", "*", "sort_order"),
    fetchAll(supabase, "l2_tasks", "id,station_id,name,wbs_code,is_section,baseline_start,baseline_finish,duration_days,predecessors", "sort_order"),
    fetchAll(supabase, "station_task_status", "station_id,task_id,percent_complete,status,actual_start,actual_finish,committed_date,owner,remarks,updated_at"),
    fetchAll(supabase, "delay_register", "station_id,title,status,reason_category,responsibility,root_cause,corrective_action,recovery_date"),
    fetchAll(supabase, "issues", "station_id,title,description,severity,status,owner,target_date,created_at"),
    fetchAll(supabase, "boi_master", "id,station_id,name,inspection_category,scheduled_po_date,sort_order"),
    fetchAll(supabase, "station_boi_status", "station_id,boi_id,actual_po_date,delivery_date,site_receipt_date,committed_date,expected_delivery_date,oem_name,inspection_status,drawings_status,sub_vendor_category,remarks"),
    fetchAll(supabase, "station_drawings", "station_id,drg_ref,drg_desc,category,cat,boi_name,sch_date,submitted_date,sch_apprvl_date,approved_date,resubmitted_date"),
    fetchAll(supabase, "station_compliance", "station_id,compliance_id,status,application_date,approval_date,expiry_date,owner,remarks"),
    fetchAll(supabase, "compliance_master", "id,name,category,authority"),
    fetchAll(supabase, "entity_remarks", "station_id,entity_type,entity_id,remark,author_name,created_at"),
    fetchAll(supabase, "meetings", "station_id,meeting_type,meeting_date,agenda,action_items,minutes,next_meeting_date"),
  ]);

  const byStation = <T extends { station_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const a = m.get(r.station_id) ?? []; a.push(r); m.set(r.station_id, a); }
    return m;
  };
  const tasksByStation = byStation(tasks);
  const statusByTask = new Map(statuses.map((s: any) => [`${s.station_id}::${s.task_id}`, s]));
  const delaysByStation = byStation(delays);
  const issuesByStation = byStation(issues);
  const boiByStation = byStation(boiMaster);
  const boiStatusMap = new Map(boiStatus.map((b: any) => [`${b.station_id}::${b.boi_id}`, b]));
  const dwgByStation = byStation(drawings);
  const compByStation = byStation(compliance);
  const compName = new Map(complianceMaster.map((c: any) => [c.id, c]));
  const remarksByStation = byStation(remarks);
  const meetingsByStation = byStation(meetings);
  const taskName = new Map(tasks.map((t: any) => [t.id, t.name]));

  const today = new Date().toISOString().slice(0, 10);

  const blocks = stations.map((s: any) => {
    const sTasks = (tasksByStation.get(s.id) ?? []).filter((t: any) => !t.is_section);
    let sum = 0, done = 0, delayed = 0, notStarted = 0;
    const late: string[] = [];
    for (const t of sTasks) {
      const st: any = statusByTask.get(`${s.id}::${t.id}`);
      const pct = Number(st?.percent_complete ?? 0);
      sum += pct;
      if (pct >= 100 || st?.status === "completed") done += 1;
      else if (st?.status === "delayed") delayed += 1;
      else if (!st || st.status === "not_started") notStarted += 1;
      const slipping = pct < 100 && t.baseline_finish && t.baseline_finish < today;
      if (slipping && late.length < 25) {
        late.push(`    - ${t.wbs_code ?? ""} ${t.name} | baseline ${d(t.baseline_start)}→${d(t.baseline_finish)} | actual ${d(st?.actual_start)}→${d(st?.actual_finish)} | ${pct}% | ${st?.status ?? "not_started"}${st?.owner ? ` | owner ${st.owner}` : ""}${st?.remarks ? ` | ${String(st.remarks).slice(0, 140)}` : ""}`);
      }
    }
    const pctAvg = sTasks.length ? Math.round(sum / sTasks.length) : 0;

    // BOI
    const bois = boiByStation.get(s.id) ?? [];
    let po = 0, del = 0, rec = 0;
    const boiLines: string[] = [];
    for (const b of bois) {
      const c: any = boiStatusMap.get(`${s.id}::${b.id}`);
      if (c?.actual_po_date) po += 1;
      if (c?.delivery_date) del += 1;
      if (c?.site_receipt_date) rec += 1;
      boiLines.push(`    - ${b.name}${b.inspection_category ? ` [${b.inspection_category}]` : ""} | sch PO ${d(b.scheduled_po_date)} | PO ${d(c?.actual_po_date)} | delivered ${d(c?.delivery_date)} | received ${d(c?.site_receipt_date)}${c?.expected_delivery_date ? ` | exp delivery ${d(c.expected_delivery_date)}` : ""}${c?.oem_name ? ` | OEM ${c.oem_name}` : ""}${c?.sub_vendor_category ? ` | sub-vendor ${c.sub_vendor_category}` : ""}${c?.remarks ? ` | ${String(c.remarks).slice(0, 120)}` : ""}`);
    }

    // MDL drawings by category
    const dwgs = dwgByStation.get(s.id) ?? [];
    const catAgg = new Map<string, { t: number; sub: number; app: number }>();
    for (const w of dwgs) {
      const k = (w.category || "Uncategorised").trim();
      const e = catAgg.get(k) ?? { t: 0, sub: 0, app: 0 };
      e.t += 1;
      if (w.submitted_date || w.resubmitted_date) e.sub += 1;
      if (w.approved_date) e.app += 1;
      catAgg.set(k, e);
    }
    const overdueDwgs = dwgs
      .filter((w: any) => !w.approved_date && w.sch_apprvl_date && w.sch_apprvl_date < today)
      .slice(0, 25)
      .map((w: any) => `    - ${w.drg_ref} ${String(w.drg_desc ?? "").slice(0, 80)} | ${w.category} | sch sub ${d(w.sch_date)} sub ${d(w.submitted_date)} | sch appr ${d(w.sch_apprvl_date)} appr ${d(w.approved_date)}`);

    const sDelays = (delaysByStation.get(s.id) ?? []).filter(openIssue);
    const sIssues = (issuesByStation.get(s.id) ?? []).filter((r: any) => r.status !== "resolved" && r.status !== "closed");
    const sComp = compByStation.get(s.id) ?? [];
    const sRemarks = [...(remarksByStation.get(s.id) ?? [])]
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 15);
    const sMeetings = [...(meetingsByStation.get(s.id) ?? [])]
      .sort((a: any, b: any) => String(b.meeting_date).localeCompare(String(a.meeting_date)))
      .slice(0, 3);

    return [
      `=== STATION: ${s.name} (Lot ${s.lot ?? "-"}) [id ${s.id}] ===`,
      `  Capacity: ${s.capacity_mwh ?? "-"} MWh / ${s.capacity_mw ?? "-"} MW; Cost: ₹${s.project_cost_cr ?? "-"} Cr`,
      `  Agency: ${s.agency ?? "-"}; NTPC EIC: ${s.ntpc_eic ?? "-"} (${s.eic_contact ?? "-"}); PM: ${s.pm_coordinator ?? "-"}`,
      `  NOA: ${d(s.noa_date)}; Start: ${d(s.project_start_date)}; Completion: ${d(s.completion_date)}; POI: ${s.poi ?? "-"}`,
      `  Connectivity: ${s.connectivity_status ?? "-"}; Transformer: ${s.transformer_rating ?? "-"} x${s.transformer_qty ?? "-"}`,
      `  L2 SCHEDULE: ${pctAvg}% avg across ${sTasks.length} activities — ${done} completed, ${delayed} delayed, ${notStarted} not started`,
      late.length ? `  L2 SLIPPING/OVERDUE ACTIVITIES (baseline finish past, not complete):\n${late.join("\n")}` : `  No overdue L2 activities.`,
      `  BOI: ${bois.length} items — PO ${po}, delivered ${del}, received ${rec}`,
      boiLines.length ? `  BOI ITEM DETAIL:\n${boiLines.join("\n")}` : "",
      `  MDL DRAWINGS: ${dwgs.length} total — submitted ${dwgs.filter((w: any) => w.submitted_date || w.resubmitted_date).length}, approved ${dwgs.filter((w: any) => w.approved_date).length}`,
      `  MDL BY CATEGORY: ${Array.from(catAgg.entries()).map(([k, v]) => `${k}: ${v.app}/${v.sub}/${v.t} (appr/sub/total)`).join("; ") || "-"}`,
      overdueDwgs.length ? `  MDL APPROVAL OVERDUE:\n${overdueDwgs.join("\n")}` : "",
      sIssues.length ? `  OPEN ISSUES (${sIssues.length}):\n${sIssues.slice(0, 20).map((i: any) => `    - [${i.severity}] ${i.title}${i.owner ? ` (owner ${i.owner})` : ""}${i.target_date ? ` target ${d(i.target_date)}` : ""}${i.description ? ` — ${String(i.description).slice(0, 200)}` : ""}`).join("\n")}` : "  No open issues.",
      sDelays.length ? `  OPEN HINDRANCES (${sDelays.length}):\n${sDelays.slice(0, 20).map((x: any) => `    - ${x.title}${x.task_id ? ` [task: ${taskName.get(x.task_id) ?? ""}]` : ""} | cause ${x.root_cause ?? x.reason_category ?? "-"} | resp ${x.responsibility ?? "-"} | recovery ${d(x.recovery_date)}`).join("\n")}` : "  No open hindrances.",
      sComp.length ? `  STATUTORY COMPLIANCE: ${sComp.map((c: any) => `${compName.get(c.compliance_id)?.name ?? c.compliance_id}=${c.status}${c.approval_date ? ` (appr ${d(c.approval_date)})` : ""}`).join("; ")}` : "",
      sRemarks.length ? `  LATEST REMARKS / STATUS NOTES:\n${sRemarks.map((r: any) => `    - [${d(r.created_at)}] (${r.entity_type}${r.entity_type === "task" ? `: ${taskName.get(r.entity_id) ?? ""}` : ""}) ${String(r.remark).slice(0, 300)}${r.author_name ? ` — ${r.author_name}` : ""}`).join("\n")}` : "",
      sMeetings.length ? `  RECENT MEETINGS:\n${sMeetings.map((m: any) => `    - ${d(m.meeting_date)} ${m.meeting_type}${m.action_items ? ` | actions: ${String(m.action_items).slice(0, 300)}` : ""}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
  });

  const totals = [
    `PORTFOLIO SNAPSHOT (generated ${today}): ${stations.length} BESS stations`,
    `Totals — L2 activities: ${tasks.filter((t: any) => !t.is_section).length}; BOI items: ${boiMaster.length}; MDL drawings: ${drawings.length} (approved ${drawings.filter((w: any) => w.approved_date).length}); open issues: ${issues.filter((i: any) => i.status !== "resolved" && i.status !== "closed").length}; open hindrances: ${delays.filter(openIssue).length}; remarks logged: ${remarks.length}`,
  ].join("\n");

  return `${totals}\n\n${blocks.join("\n\n")}`;
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
        "You are the NTPC BESS Platform AI Assistant with full awareness of the entire project database. " +
        "The LIVE DATABASE SNAPSHOT below contains the complete, latest state of every station: L2 schedule activities " +
        "(baseline vs actual dates, % complete, owners, overdue/slipping items), BOI procurement items (scheduled PO, " +
        "actual PO, delivery, site receipt, sub-vendor), MDL drawings (per category, submitted/approved/overdue), " +
        "statutory compliance, open issues, hindrances, meetings, and the full remarks trail. " +
        "Answer any question about progress, dates, deviations, counts, owners, or bottlenecks directly from it, and " +
        "compute roll-ups/comparisons across stations when asked. " +
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
