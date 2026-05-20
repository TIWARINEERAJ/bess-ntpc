import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "editor" | "viewer";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  role: Role | null;
  editorStationId: string | null;
  loading: boolean;
  canEdit: boolean;
  canEditStation: (stationId: string) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  role: null,
  editorStationId: null,
  loading: true,
  canEdit: false,
  canEditStation: () => false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [editorStationId, setEditorStationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = (uid: string) =>
    supabase.from("user_roles").select("role,station_id").eq("user_id", uid).order("role").then(({ data }) => {
      const rows = data ?? [];
      // Prefer admin if present
      const admin = rows.find(r => r.role === "admin");
      if (admin) { setRole("admin"); setEditorStationId(null); return; }
      const editor = rows.find(r => r.role === "editor");
      if (editor) { setRole("editor"); setEditorStationId(editor.station_id ?? null); return; }
      setRole("viewer"); setEditorStationId(null);
    });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => { loadRole(s.user.id); }, 0);
      else { setRole(null); setEditorStationId(null); }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadRole(data.session.user.id).then(() => setLoading(false));
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const canEdit = role === "admin" || role === "editor";
  const canEditStation = (stationId: string) => {
    if (role === "admin") return true;
    if (role !== "editor") return false;
    return editorStationId === null || editorStationId === stationId;
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, role, editorStationId, loading, canEdit, canEditStation, signOut: async () => { await supabase.auth.signOut(); } }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
