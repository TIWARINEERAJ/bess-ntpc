import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Battery, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — NTPC BESS L2 Monitor" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in");
      router.navigate({ to: "/" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%)]" />
        <div className="relative flex items-center gap-2 text-sm font-medium">
          <Battery className="h-5 w-5 text-primary" /> NTPC · OS Project Management Group
        </div>
        <div className="relative space-y-4">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Battery Energy Storage
            <br />
            <span className="text-primary">Project Monitoring Portal</span>
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Real-time tracking of 16 BESS contracts across 15 thermal stations — 5,004 MWh of co-located storage to
            manage technical-minimum operations.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-6">
            {[
              { k: "5,004", v: "MWh contracted" },
              { k: "15", v: "Stations" },
              { k: "16", v: "Contracts" },
            ].map((s) => (
              <div key={s.v} className="rounded-lg border border-border/60 bg-card/60 p-3">
                <div className="font-mono text-2xl font-bold text-primary">{s.k}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-muted-foreground">Authorized users only · NTPC PMG / EIC / Vendor</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-6">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your NTPC / vendor credentials.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Accounts are provisioned by an administrator. Contact your project admin for access.
          </p>

        </Card>
      </div>
    </div>
  );
}
