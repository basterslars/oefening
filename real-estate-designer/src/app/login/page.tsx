"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/AppHeader";
import { Button, Field, Input, Notice, Segmented, Spinner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const sb = getSupabase();
  const { session } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (session || !sb) router.replace("/");
  }, [session, sb, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setBusy(true);
    setMsg(null);
    const { error } =
      mode === "login"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) setMsg({ tone: "error", text: error.message });
    else if (mode === "signup") setMsg({ tone: "info", text: "Account aangemaakt. Controleer uw e-mail om uw adres te bevestigen (indien vereist) en log daarna in." });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-soft">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "login", label: "Inloggen" },
              { value: "signup", label: "Account aanmaken" },
            ]}
          />
          <Field label="E-mailadres">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Wachtwoord" hint={mode === "signup" ? "Minimaal 8 tekens" : undefined}>
            <Input type="password" required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy && <Spinner />} {mode === "login" ? "Inloggen" : "Account aanmaken"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">Uw projecten zijn alleen zichtbaar voor u, tenzij u bewust een deellink maakt.</p>
      </div>
    </div>
  );
}
