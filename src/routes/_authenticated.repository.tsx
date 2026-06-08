import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Loader2, Trash2, Download, RefreshCw, Bot, Send, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ingestDocument, askProjectAI } from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/repository")({
  head: () => ({ meta: [{ title: "Project Repository & AI Assistant — NTPC BESS" }] }),
  component: RepositoryPage,
});

const fmtSize = (b?: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

function RepositoryPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Project Repository</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Central governance hub — upload tender & project documents and query the entire portfolio with AI.
        </p>
      </div>
      <Tabs defaultValue="assistant">
        <TabsList>
          <TabsTrigger value="assistant"><Bot className="mr-1.5 h-4 w-4" /> AI Assistant</TabsTrigger>
          <TabsTrigger value="documents"><FileText className="mr-1.5 h-4 w-4" /> Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="assistant"><Assistant /></TabsContent>
        <TabsContent value="documents"><Documents isAdmin={isAdmin} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Documents ----------------
function Documents({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const ingest = useServerFn(ingestDocument);

  const docsQ = useQuery({
    queryKey: ["project_documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_documents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data?.some(d => d.status === "processing" || d.status === "pending") ? 4000 : false),
  });

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("project-docs").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: doc, error: insErr } = await supabase.from("project_documents").insert({
        name: name.trim() || file.name,
        description: description.trim() || null,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null,
        status: "pending",
        uploaded_by: user?.id ?? null,
      }).select().single();
      if (insErr) throw insErr;

      toast.success("Uploaded — AI is now reading the document…");
      setName(""); setDescription(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["project_documents"] });

      ingest({ data: { documentId: doc.id } })
        .then(() => { toast.success(`${doc.name} indexed for AI search`); qc.invalidateQueries({ queryKey: ["project_documents"] }); })
        .catch((e) => { toast.error(`Indexing failed: ${(e as Error).message}`); qc.invalidateQueries({ queryKey: ["project_documents"] }); });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reindex = useMutation({
    mutationFn: async (id: string) => ingest({ data: { documentId: id } }),
    onSuccess: () => { toast.success("Re-indexed"); qc.invalidateQueries({ queryKey: ["project_documents"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (d: { id: string; file_path: string }) => {
      await supabase.storage.from("project-docs").remove([d.file_path]);
      const { error } = await supabase.from("project_documents").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Document removed"); qc.invalidateQueries({ queryKey: ["project_documents"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("project-docs").createSignedUrl(path, 120);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const docs = docsQ.data ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Upload className="h-4 w-4" /> Upload Document</div>
        <Input placeholder="Title (e.g. Tender Document Vol-1)" value={name} onChange={e => setName(e.target.value)} />
        <Textarea rows={2} placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:text-foreground" />
        <p className="text-[10px] text-muted-foreground">PDF or text files. The AI reads and indexes the content for project-wide Q&A.</p>
        <Button className="w-full" disabled={!file || busy} onClick={upload}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Upload & Index
        </Button>
      </Card>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Library ({docs.length})</div>
        {docsQ.isLoading ? (
          <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : docs.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No documents yet. Upload tender documents to train the assistant.</div>
        ) : (
          <div className="space-y-2">
            {docs.map(d => (
              <div key={d.id} className="flex items-start gap-3 rounded-md border border-border/60 p-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{d.name}</span>
                    <StatusChip status={d.status} />
                  </div>
                  {d.description && <p className="mt-0.5 text-xs text-muted-foreground">{d.description}</p>}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {fmtSize(d.file_size)} · {d.page_count ? `${d.page_count} pages · ` : ""}{d.chunk_count} chunks
                    {d.status === "error" && d.error && <span className="ml-1 text-destructive">· {d.error}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Download" onClick={() => download(d.file_path)}><Download className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Re-index" disabled={reindex.isPending} onClick={() => reindex.mutate(d.id)}><RefreshCw className="h-3.5 w-3.5" /></Button>
                  {isAdmin && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={() => { if (confirm(`Delete "${d.name}"?`)) remove.mutate({ id: d.id, file_path: d.file_path }); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "Queued", color: "var(--status-amber)" },
    processing: { label: "Indexing…", color: "var(--status-amber)" },
    ready: { label: "Ready", color: "var(--status-green)" },
    error: { label: "Error", color: "var(--status-red)" },
  };
  const m = map[status] ?? { label: status, color: "var(--muted-foreground)" };
  return <Badge variant="outline" className="gap-1 text-[10px]" style={{ color: m.color, borderColor: m.color }}>
    {status === "processing" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}{m.label}
  </Badge>;
}

// ---------------- Assistant ----------------
type Msg = { role: "user" | "assistant"; content: string; sources?: string[] };

const SUGGESTIONS = [
  "Which stations are most delayed and why?",
  "Summarise overall portfolio progress.",
  "What is the completion date and project cost for Barauni?",
  "List stations with open hindrances.",
];

function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const ask = useServerFn(askProjectAI);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { question, history } });
      setMessages(prev => [...prev, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex h-[calc(100vh-220px)] flex-col p-0">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary"><Sparkles className="h-6 w-6" /></div>
            <h3 className="mt-3 text-lg font-semibold">Ask about the NTPC BESS project</h3>
            <p className="mt-1 text-sm text-muted-foreground">Answers combine the live database (progress, dates, costs, contacts) with your uploaded tender documents.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-border/60 p-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"><Bot className="h-4 w-4" /></div>}
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/60"}`}>
              {m.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-table:text-xs prose-li:my-0">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : m.content}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-border/40 pt-2">
                  <span className="text-[10px] text-muted-foreground">Sources:</span>
                  {m.sources.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"><Bot className="h-4 w-4" /></div>
            <div className="rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Analysing project data…</div>
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask anything about the project or a specific station…"
            className="min-h-[42px] resize-none"
          />
          <Button disabled={!input.trim() || loading} onClick={() => send(input)}><Send className="h-4 w-4" /></Button>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><AlertCircle className="h-3 w-3" /> AI can make mistakes — verify critical figures against the source records.</p>
      </div>
    </Card>
  );
}
