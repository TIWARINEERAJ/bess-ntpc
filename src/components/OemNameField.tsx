import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { oemCategoryForBoi, oemSuggestions, OEM_CATEGORY_LABELS, type OemCategory } from "@/lib/oem-catalog";

export type OemVendor = { id: string; name: string; category: string | null; tier: string | null; source: string };

export function useOemVendors() {
  return useQuery({
    queryKey: ["oem_vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("oem_vendors").select("id,name,category,tier,source").order("name");
      if (error) throw error;
      return (data ?? []) as OemVendor[];
    },
    staleTime: 60_000,
  });
}

/**
 * OEM name entry: free text + tiered suggestions (catalogue + previously saved
 * entries). The tick icon commits the value — it is saved on the BOI row and
 * registered in the OEM directory so it appears as a suggestion later.
 */
export function OemNameField({
  boiName,
  value,
  canEdit,
  onSave,
  className = "w-40",
}: {
  boiName: string;
  value: string | null;
  canEdit: boolean;
  onSave: (name: string | null) => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const vendorsQ = useOemVendors();
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const category: OemCategory = useMemo(() => oemCategoryForBoi(boiName), [boiName]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; label: string }[] = [];
    for (const e of oemSuggestions(category)) {
      const k = e.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name: e.name, label: `Tier ${e.tier} · ${OEM_CATEGORY_LABELS[category]}` });
    }
    for (const v of vendorsQ.data ?? []) {
      const k = v.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name: v.name, label: v.source === "user" ? "Previously entered" : "Directory" });
    }
    const q = text.trim().toLowerCase();
    return q ? out.filter((o) => o.name.toLowerCase().includes(q)) : out;
  }, [category, vendorsQ.data, text]);

  const register = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const exists = (vendorsQ.data ?? []).some((v) => v.name.toLowerCase() === name.toLowerCase());
      if (!exists) {
        await supabase.from("oem_vendors").insert({ name, category, source: "user", created_by: user?.id ?? null });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oem_vendors"] }),
  });

  const commit = (raw?: string) => {
    const name = (raw ?? text).trim();
    onSave(name || null);
    if (name) register.mutate(name);
    setText(name);
    setOpen(false);
    toast.success(name ? `OEM saved: ${name}` : "OEM cleared");
  };

  const dirty = (value ?? "") !== text.trim();

  return (
    <div className="flex items-center gap-1">
      <Input
        disabled={!canEdit}
        className={`h-7 ${className} bg-transparent text-xs`}
        placeholder="OEM name…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      <Button
        type="button"
        size="icon"
        variant={dirty ? "default" : "ghost"}
        className="h-7 w-7 shrink-0"
        disabled={!canEdit || !dirty}
        title="Save OEM name"
        onClick={() => commit()}
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Suggested OEMs" disabled={!canEdit}>
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <div className="max-h-72 overflow-auto py-1">
            {options.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No matches — type a name and press the tick to save it.</div>}
            {options.map((o) => (
              <button
                key={o.name}
                type="button"
                onClick={() => commit(o.name)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-secondary/60"
              >
                <span className="text-xs font-medium">{o.name}</span>
                <span className="text-[10px] text-muted-foreground">{o.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
