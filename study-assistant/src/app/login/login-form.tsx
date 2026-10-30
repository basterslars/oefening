"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";

type Mode = "login" | "signup" | "magic";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "De inloglink is ongeldig of verlopen." : null);
  const [info, setInfo] = useState<string | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = supabaseBrowser();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
        router.refresh();
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Kies een wachtwoord van minimaal 8 tekens.");
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else setInfo("Account aangemaakt. Bevestig je e-mailadres via de link in je inbox.");
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        setInfo("Check je inbox: we hebben je een inloglink gestuurd.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/invalid login credentials/i.test(msg) ? "Onjuist e-mailadres of wachtwoord." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
        {(["login", "signup", "magic"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-1.5 font-medium ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            {m === "login" ? "Inloggen" : m === "signup" ? "Account maken" : "Inloglink"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="E-mailadres">
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== "magic" && (
          <Field label="Wachtwoord">
            <Input type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}
        <Button className="w-full" disabled={busy}>
          {busy && <Spinner />}
          {mode === "login" ? "Inloggen" : mode === "signup" ? "Account maken" : "Stuur inloglink"}
        </Button>
      </form>
    </div>
  );
}
