// Server-only RAG helpers: PDF text extraction, chunking, embeddings and chat
// via the Lovable AI Gateway. Never import this from client code.

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims, HNSW-indexable
const CHAT_MODEL = "google/gemini-3-flash-preview";

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // Copy into a clean ArrayBuffer to satisfy unpdf's typed-array expectations.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const pdf = await getDocumentProxy(new Uint8Array(ab));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join("\n\n") : text, pages: totalPages };
}

// Split text into overlapping chunks on paragraph/sentence boundaries.
export function chunkText(raw: string, target = 1200, overlap = 150): string[] {
  const text = raw.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  const paras = text.split(/\n\n+/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    const para = p.trim();
    if (!para) continue;
    if (para.length > target * 1.5) {
      // very long paragraph: hard-split by sentences
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((buf + " " + s).length > target) {
          if (buf) chunks.push(buf.trim());
          buf = buf.slice(Math.max(0, buf.length - overlap)) + " " + s;
        } else {
          buf = buf ? buf + " " + s : s;
        }
      }
      continue;
    }
    if ((buf + "\n\n" + para).length > target) {
      if (buf) chunks.push(buf.trim());
      buf = buf.slice(Math.max(0, buf.length - overlap)) + "\n\n" + para;
    } else {
      buf = buf ? buf + "\n\n" + para : para;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(c => c.length > 20);
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey()}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding error [${res.status}]: ${body}`);
  }
  const json = await res.json();
  return (json.data as Array<{ embedding: number[]; index: number }>)
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

export async function embedQuery(input: string): Promise<number[]> {
  const [e] = await embedTexts([input]);
  return e;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function chatComplete(messages: ChatMsg[]): Promise<string> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey()}` },
    body: JSON.stringify({ model: CHAT_MODEL, messages }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI error [${res.status}]: ${body}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}
