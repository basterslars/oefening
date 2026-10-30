import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Configuratie" };

export default function SetupPage() {
  if (supabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Configuratie nodig</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        De studieassistent slaat je vakken, documenten en voortgang op in Supabase. Vul de verbindingsgegevens in om te beginnen.
      </p>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm">
        <li>Kopieer <code className="rounded bg-muted px-1">.env.example</code> naar <code className="rounded bg-muted px-1">.env.local</code>.</li>
        <li>Vul <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> en <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in.</li>
        <li>Voer de migratie in <code className="rounded bg-muted px-1">supabase/migrations</code> uit (zie README).</li>
        <li>Optioneel: <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> voor de AI-functies.</li>
        <li>Herstart <code className="rounded bg-muted px-1">npm run dev</code>.</li>
      </ol>
    </main>
  );
}
