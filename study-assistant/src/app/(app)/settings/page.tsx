import { requireUser } from "@/lib/supabase/server";
import { config, publicAiStatus } from "@/lib/config";
import type { Profile } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Instellingen" };

// Indicatieve prijzen per miljoen tokens (input, output) in USD; zie README.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

function usageWindow() {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  return { since: new Date(Date.now() - 30 * 86_400_000).toISOString(), startToday };
}

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const { since, startToday } = usageWindow();
  const [profileR, usageR] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("ai_usage").select("feature, model, input_tokens, output_tokens, cache_read_tokens, created_at").gte("created_at", since).limit(5000),
  ]);
  const ai = publicAiStatus();
  const usage = usageR.data ?? [];
  const todayTokens = usage.filter((u) => new Date(u.created_at) >= startToday).reduce((s, u) => s + u.input_tokens + u.output_tokens, 0);
  const byFeature = new Map<string, { tokens: number; cost: number; calls: number }>();
  let unknownModel = false;
  for (const u of usage) {
    const price = PRICES[u.model.replace(/-\d{8}$/, "")];
    if (!price) unknownModel = true;
    const cost = price ? (u.input_tokens * price[0] + u.output_tokens * price[1] + u.cache_read_tokens * price[0] * 0.1) / 1e6 : 0;
    const f = byFeature.get(u.feature) ?? { tokens: 0, cost: 0, calls: 0 };
    byFeature.set(u.feature, { tokens: f.tokens + u.input_tokens + u.output_tokens + u.cache_read_tokens, cost: f.cost + cost, calls: f.calls + 1 });
  }
  const totalCost = [...byFeature.values()].reduce((s, f) => s + f.cost, 0);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Instellingen" description={user.email} />
      <Card>
        <CardHeader>
          <CardTitle>Profiel</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profileR.data as Profile} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>AI-configuratie</CardTitle>
            <CardDescription>Ingesteld via omgevingsvariabelen op de server (sleutels zijn nooit zichtbaar in de browser).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="AI-functies">{ai.aiEnabled ? <Badge tone="success">actief</Badge> : <Badge tone="danger">uit (geen ANTHROPIC_API_KEY)</Badge>}</Row>
          <Row label="Model AI-docent">{ai.models.tutor}</Row>
          <Row label="Model vragen & flashcards">{ai.models.generate}</Row>
          <Row label="Model nakijken & documentanalyse">{ai.models.fast}</Row>
          <Row label="AI-documentanalyse">{ai.analyzeDocuments ? "aan" : "uit (alleen lokale analyse)"}</Row>
          <Row label="Semantisch zoeken (embeddings)">{ai.semanticSearch ? "aan (Voyage AI)" : "uit (full-text zoeken)"}</Row>
          <Row label="Dagbudget">{ai.dailyTokenBudget.toLocaleString("nl-NL")} tokens</Row>
          <Row label="Tijdzone">{config.timeZone}</Row>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>AI-verbruik</CardTitle>
            <CardDescription>Laatste 30 dagen · vandaag {todayTokens.toLocaleString("nl-NL")} tokens</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {byFeature.size === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen AI-gebruik.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Functie</th>
                  <th className="pb-2 text-right font-medium">Aanroepen</th>
                  <th className="pb-2 text-right font-medium">Tokens</th>
                  <th className="pb-2 text-right font-medium">≈ Kosten</th>
                </tr>
              </thead>
              <tbody>
                {[...byFeature.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([f, v]) => (
                  <tr key={f} className="border-t border-border">
                    <td className="py-1.5">{f}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.calls}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.tokens.toLocaleString("nl-NL")}</td>
                    <td className="py-1.5 text-right tabular-nums">${v.cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-medium">
                  <td className="py-1.5">Totaal</td>
                  <td />
                  <td />
                  <td className="py-1.5 text-right tabular-nums">${totalCost.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Schatting op basis van standaard API-prijzen; je werkelijke factuur staat in de Anthropic Console.{unknownModel ? " Voor sommige modellen is geen prijs bekend (niet meegeteld)." : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-xs">{children}</span>
    </div>
  );
}
