import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Mic, Square, Pause, Play, Upload, Trash2, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

type Recording = {
  id: string;
  meeting_id: string;
  station_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  duration_seconds: number | null;
  mime_type: string | null;
  created_at: string;
};

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
const fmtSize = (b?: number | null) => (b == null ? "" : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export function MeetingRecorder({ meetingId, meetingType, stationId, canEdit }: { meetingId?: string; meetingType?: string; stationId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const scope = meetingId ?? `type:${meetingType ?? "general"}`;
  const key = ["meeting-recordings", stationId, scope];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      let query = supabase.from("meeting_recordings").select("*").eq("station_id", stationId);
      if (meetingId) {
        query = query.eq("meeting_id", meetingId);
      } else {
        query = query.is("meeting_id", null).eq("meeting_type", meetingType ?? "general");
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Recording[];
    },
  });
  const recordings = q.data ?? [];


  const [includeSystem, setIncludeSystem] = useState(true);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const playerCache = useRef<Map<string, string>>(new Map());

  const stopAllTracks = () => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => stopAllTracks(), []);

  const uploadBlob = async (blob: Blob, name: string, duration: number) => {
    setBusy(true);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const path = `${stationId}/meeting-audio/${meetingId}/${Date.now()}_${name}.${ext}`;
      const { error: upErr } = await supabase.storage.from("meeting-audio").upload(path, blob, { contentType: blob.type || "audio/webm" });
      if (upErr) throw upErr;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("meeting_recordings").insert({
        meeting_id: meetingId,
        station_id: stationId,
        file_path: path,
        file_name: `${name}.${ext}`,
        file_size: blob.size,
        duration_seconds: Math.round(duration),
        mime_type: blob.type || "audio/webm",
        uploaded_by: user?.id ?? null,
      });
      if (error) { await supabase.storage.from("meeting-audio").remove([path]); throw error; }
      toast.success("Recording saved");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    try {
      const mimeType = pickMime();
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamsRef.current.push(micStream);

      let combined: MediaStream = micStream;

      if (includeSystem) {
        try {
          // Capture tab/system audio (e.g. Teams call playing on this device)
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          streamsRef.current.push(display);
          const sysTracks = display.getAudioTracks();
          // Drop the video track immediately — we only want audio
          display.getVideoTracks().forEach((t) => t.stop());
          if (sysTracks.length) {
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const dest = ctx.createMediaStreamDestination();
            ctx.createMediaStreamSource(micStream).connect(dest);
            ctx.createMediaStreamSource(new MediaStream(sysTracks)).connect(dest);
            combined = dest.stream;
          } else {
            toast.warning("No computer audio captured — recording microphone only. Tick 'Share tab/system audio' in the share dialog.");
          }
        } catch {
          toast.warning("Computer audio not shared — recording microphone only.");
        }
      }

      chunksRef.current = [];
      const rec = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const dur = durationRef.current;
        stopAllTracks();
        setRecording(false);
        setPaused(false);
        setElapsed(0);
        if (blob.size > 0) uploadBlob(blob, `meeting-recording`, dur);
      };
      recorderRef.current = rec;
      rec.start(1000);
      startTsRef.current = Date.now();
      durationRef.current = 0;
      setElapsed(0);
      setRecording(true);
      setPaused(false);
      timerRef.current = setInterval(() => {
        const sec = (Date.now() - startTsRef.current) / 1000;
        durationRef.current = sec;
        setElapsed(sec);
      }, 250);
    } catch (e) {
      stopAllTracks();
      toast.error("Microphone access denied or unavailable");
    }
  };

  const togglePause = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      startTsRef.current = Date.now() - durationRef.current * 1000;
      timerRef.current = setInterval(() => {
        const sec = (Date.now() - startTsRef.current) / 1000;
        durationRef.current = sec;
        setElapsed(sec);
      }, 250);
      setPaused(false);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!f) return;
    if (!f.type.startsWith("audio/")) { toast.error("Please choose an audio file"); return; }
    if (f.size > 100 * 1024 * 1024) { toast.error("Max 100 MB per recording"); return; }
    setBusy(true);
    try {
      const path = `${stationId}/meeting-audio/${meetingId}/${Date.now()}_${f.name}`;
      const { error: upErr } = await supabase.storage.from("meeting-audio").upload(path, f, { contentType: f.type });
      if (upErr) throw upErr;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("meeting_recordings").insert({
        meeting_id: meetingId,
        station_id: stationId,
        file_path: path,
        file_name: f.name,
        file_size: f.size,
        mime_type: f.type,
        uploaded_by: user?.id ?? null,
      });
      if (error) { await supabase.storage.from("meeting-audio").remove([path]); throw error; }
      toast.success("Audio uploaded");
      qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const del = useMutation({
    mutationFn: async (r: Recording) => {
      await supabase.storage.from("meeting-audio").remove([r.file_path]);
      const { error } = await supabase.from("meeting_recordings").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Recording deleted"); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-2 rounded-md border bg-secondary/20 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Mic className="h-3.5 w-3.5" /> Voice recordings {recordings.length > 0 && <Badge variant="secondary" className="text-[10px]">{recordings.length}</Badge>}
        </div>
        {canEdit && !recording && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <Checkbox checked={includeSystem} onCheckedChange={(v) => setIncludeSystem(!!v)} />
              Capture computer audio (Teams)
            </label>
            <Button size="sm" variant="default" onClick={startRecording} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mic className="mr-1 h-3.5 w-3.5" />} Record
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Upload audio
            </Button>
            <input ref={fileInput} type="file" accept="audio/*" className="hidden" onChange={onPickFile} />
          </div>
        )}
      </div>

      {recording && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-background px-3 py-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full bg-destructive ${paused ? "" : "animate-ping opacity-75"}`} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
          </span>
          <span className="font-mono text-sm tabular-nums">{fmtTime(elapsed)}</span>
          <span className="text-xs text-muted-foreground">{paused ? "Paused" : "Recording…"}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={togglePause}>
              {paused ? <><Play className="mr-1 h-3.5 w-3.5" /> Resume</> : <><Pause className="mr-1 h-3.5 w-3.5" /> Pause</>}
            </Button>
            <Button size="sm" variant="destructive" onClick={stopRecording}>
              <Square className="mr-1 h-3.5 w-3.5" /> Stop & save
            </Button>
          </div>
        </div>
      )}

      {recordings.length === 0 && !recording && (
        <div className="text-[11px] text-muted-foreground">No recordings yet. Record live or upload a Teams meeting audio file.</div>
      )}

      <div className="space-y-2">
        {recordings.map((r) => (
          <RecordingRow key={r.id} r={r} canEdit={canEdit} onDelete={() => del.mutate(r)} deleting={del.isPending} cache={playerCache.current} />
        ))}
      </div>
    </div>
  );
}

function RecordingRow({ r, canEdit, onDelete, deleting, cache }: { r: Recording; canEdit: boolean; onDelete: () => void; deleting: boolean; cache: Map<string, string> }) {
  const [url, setUrl] = useState<string | null>(cache.get(r.file_path) ?? null);
  const [loading, setLoading] = useState(false);

  const ensureUrl = async () => {
    if (url) return url;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from("meeting-audio").createSignedUrl(r.file_path, 3600);
      if (error) throw error;
      cache.set(r.file_path, data.signedUrl);
      setUrl(data.signedUrl);
      return data.signedUrl;
    } catch (e) {
      toast.error("Could not load audio");
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { ensureUrl(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="rounded-md bg-background p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{r.file_name}</div>
          <div className="text-[10px] text-muted-foreground">
            {new Date(r.created_at).toLocaleString()}
            {r.duration_seconds ? ` · ${fmtTime(r.duration_seconds)}` : ""}
            {r.file_size ? ` · ${fmtSize(r.file_size)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {url && (
            <Button asChild variant="ghost" size="icon" className="h-7 w-7">
              <a href={url} download={r.file_name}><Download className="h-3.5 w-3.5" /></a>
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} disabled={deleting}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>
      {loading && !url ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading audio…</div>
      ) : url ? (
        <audio controls preload="none" src={url} className="h-9 w-full" />
      ) : null}
    </div>
  );
}
