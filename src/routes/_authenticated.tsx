import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/AppHeader";
import { AuthProvider } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: Layout,
});

function Layout() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader />
        <Outlet />
        <Toaster richColors position="top-right" />
      </div>
    </AuthProvider>
  );
}
