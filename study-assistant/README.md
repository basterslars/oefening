# Persoonlijke AI-studieassistent

Webapplicatie waarmee je al je studiemateriaal per vak uploadt en daarmee studeert: een AI-docent die je eigen documenten gebruikt (met bronvermelding), oefententamens met directe beoordeling en rapport, flashcards met spaced repetition, een studieplanner die zichzelf bijstelt, voortgangsgrafieken en een kritische studiecoach.

Stack: **Next.js 16 (App Router) · Tailwind CSS 4 · shadcn/ui-conventies · Supabase (Postgres, Auth, Storage, pgvector) · Claude API**.

---

## Inhoud

1. [Functies](#functies)
2. [Architectuur (fase 1)](#architectuur-fase-1)
3. [Lokaal installeren](#lokaal-installeren)
4. [Online deployen](#online-deployen)
5. [Kosten en AI-configuratie](#kosten-en-ai-configuratie)
6. [Didactische keuzes en onderbouwing](#didactische-keuzes-en-onderbouwing)
7. [Testen](#testen)
8. [Beveiliging](#beveiliging)
9. [Beperkingen (eerlijk overzicht)](#beperkingen-eerlijk-overzicht)
10. [Projectstructuur](#projectstructuur)

---

## Functies

| Onderdeel | Wat het doet | AI nodig? |
|---|---|---|
| **Dashboard** | Vakken met beheersing, aankomende tentamens (aftellen), planning van vandaag + 2 dagen, dagdoelen, zwakke en recent bestudeerde onderwerpen, coach-signalen, snelknoppen | nee |
| **Vakken / studiemappen** | Vak met tentamendatum, materiaalomvang, moeilijkheid, kennisniveau, uren per week | nee |
| **Documenten** | Upload PDF, PPTX (incl. sprekersnotities), DOCX (incl. koppen en tabellen), XLSX (incl. formules), TXT/MD/CSV → tekst uitlezen, opknippen in fragmenten, categoriseren, kernbegrippen herkennen, doorzoekbaar maken | uitlezen/zoeken: nee · samenvatting + onderwerpen: ja (goedkoop model) |
| **Kennisbank** | Zoeken in eigen materiaal: full-text (Postgres) en optioneel hybride met embeddings (pgvector) | nee (embeddings optioneel via Voyage AI) |
| **AI-docent** | Chat met vier modi: *Uitleg* (Socratisch), *Tentamen*, *Oefenen*, *Snelle vraag*. Antwoorden gebaseerd op je eigen fragmenten met verwijzingen [B1], [B2]; meldt expliciet wanneer iets niet in je materiaal staat. Past zich aan op studiefase en gemeten zwakke onderwerpen. Formules (LaTeX) worden netjes weergegeven | ja |
| **Oefententamens** | Kies aantal, moeilijkheid, onderwerpen/documenten, vraagtypen (meerkeuze, open, casus, reken, begrip, toepassing), tijdslimiet en "adaptief". Na elke vraag: score, feedback, juist antwoord, uitleg en bronverwijzing. Rapport met totaalscore, score per onderwerp, fouten, onvoldoende beheerste onderwerpen en studieadvies | genereren en open vragen: ja · meerkeuze en rekenantwoorden nakijken: **lokaal** · rapport: **lokaal** |
| **Flashcards** | Automatisch genereren uit documenten of zelf maken/bewerken/verwijderen. Vak, onderwerp, type, moeilijkheid en beheersingsniveau per kaart. Herhalen met **FSRS** spaced repetition; herhalingen worden niet na de tentamendatum gepland | genereren: ja · herhalen: nee |
| **Studieplanner** | Planning per dag op basis van tentamendatum, materiaal, moeilijkheid, kennisniveau, gemeten beheersing, oefententamenscores en beschikbare uren. Gespreide herhalingen (1-3-7 dagen), oefenblokken, oefententamen + eindherhaling vlak voor het tentamen. Herplant automatisch elke dag en na nieuwe resultaten; waarschuwt als het niet haalbaar is | nee |
| **Voortgang** | Studietijd per week en per activiteit, gemaakte oefenvragen, gemiddelde en verloop van tentamenscores, beheersing per onderwerp/hoofdstuk, beheerst vs. aandacht nodig | nee |
| **Studiecoach** | Regelgebaseerde signalen (tentamen dichtbij + lage beheersing, achterstand, te weinig studietijd, opgestapelde flashcards, dalende scores), prioriteiten per vak, dagdoelen. Optioneel een **kritische AI-evaluatie** op basis van je cijfers | regels: nee · evaluatie: ja |

Er worden **geen nep- of voorbeeldgegevens** getoond: alles komt uit je eigen invoer, documenten en resultaten. Zonder `ANTHROPIC_API_KEY` werkt alles behalve de AI-functies, en de app zegt dat duidelijk.

---

## Architectuur (fase 1)

```
Browser (Next.js client components)
  │  • CRUD (vakken, onderwerpen, flashcards, planning) rechtstreeks via supabase-js → beveiligd door RLS
  │  • Upload rechtstreeks naar Supabase Storage (geen limiet van serverless request bodies)
  ▼
Next.js server (Server Components + Route Handlers in src/app/api)
  │  • documentverwerking  • zoeken  • AI-aanroepen (sleutel alleen server-side)
  │  • planner/coach/beoordeling: lokale, deterministische logica
  ▼
Supabase: Postgres (+ pgvector, full-text) · Auth · Storage          Claude API (+ optioneel Voyage AI)
```

### Belangrijkste keuzes en afwegingen

| Keuze | Waarom | Alternatief / afweging |
|---|---|---|
| **Next.js route handlers, geen aparte backend** | Eén codebase, eenvoudig te deployen (Vercel). Lange taken (documentverwerking, tentamen genereren) passen binnen `maxDuration = 300`s | Bij zeer grote documentcollecties: verwerking verplaatsen naar een achtergrondwachtrij (bijv. Supabase Edge Functions + queue) |
| **De gebruikerssessie, nooit de service-role key** | Alle data wordt gelezen/geschreven *als de gebruiker*; Row Level Security is dus de enige toegangsregel en ook API-routes kunnen niet bij andermans data | — |
| **Hybride zoeken (full-text + optioneel vector, Reciprocal Rank Fusion)** | Anthropic biedt zelf geen embeddings-API. Full-text zoeken in Postgres is gratis en werkt direct; embeddings (Voyage AI, door Anthropic aanbevolen) verbeteren zoeken op betekenis maar kosten een extra account en API-aanroepen. Met `EMBEDDING_PROVIDER=voyage` worden beide gecombineerd | Full-text gebruikt de taalonafhankelijke `simple`-configuratie (geen stemming), omdat studiemateriaal vaak NL én EN door elkaar is; prefix-matching (`wacc:*`) vangt een deel van de vervoegingen op |
| **Lokale logica waar het kan** | Meerkeuze en numerieke antwoorden nakijken, rapporten, planner, beheersing, coach-signalen, documentcategorie en kernbegrippen: geen API-kosten, direct en reproduceerbaar | Open vragen inhoudelijk nakijken kan niet betrouwbaar met regels → goedkoop model |
| **Drie modelrollen** | Kwaliteit waar het telt (uitleg, vragen maken), goedkoop voor bulk (nakijken, documentanalyse). Volledig configureerbaar | Zie [Kosten](#kosten-en-ai-configuratie) |
| **Gestructureerde uitvoer (JSON-schema) + validatie met Zod** | Gegenereerde vragen en kaarten worden gevalideerd voordat ze worden opgeslagen; ongeldige meerkeuzevragen worden weggefilterd | — |
| **FSRS i.p.v. SM-2** | Zie [onderbouwing](#didactische-keuzes-en-onderbouwing) | — |
| **Prompt caching** | Systeemprompts zijn stabiel (geen datums/ID's) en gemarkeerd voor caching | Werkt pas boven een minimale promptlengte |

### Datamodel (Postgres)

`profiles`, `courses`, `documents`, `document_chunks` (tekst + tsvector + optioneel `vector(1024)`), `topics` (beheersing 0–1 per onderwerp), `chat_sessions`, `chat_messages`, `exams`, `exam_questions`, `flashcards` (FSRS-toestand), `flashcard_reviews`, `study_sessions`, `plan_sessions`, `coach_reviews`, `ai_usage`. Plus SQL-functies `search_chunks` (hybride zoeken), `study_totals`, `study_daily`, `flashcard_counts`. Zie `supabase/migrations/`.

---

## Lokaal installeren

**Vereisten:** Node.js ≥ 20.9 en een Supabase-project (de gratis tier volstaat), óf de Supabase CLI met Docker voor een volledig lokale database.

```bash
cd study-assistant
npm ci
cp .env.example .env.local
```

### 1. Supabase instellen

**Optie A: Supabase in de cloud (eenvoudigst)**

1. Maak een project op [supabase.com](https://supabase.com).
2. Ga naar *SQL Editor*, plak de inhoud van `supabase/migrations/20261030000000_initial_schema.sql` en voer het uit. Dit maakt tabellen, RLS-policies, zoekfuncties, de extensie `vector` en de privé opslagbucket `documents`.
3. *Authentication → URL Configuration*: zet **Site URL** op `http://localhost:3000` en voeg `http://localhost:3000/auth/callback` toe aan **Redirect URLs**.
4. *Project Settings → API*: kopieer de **Project URL** en de **anon/publishable key** naar `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Optie B: volledig lokaal (Docker vereist)**

```bash
npx supabase init
npx supabase start
npx supabase db reset
```

`supabase start` toont de lokale URL en anon key; zet die in `.env.local`. Bevestigingsmails zie je dan in Inbucket/Mailpit (URL staat in de uitvoer).

### 2. AI (optioneel maar aanbevolen)

Zet `ANTHROPIC_API_KEY` (aan te maken in de [Anthropic Console](https://console.anthropic.com)). Optioneel `EMBEDDING_PROVIDER=voyage` + `VOYAGE_API_KEY` voor semantisch zoeken; documenten die al waren verwerkt, verwerk je daarna opnieuw (↻-knop bij het document).

### 3. Starten

```bash
npm run dev
```

Open http://localhost:3000, maak een account aan en volg de stappen op het dashboard.

---

## Online deployen

Getest pad: **Vercel + Supabase cloud**.

1. Importeer de repository in Vercel en zet de **Root Directory** op `study-assistant`.
2. Voeg dezelfde omgevingsvariabelen toe als in `.env.local` (nooit `ANTHROPIC_API_KEY` of `VOYAGE_API_KEY` met `NEXT_PUBLIC_`).
3. Voeg in Supabase de productie-URL toe als Site URL en `https://<jouw-domein>/auth/callback` als Redirect URL.
4. Documentverwerking en tentamens genereren kunnen tot enkele minuten duren; de routes vragen `maxDuration = 300`. Controleer de maximale functieduur van je Vercel-plan.

Elke andere Node-host werkt ook: `npm run build && npm start`.

---

## Kosten en AI-configuratie

Standaard gebruikt de app **Claude Opus 5.5** voor uitleg en voor het maken van vragen/kaarten, en **Claude Haiku 5.5** voor bulktaken (documentanalyse, open vragen nakijken). Alles is aan te passen in `.env.local`:

| Variabele | Standaard | Gebruikt voor |
|---|---|---|
| `AI_MODEL_TUTOR` | `claude-opus-5-5` | AI-docent, coach-evaluatie |
| `AI_MODEL_GENERATE` | `claude-opus-5-5` | oefententamens, flashcards |
| `AI_MODEL_FAST` | `claude-haiku-5-5` | documentanalyse, open vragen nakijken |
| `AI_EFFORT_*` | `medium` / `medium` / `low` | denkdiepte (meer = beter maar duurder/trager) |
| `AI_DAILY_TOKEN_BUDGET` | 1.500.000 | harde dagelijkse limiet per gebruiker |
| `AI_ANALYZE_DOCUMENTS` | `true` | samenvatting/onderwerpen bij upload |

**Indicatieve kosten** bij standaard API-prijzen (Opus 5.5: $4 / $20 per miljoen input/output-tokens; Haiku 5.5: $0,10 / $0,50). Dit zijn schattingen; werkelijke kosten hangen af van documentlengte, gesprekslengte en denkdiepte.

| Actie | Schatting |
|---|---|
| Eén vraag aan de AI-docent (≈ 6k tokens context, ≈ 800 tokens antwoord) | ≈ $0,03–0,06 |
| Oefententamen van 10 vragen genereren | ≈ $0,15–0,40 |
| Open vraag nakijken (Haiku) | < $0,001 |
| Document analyseren bij upload (Haiku, max. 60k tekens) | ≈ $0,002 |

Bespaartips: zet `AI_MODEL_GENERATE` of `AI_MODEL_TUTOR` op `claude-sonnet-5-5` (circa de helft van de prijs) of verlaag de effort; gebruik *Snelle vraag* voor korte vragen. Het verbruik per functie staat onder **Instellingen**.

---

## Didactische keuzes en onderbouwing

De app is gebouwd rond leerstrategieën met de sterkste empirische onderbouwing. Kort en kritisch:

- **Zelftoetsing (retrieval practice) en gespreid leren** krijgen in de review van Dunlosky et al. (2013, *Psychological Science in the Public Interest*) als enige twee technieken het oordeel "high utility"; herlezen en markeren scoren "low utility". Daarom zijn oefententamens, flashcards en oefenblokken in de planner de kern, niet samenvattingen lezen. Het testing effect (Roediger & Karpicke, 2006) laat zien dat toetsen het onthouden op langere termijn sterker verbetert dan opnieuw bestuderen, ook al voelt herlezen productiever.
- **Spacing:** de meta-analyse van Cepeda et al. (2006) bevestigt het voordeel van gespreid herhalen; Cepeda et al. (2008) vonden dat het optimale interval meegroeit met de periode tot de toets. De planner gebruikt daarom oplopende herhalingsmomenten (1, 3, 7 dagen) binnen de periode tot het tentamen.
- **FSRS voor flashcards:** FSRS modelleert per kaart stabiliteit en moeilijkheid en plant een herhaling wanneer de geschatte kans op onthouden tot ~90% daalt. In de open benchmark van het open-spaced-repetition-project (miljoenen Anki-herhalingen) voorspelt FSRS het vergeten nauwkeuriger dan SM-2. Kanttekening: die benchmark meet voorspellingsnauwkeurigheid, niet direct tentamenresultaten.
- **Socratische AI-docent:** één-op-één tutoring is effectief (VanLehn, 2011: menselijke tutoring d ≈ 0,79 t.o.v. geen tutoring; Bloom's beroemde "2 sigma" uit 1984 is in latere studies niet in die omvang teruggevonden). Belangrijke waarschuwing uit recent onderzoek: in een veldexperiment (Bastani et al., *PNAS* 2025) scoorden scholieren die vrij GPT-4 mochten gebruiken bij oefenen *slechter* op de toets zonder AI dan de controlegroep; een variant die hints gaf in plaats van antwoorden voorkwam dat grotendeels. Daarom laat de *Uitleg*-modus je eerst zelf nadenken en geeft *Oefenen* hints vóór uitwerkingen. Gebruik *Snelle vraag* dus niet als vervanging van zelf oefenen.
- **Eerlijke feedback:** de coach en het tentamenrapport benoemen expliciet onvoldoende niveaus; ongeteste onderwerpen tellen als 0% beheersing, omdat je niet weet of je ze beheerst. Dat geeft een strenger maar realistischer beeld dan "gemiddelde van wat je hebt geoefend".

---

## Testen

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # unit tests: documenten uitlezen (echte PDF/DOCX/PPTX/XLSX), chunking, zoekquery, FSRS, beheersing, nakijken, rapport, planner, coach
npm run test:db     # databaseschema in PGlite + pgvector: RLS, opslagpolicies, hybride zoeken, aggregaties, cascades
npm run build && npm run test:e2e   # UI-rooktest: alle pagina's op desktop en mobiel (Playwright) tegen een nagebootste Supabase
```

De E2E-test start de echte app en vervangt alleen de Supabase-HTTP-API door een kleine nabootsing met testgegevens (`tests/e2e/mock-supabase.mjs`). Hij controleert per pagina: geen serverfouten, geen console-/hydratiefouten, geen horizontale overflow op mobiel, en maakt screenshots in `test-results/`.

**Niet automatisch getest:** echte Claude-aanroepen (vereisen een API-sleutel en kosten geld) en een echte Supabase-instantie (Auth-mails, Storage-uploads). Test die na installatie handmatig: upload een document, stel een vraag, genereer een tentamen en flashcards.

---

## Beveiliging

- **Row Level Security** op alle tabellen (`user_id = auth.uid()`), plus een restrictieve policy die koppelen aan andermans vak blokkeert. Getest in `tests/db/schema.test.mjs`.
- **Opslag:** privé bucket; je kunt alleen bestanden lezen/schrijven in je eigen map `<user-id>/…`. Downloads via kortlevende signed URLs.
- **Sleutels** (`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`) worden alleen server-side gelezen (`src/lib/config.ts` is `server-only`). Er is geen service-role key nodig.
- **Validatie:** alle API-invoer via Zod; database-constraints als tweede vangnet.
- **Prompt injection:** documentinhoud wordt als `<bron>`-data aangeboden met de instructie die niet als opdracht te behandelen; studentantwoorden bij nakijken idem. AI-uitvoer wordt als Markdown zonder ruwe HTML gerenderd.
- **Kostenbescherming:** dagelijks tokenbudget per gebruiker; verbruik wordt per aanroep gelogd.

---

## Beperkingen (eerlijk overzicht)

- **Gescande PDF's** (alleen afbeeldingen) worden niet herkend; OCR zit er niet in. De app meldt dit bij het verwerken.
- **Oude Office-formaten** (`.doc`, `.ppt`, `.xls`) worden niet ondersteund; sla op als `.docx`/`.pptx`/`.xlsx`.
- **Formules in PDF's** komen als platte tekst door; complexe opmaak (subscripts, breuken) kan rommelig zijn.
- **AI kan fouten maken**, ook met bronnen. Bronverwijzingen maken controle mogelijk; de instructies verminderen verzinnen maar sluiten het niet uit.
- **Beheersingsmodel** (voortschrijdend gemiddelde per onderwerp) en **studielastschatting** (minuten per pagina per moeilijkheid) zijn transparante heuristieken, geen gevalideerde psychometrische modellen. De aannames staan in de planner zichtbaar; je kunt de geschatte uren zelf invullen.
- **Studietijd** wordt automatisch gelogd voor AI-docent, flashcards, tentamens en afgevinkte planningssessies. Zelfstandig lezen buiten de app telt alleen mee als je de geplande sessie afvinkt.
- **Onderwerpen** worden automatisch herkend als AI-analyse aan staat; zonder AI voeg je ze zelf toe.
- Lange documenten worden voor de AI-*samenvatting* gesampled (max. 60k tekens, gelijkmatig verdeeld); zoeken en vragen gebruiken wél het volledige document.
- Het dagbudget wisselt om middernacht in de tijdzone van de server.

---

## Projectstructuur

```
study-assistant/
├─ supabase/migrations/        databaseschema, RLS, zoekfuncties, opslagbucket
├─ src/
│  ├─ proxy.ts                 sessie verversen + doorsturen naar /login (Next 16 "proxy", voorheen middleware)
│  ├─ app/
│  │  ├─ (app)/                ingelogde pagina's: dashboard, courses, tutor, exams, flashcards, planner, progress, coach, settings
│  │  ├─ api/                  documentverwerking, zoeken, tutor-stream, tentamens, flashcards, planner, coach
│  │  ├─ login/, auth/         inloggen (wachtwoord of magic link), callback, uitloggen
│  ├─ components/              UI (shadcn/ui-stijl in components/ui), grafieken, Markdown/LaTeX
│  └─ lib/
│     ├─ docs/                 uitlezen (PDF/DOCX/PPTX/XLSX/tekst), chunking, lokale analyse
│     ├─ ai/                   Claude-client (budget, logging, fallbacks), prompts + schema's
│     ├─ planner.ts            planningsalgoritme (puur, getest)
│     ├─ srs.ts                FSRS-wrapper
│     ├─ exam.ts, mastery.ts   nakijken, rapport, beheersing
│     ├─ coach.ts              signalen, prioriteiten, dagdoelen
│     └─ search.ts, overview.ts, plan-service.ts, …
└─ tests/                      unit, db (PGlite) en e2e (Playwright)
```
