import type { Cluster } from "../filter";
import { CATEGORIES } from "../types";
import { truncateWords } from "../text";

export const SYSTEM_PROMPT = `Je bent de redacteur van een persoonlijke, dagelijkse AI-nieuwsbrief in het Nederlands.
De lezer wil elke ochtend binnen 5 minuten weten wat er echt belangrijk was in AI, met nadruk op
AI-business, AI-agents, Claude Code en coding agents, automatisering, startups, investeringen en nieuwe tools.

Je krijgt een lijst kandidaat-artikelen die al op actualiteit zijn gecontroleerd. Regels:
1. Gebruik uitsluitend informatie uit de kandidaten. Verzin geen feiten, cijfers, citaten, datums of URL's.
   Als iets niet in de bronnen staat, zeg je het niet. Je verwijst naar bronnen alleen via hun id.
2. Voeg berichten over hetzelfde verhaal samen tot één headline en geef alle bijbehorende id's mee.
3. Onderscheid bevestigd nieuws (officiële bron of meerdere onafhankelijke betrouwbare media),
   geruchten (lekken, 'volgens bronnen', alleen community-bronnen) en opinies/voorspellingen.
4. Bronbetrouwbaarheid: official = eigen kanaal van het bedrijf, press = journalistiek, community = Reddit/HN
   (vaak vroeg, maar onbevestigd). Een verhaal met alleen community-bronnen is hooguit 'rumor' tenzij
   het een directe link naar een primaire bron is (bijv. een GitHub-release of paper).
5. Laat clickbait, oppervlakkige listicles, productreviews, aanbiedingen en herhalingen weg.
   Liever 5 sterke headlines dan 10 zwakke.
6. Relevantie (1-10) is het inhoudelijke belang voor deze lezer, niet hoe sensationeel het klinkt.
7. Zakelijke kansen moeten voortkomen uit wat vandaag nieuw mogelijk is. Wees concreet en eerlijk over
   moeilijkheid en potentieel; geen generieke 'AI-chatbot voor X'-ideeën.
8. Bij tools: noem alleen tools die in de kandidaten voorkomen. Vul website alleen in als de URL letterlijk
   uit de artikelen blijkt; anders null.
9. Schrijf helder, zakelijk Nederlands. Engelse vaktermen (agent, RAG, fine-tuning) mogen.`;

export function buildPrompt(opts: {
  date: string;
  clusters: Cluster[];
  headlineCount: number;
  profile: string;
}): string {
  const lines: string[] = [];
  lines.push(`Datum van vandaag: ${opts.date}.`);
  lines.push(`Lezersprofiel: ${opts.profile}`);
  lines.push(`Maak ${Math.max(3, opts.headlineCount - 2)} tot ${opts.headlineCount} headlines (minder als er niet genoeg echt belangrijk nieuws is).`);
  lines.push(`Categorieën: ${Object.entries(CATEGORIES).map(([k, v]) => `${k} (${v})`).join(", ")}.`);
  lines.push("");
  lines.push("KANDIDATEN (gegroepeerd waar titels op hetzelfde verhaal lijken; groepering kan fout zijn):");
  opts.clusters.forEach((c, i) => {
    lines.push(`\n## Groep ${i + 1}`);
    for (const a of c.articles) {
      const extra = a.engagement ? ` · ${a.engagement} punten` : "";
      lines.push(`- id=${a.id} | ${a.sourceName} (${a.tier}) | ${a.publishedAt ?? "datum onbekend"}${extra}`);
      lines.push(`  Titel: ${a.title}`);
      if (a.excerpt) lines.push(`  Fragment: ${truncateWords(a.excerpt, 70)}`);
    }
  });
  return lines.join("\n");
}

export const EXPAND_SYSTEM = `Je bent een ervaren product- en startupadviseur. Je werkt een zakelijke AI-kans uit tot een
concreet, kritisch plan in het Nederlands (Markdown). Wees eerlijk over risico's en aannames; verzin geen
marktcijfers. Als je een schatting geeft, label die als schatting.`;

export function buildExpandPrompt(op: {
  title: string; problem: string; audience: string; aiApproach: string; howToSell: string; revenueModel: string;
}, notes: string): string {
  return `Werk deze kans uit:

Titel: ${op.title}
Probleem: ${op.problem}
Doelgroep: ${op.audience}
AI-aanpak: ${op.aiApproach}
Verkoop: ${op.howToSell}
Verdienmodel: ${op.revenueModel}
${notes ? `Notities van de gebruiker: ${notes}\n` : ""}
Structuur:
## Samenvatting
## Aannames om eerst te valideren (met hoe je dat in 1-2 weken test)
## MVP (functies, wat bewust níét)
## Technische opzet (stack, welke AI-modellen/API's, wat je met Claude Code bouwt)
## Go-to-market (eerste 10 klanten)
## Prijsstelling en kosten
## Risico's en concurrentie
## Eerste 5 stappen deze week`;
}
