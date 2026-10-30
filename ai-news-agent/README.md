# AI News Agent

Persoonlijke AI-nieuwsagent die elke ochtend automatisch AI-nieuws verzamelt, filtert,
ontdubbelt, laat analyseren door Claude en presenteert als nieuwsbrief in een dashboard.

**Onderdelen van de nieuwsbrief:** A. Today's AI Headlines · B. AI Tools of the Day ·
C. AI Business Opportunities · D. AI Development & Claude Code (+ dagelijks bouwidee) ·
E. AI Explained · F. The Big Picture.

**Dashboard:** overzicht, nieuwsbrief met filters en archief, kansen (opslaan, notities,
laten uitwerken), opgeslagen nieuws met zoekfunctie, instellingen met logboek.

## Snel starten

```bash
cd ai-news-agent
npm install
cp .env.example .env.local   # vul minimaal ANTHROPIC_API_KEY in
npm run dev                  # http://localhost:3000
```

Vereist Node.js ≥ 22.13 (voor de ingebouwde `node:sqlite`). Zonder API-key draait de
app in **basismodus**: nieuws wordt wel verzameld, gefilterd, ontdubbeld en gerangschikt,
maar zonder samenvattingen, kansen, tools en uitleg. Dat staat dan ook expliciet in de UI.

Andere commando's:

| Commando | Wat |
|---|---|
| `npm run digest` | Nieuwsbrief maken via de command line (alleen als die er vandaag nog niet is) |
| `npm run digest:force` | Altijd een nieuwe versie maken |
| `npm test` | Unit- en pipelinetests (Node test runner) |
| `npm run typecheck` | TypeScript-controle |
| `npm run build && npm start` | Productieversie lokaal |

## Accounts en API-keys

| Dienst | Nodig? | Waarvoor | Kosten |
|---|---|---|---|
| **Anthropic API** (`ANTHROPIC_API_KEY`) | Sterk aanbevolen | Analyse, samenvatting, categorisatie, kansen; web search naar Anthropic, Meta AI, xAI en Perplexity (die geen RSS-feed hebben) | Betaald per gebruik, zie hieronder |
| RSS-feeds, Hacker News (Algolia) | Nee | Nieuwsverzameling | Gratis, geen account |
| Resend (`RESEND_API_KEY`) | Optioneel | Nieuwsbrief per e-mail | Heeft een gratis instapniveau; controleer actuele limieten |

**Kostenschatting (een schatting, geen meting):** één dagelijkse analyse stuurt ~60
kandidaat-verhalen (≈ 10–20k inputtokens) en krijgt ≈ 6–12k outputtokens terug (incl.
denken). Tegen de Claude Opus 5.5-tarieven van $4 / $20 per miljoen input-/outputtokens is dat
grofweg **$0,15–0,35 per dag**. De web search-stap komt daar bovenop (per zoekopdracht plus de
tokens van de zoekresultaten), schat **$0,10–0,30 per dag**. Totaal dus orde-grootte
**$8–20 per maand**. Controleer je werkelijke verbruik in de Anthropic Console. Goedkoper:
`AI_EFFORT=low`, de web search-bron uitzetten, of een kleiner model via `ANTHROPIC_MODEL`.

## Architectuur

```
┌──────────── Planner ────────────┐   ┌──────── Handmatig ────────┐
│ ingebouwd (elke minuut check)   │   │ knop in dashboard          │
│ of extern: POST /api/cron       │   │ of npm run digest          │
└───────────────┬─────────────────┘   └─────────────┬─────────────┘
                └───────────────┬───────────────────┘
                         runPipeline()  (src/lib/pipeline.ts)
   1. Verzamelen   RSS/Atom · Hacker News API · Claude web search    (src/lib/sources/)
   2. Opslaan      SQLite, ontdubbeld op genormaliseerde URL         (src/lib/repo.ts)
   3. Filteren     ≤ 24 u oud · over AI · geen clickbait · niet eerder behandeld (src/lib/filter.ts)
   4. Clusteren    zelfde verhaal bij verschillende media samenvoegen
   5. Rangschikken bronbetrouwbaarheid + aantal bronnen + engagement + jouw voorkeuren
   6. Analyseren   Claude, structured output (Zod-schema)            (src/lib/analyze/)
   7. Valideren    alleen bestaande artikel-id's; links/datums uit de feeds
   8. Publiceren   nieuwsbrief + items + kansen in DB → dashboard; optioneel e-mail
```

Ontwerpkeuzes, met de reden:

- **Geen verzonnen bronnen.** Het model verwijst naar artikelen via hun database-id en
  schrijft zelf geen URL's of datums. Verwijst het naar een onbekende id, dan valt die
  headline weg (en staat er een waarschuwing in de nieuwsbrief). Bij web search worden alleen
  URL's overgenomen die echt in de zoekresultaten van de API stonden.
- **Actualiteit wordt in code gecontroleerd, niet door het model.** Artikelen zonder of met
  een te oude publicatiedatum gaan niet naar de AI.
- **Eén AI-aanroep per dag** (plus optioneel één voor web search) houdt kosten voorspelbaar.
- **Een kapotte bron stopt de run niet.** Per bron wordt het resultaat gelogd (Instellingen →
  Logboek). Faalt de AI-analyse, dan komt er een basisversie in plaats van niets.
- **Transparant leersysteem.** Like (+1), opslaan (+1), favoriet (+2) en 'niet interessant'
  (−2) tellen op per categorie en per bron, afgevlakt met tanh. Samen met de
  interesseprioriteiten (1–5) bepaalt dat de volgorde en wordt het als profiel aan de AI
  meegegeven. Wat geleerd is, zie je onder Instellingen.
- **SQLite** (ingebouwd in Node, geen native build). Ruim voldoende voor één gebruiker;
  alleen `repo.ts` hoeft te veranderen voor Postgres.

### Nieuwe bron toevoegen

RSS/Atom: één regel in `src/lib/sources/registry.ts`. Ander type (API, scraping): een
collector in `src/lib/sources/` en een `kind` in `collect.ts`.

## Online zetten

De ingebouwde planner vereist een **permanent draaiend proces** en SQLite een
**blijvende schijf**. Daarom:

- **Aanbevolen:** Docker op een host met een volume (Railway, Fly.io, Render, een VPS of
  thuisserver):
  ```bash
  docker build -t ai-news-agent .
  docker run -d -p 3000:3000 -v news-data:/app/data --env-file .env.local ai-news-agent
  ```
  Zet `DASHBOARD_PASSWORD` zodra de app publiek bereikbaar is (HTTP Basic Auth).
- **Niet geschikt zonder aanpassing:** Vercel en andere serverless platforms (geen blijvende
  schijf, geen achtergrondproces). Daarvoor moet de opslag naar Postgres (bijv. Supabase).
- **Externe planner** (als je de ingebouwde niet wilt): zet `SCHEDULER_ENABLED=false` en
  `CRON_SECRET`, en laat een cron dagelijks aanroepen:
  ```bash
  curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://jouw-app/api/cron
  ```
  Het endpoint is idempotent: bestaat de nieuwsbrief van vandaag al, dan gebeurt er niets.

## Kritische kanttekeningen

- **Feed-URL's zijn niet allemaal live geverifieerd.** De ontwikkelomgeving kon alleen
  GitHub bereiken; de Claude Code-releasefeed is echt opgehaald en correct verwerkt. De andere
  feed-URL's volgen de gangbare patronen van die sites, maar kunnen afwijken of veranderen.
  Controleer na de eerste run het logboek en zet bronnen die falen uit of pas hun URL aan.
- **Reddit blokkeert vaak verzoeken van servers zonder OAuth.** Behandel de subreddits als
  best effort; Hacker News is betrouwbaarder.
- **'Bevestigd / gerucht / opinie' en de relevantiescore zijn oordelen van het model**, op basis
  van het type en aantal bronnen, geen onafhankelijke factcheck. Daarom staan bij elk item
  de directe bronlinks met type (officieel/media/community) en publicatietijd.
- **Websites bij tools** worden alleen als 'geverifieerd' getoond als het domein in de bronnen
  voorkomt; anders staat er '(niet geverifieerd in bron)'.
- **Ontdubbelen op titel is heuristisch.** Wat de code mist, voegt de AI samen; zonder AI
  kunnen er in de basismodus nog dubbelingen tussen zitten.
- `node:sqlite` geeft bij het starten een `ExperimentalWarning`; de API is in Node 22 nog als
  experimenteel gemarkeerd maar werkt stabiel voor dit gebruik.

## Tests

`npm test` dekt: RSS/Atom/Reddit/HN-parsing, URL-normalisatie, herkenning van hetzelfde
verhaal, recency-, AI- en clickbaitfilters, het leersysteem, de planner, en een volledige
pipeline-run met nep-feeds en een nep-AI (inclusief het weggooien van verzonnen bronnen,
terugval zonder AI of bij een AI-fout, het niet herhalen van artikelen op de volgende dag, en
het weigeren van gelijktijdige runs).

## Mogelijke uitbreidingen

- Wekelijkse samenvatting en trendanalyse over de opgeslagen nieuwsbrieven.
- Embeddings voor betere ontdubbeling en een slimmer voorkeursprofiel.
- Meer bronnen (arXiv, Product Hunt, specifieke GitHub-repo's) via de registry.
- Postgres/Supabase-adapter voor serverless deployment.
