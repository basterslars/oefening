"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: data.user!.id, display_name: String(f.get("display_name")).trim().slice(0, 80) || null, study_level: String(f.get("study_level")) });
    setMsg(error ? { tone: "danger", text: error.message } : { tone: "success", text: "Opgeslagen." });
    router.refresh();
  }
  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <Field label="Naam">
        <Input name="display_name" maxLength={80} defaultValue={profile?.display_name ?? ""} />
      </Field>
      <Field label="Studiefase" hint="De AI-docent past zijn niveau hierop aan">
        <Select name="study_level" defaultValue={profile?.study_level ?? "bachelor"}>
          <option value="hbo">hbo</option>
          <option value="bachelor">Universitaire bachelor</option>
          <option value="premaster">Premaster</option>
          <option value="master">Universitaire master</option>
        </Select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button>Opslaan</Button>
        {msg && <Alert tone={msg.tone} className="py-1.5">{msg.text}</Alert>}
      </div>
    </form>
  );
}
