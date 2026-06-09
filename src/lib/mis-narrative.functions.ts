import { createServerFn } from "@tanstack/react-start";

export type MisNarrative = {
  executiveSummary: string;
  keyInsights: string[];
  risks: string[];
  recommendations: string[];
  outlook: string;
};

/**
 * Compact, JSON-serializable snapshot of portfolio status that the dashboard
 * computes client-side and sends to the AI for narrative generation.
 */
export type MisNarrativeInput = {
  asOf: string;
  totals: {
    stations: number;
    totalMWh: number;
    avgProgress: number;
    idealProgress: number;
    daysBehind: number;
    forecastOverrunDays: number;
    onTrack: number;
    atRisk: number;
    delayed: number;
  };
  stations: Array<{
    name: string;
    agency: string;
    pct: number;
    ideal: number;
    delayed: number;
    forecastOverrunDays: number;
    health: string;
  }>;
  exceptions: {
    l2Overdue: number;
    drawingsOverdue: number;
    boiOverdue: number;
    compliancePending: number;
  };
  remarks: string[];
  delays: Array<{ station: string; title: string; rootCause: string; corrective: string }>;
  issues: Array<{ station: string; title: string; severity: string; status: string }>;
};

function fallback(input: MisNarrativeInput): MisNarrative {
  const t = input.totals;
  return {
    executiveSummary:
      `As of ${input.asOf}, the BESS portfolio of ${t.stations} stations (${t.totalMWh.toLocaleString()} MWh) ` +
      `stands at ${t.avgProgress}% average physical progress against an ideal/baseline of ${t.idealProgress}%, ` +
      `tracking approximately ${Math.abs(t.daysBehind)} days ${t.daysBehind >= 0 ? "behind" : "ahead of"} schedule. ` +
      `${t.onTrack} stations are on track, ${t.atRisk} at risk and ${t.delayed} delayed.`,
    keyInsights: [
      `Schedule variance: ${t.avgProgress - t.idealProgress}% vs baseline.`,
      `${input.exceptions.l2Overdue} L2 activities, ${input.exceptions.drawingsOverdue} drawings and ${input.exceptions.boiOverdue} BOI items are overdue.`,
      `${input.exceptions.compliancePending} statutory compliance items remain pending.`,
    ],
    risks: input.stations.filter((s) => s.health === "red").slice(0, 5).map((s) => `${s.name}: ${s.delayed} delayed activities.`),
    recommendations: [
      "Prioritise recovery plans for delayed stations and expedite overdue drawing submissions.",
      "Escalate overdue BOI purchase orders to protect downstream installation windows.",
    ],
    outlook:
      t.daysBehind > 0
        ? `The portfolio is currently tracking approximately ${t.daysBehind} days behind the baseline schedule. Focus on recovery actions to close the gap.`
        : `The portfolio is currently tracking on or ahead of the baseline schedule.`,
  };
}

export const generateMisNarrative = createServerFn({ method: "POST" })
  .inputValidator((input: MisNarrativeInput) => input)
  .handler(async ({ data }): Promise<MisNarrative> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallback(data);

    const prompt = `You are a senior project controls analyst preparing the executive narrative for a weekly MIS report covering NTPC's portfolio of Battery Energy Storage System (BESS) projects co-located at thermal stations.

Analyse the structured status data below and write a crisp, board-ready narrative. Be specific, quantitative and reference station names. Highlight schedule variance (actual vs ideal/baseline progress), the biggest risks (from delayed stations, overdue drawings/BOI, pending compliance) and what the engineering remarks/delay root-causes reveal.

Return ONLY valid JSON with this exact shape (no markdown, no code fences):
{
  "executiveSummary": "2-3 short paragraphs as a single string with \\n\\n between paragraphs",
  "keyInsights": ["3-5 short bullet strings"],
  "risks": ["3-5 short bullet strings, most critical first"],
  "recommendations": ["3-5 short actionable bullet strings"],
  "outlook": "1 short paragraph on the completion outlook"
}

STATUS DATA (JSON):
${JSON.stringify(data)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a precise project controls analyst. Output only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (res.status === 429) {
      throw new Error("AI rate limit reached — please wait a moment and try again.");
    }
    if (res.status === 402) {
      throw new Error("AI credits exhausted — add credits in workspace settings to continue.");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("AI narrative gateway error", res.status, body);
      throw new Error(`AI service error (${res.status}). Please try again.`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error("AI narrative: no JSON found in response", content.slice(0, 200));
      return fallback(data);
    }
    let parsed: Partial<MisNarrative>;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<MisNarrative>;
    } catch {
      return fallback(data);
    }

    return {
      executiveSummary: parsed.executiveSummary || fallback(data).executiveSummary,
      keyInsights: Array.isArray(parsed.keyInsights) && parsed.keyInsights.length ? parsed.keyInsights : fallback(data).keyInsights,
      risks: Array.isArray(parsed.risks) && parsed.risks.length ? parsed.risks : fallback(data).risks,
      recommendations: Array.isArray(parsed.recommendations) && parsed.recommendations.length ? parsed.recommendations : fallback(data).recommendations,
      outlook: parsed.outlook || fallback(data).outlook,
    };
  });
