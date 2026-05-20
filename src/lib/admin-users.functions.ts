import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: ReturnType<typeof requireAdminClient>, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}
function requireAdminClient(): never { throw new Error("type helper only"); }

export const listStationUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id, role, station_id").order("role");
    if (error) throw new Error(error.message);
    const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map(usersRes?.users?.map((u) => [u.id, u.email ?? ""]) ?? []);
    return (roles ?? []).map((r) => ({
      user_id: r.user_id,
      email: emailById.get(r.user_id) ?? "—",
      role: r.role,
      station_id: r.station_id,
    }));
  });

export const createStationUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).max(72),
      station_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    if (!created.user) throw new Error("Failed to create user");
    // Overwrite the default editor row (no station) created by handle_new_user
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: created.user.id, role: "editor", station_id: data.station_id,
    });
    if (rErr) throw new Error(rErr.message);
    return { ok: true, user_id: created.user.id };
  });

export const deleteStationUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.user_id === context.userId) throw new Error("Cannot delete your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetStationUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
