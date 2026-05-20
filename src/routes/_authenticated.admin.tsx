import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { listStationUsers, createStationUser, deleteStationUser, resetStationUserPassword } from "@/lib/admin-users.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · User Management — NTPC BESS" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listStationUsers);
  const create = useServerFn(createStationUser);
  const del = useServerFn(deleteStationUser);
  const reset = useServerFn(resetStationUserPassword);

  const usersQ = useQuery({ queryKey: ["admin_users"], queryFn: () => list(), enabled: role === "admin" });
  const stationsQ = useQuery({ queryKey: ["stations"], queryFn: async () => {
    const { data, error } = await supabase.from("stations").select("id,name,lot").order("sort_order");
    if (error) throw error; return data ?? [];
  }});

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", station_id: "" });
  const [resetUser, setResetUser] = useState<{ id: string; email: string } | null>(null);
  const [newPass, setNewPass] = useState("");

  const createM = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => { toast.success("User created"); setOpen(false); setForm({ email: "", password: "", station_id: "" }); qc.invalidateQueries({ queryKey: ["admin_users"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteM = useMutation({
    mutationFn: (user_id: string) => del({ data: { user_id } }),
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["admin_users"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const resetM = useMutation({
    mutationFn: () => reset({ data: { user_id: resetUser!.id, password: newPass } }),
    onSuccess: () => { toast.success("Password updated"); setResetUser(null); setNewPass(""); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (loading) return <div className="p-6">Loading…</div>;
  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card className="p-6 text-center">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-destructive" />
          <div className="font-semibold">Admin access required</div>
          <p className="mt-1 text-sm text-muted-foreground">You don't have permission to view this page.</p>
        </Card>
      </div>
    );
  }

  const stations = stationsQ.data ?? [];
  const stationName = (id: string | null) => stations.find(s => s.id === id)?.name ?? "—";
  const users = usersQ.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">Create per-station logins. Editors can only edit their assigned station.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New Station User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Station User</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Password (min 8 chars)</Label><Input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
              <div><Label>Station</Label>
                <Select value={form.station_id} onValueChange={v => setForm({ ...form, station_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select station" /></SelectTrigger>
                  <SelectContent>{stations.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.lot})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={createM.isPending || !form.email || !form.password || !form.station_id} onClick={() => createM.mutate()}>
                {createM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create user
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Email</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-left">Station</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className="border-t border-border/40">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{u.role.toUpperCase()}</Badge></td>
                <td className="px-3 py-2">{u.role === "admin" ? <span className="text-muted-foreground">All stations</span> : stationName(u.station_id)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setResetUser({ id: u.user_id, email: u.email })}><KeyRound className="h-4 w-4" /></Button>
                  {u.role !== "admin" && (
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${u.email}?`) && deleteM.mutate(u.user_id)} disabled={deleteM.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No users.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password — {resetUser?.email}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input type="text" placeholder="New password (min 8 chars)" value={newPass} onChange={e => setNewPass(e.target.value)} />
            <Button className="w-full" disabled={resetM.isPending || newPass.length < 8} onClick={() => resetM.mutate()}>
              {resetM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
