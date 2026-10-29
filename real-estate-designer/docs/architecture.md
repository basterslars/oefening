# Technische architectuur

## 1. Overzicht

```
┌──────────────────────────── Browser (Next.js client) ─────────────────────────────┐
│  Dashboard · Wizard · Editor (2D SVG + 3D R3F) · Staging · Presentatie · Deellink │
│                │                         │                                         │
│        Zustand editor-store  ◄──────────┘  (één projectdocument, undo/redo,        │
│                │                             autosave na 700 ms)                    │
│        ProjectRepository (adapter)                                                  │
│        ├─ LocalRepository   → IndexedDB (lokale modus, geen account)               │
│        └─ SupabaseRepository→ RPC save_project/project_document + Storage          │
└────────────────┬───────────────────────────────────────────────────────────────────┘
                 │ fetch (Bearer = Supabase-sessie in cloudmodus)
┌────────────────▼──────────── Next.js route handlers (server) ─────────────────────┐
│  /api/ai/status · analyze-photo · analyze-floorplan · design · stage               │
│  /api/reconstruct · /api/share/[token]                                             │
│        AI-adapters (src/lib/ai/server/providers.ts)                                │
│        ├─ VisionProvider / DesignProvider → Claude (Anthropic SDK, structured out) │
│        ├─ StagingProvider                 → OpenAI-compatibel images/edits         │
│        └─ ReconstructionProvider          → generieke HTTP-dienst                  │
└────────────────┬───────────────────────────────────────────────────────────────────┘
                 │
         Supabase (Postgres + RLS, Auth, Storage)        Externe AI-API's
```

Kernkeuzes:

- **Eén projectdocument** (`src/lib/types.ts`) is de bron van waarheid in de client. 2D- en 3D-weergave renderen beide uit dezelfde store, dus elke wijziging (in 2D of 3D) is direct in beide zichtbaar.
- **Opslag is een adapter.** Lokaal (IndexedDB) of Supabase, met identieke interface. In Supabase wordt het document door `save_project` in één transactie naar genormaliseerde tabellen geschreven, en door `project_document` weer samengesteld. RLS geldt omdat beide functies `security invoker` zijn.
- **AI is een adapter per capaciteit.** Zonder configuratie is een capaciteit "niet beschikbaar" en zegt de UI dat; er is geen nep-fallback. Alle AI-output is gestructureerd (Zod-schema → JSON-schema → structured outputs) en wordt client-side gevalideerd en vertaald naar gewone, bewerkbare elementen met herkomst `ai_estimate` / `ai_proposal`.

## 2. Projectstructuur

```
real-estate-designer/
├─ src/app/                      Routes (App Router)
│  ├─ page.tsx                   Dashboard
│  ├─ projects/new/              Wizard (methode A/B/C)
│  ├─ projects/[id]/             Werkruimte met tabs + autosave
│  ├─ projects/[id]/present/     Presentatiemodus
│  ├─ share/[token]/             Alleen-lezen deellink (met toegangscode)
│  ├─ login/                     Supabase-auth (alleen in cloudmodus)
│  └─ api/…                      AI-, reconstructie- en deel-endpoints
├─ src/components/
│  ├─ editor2d/FloorPlanEditor   SVG-editor: muren, ruimtes, deuren, ramen, kalibratie, drag & drop
│  ├─ editor3d/Scene3D           R3F-scene: muren met uitsparingen, vloeren, meubels, camera's
│  ├─ library/FurnitureLibrary   Catalogus met 3D-previews, eigen GLB-modellen
│  ├─ inspector/Inspector        Eigenschappen van selectie, herkomstlabels
│  ├─ ai/AssistantPanel          Ontwerpassistent: voorstel → 3D-voorbeeld → goedkeuren
│  ├─ project/…                  Werkruimte, overzicht, analyse, varianten, presentatie
│  ├─ staging/…                  Virtual staging, voor/na-schuifregelaar
│  └─ PresentationViewer         Gedeeld door presentatiemodus en deellink
├─ src/lib/
│  ├─ types.ts                   Domeinmodel
│  ├─ geometry.ts                Vectoren, polygonen, muurstukken rond openingen, SAT
│  ├─ catalog.ts                 Meubelcatalogus (afmetingen, lagen, materialen)
│  ├─ project.ts                 Factories, normalisatie/migratie van documenten
│  ├─ editor/store.ts            Zustand-store: acties, undo/redo, botsingsregels
│  ├─ editor/collision.ts        Plaatsingscontrole, vrije plek zoeken, wandsnap
│  ├─ three/                     Procedurele meubels, materialen/texturen, previews
│  ├─ storage/                   Repository-adapters, media, projectbestand
│  ├─ ai/                        Schema's, client, server-adapters, voorstel→variant
│  └─ export/                    PDF, CSV, plattegrondafbeelding, voor/na-compositie
├─ supabase/migrations/          Schema, RLS, document-API, deelfuncties, storage-policies
└─ tests/                        unit (Vitest), db (PGlite), e2e (Playwright)
```

## 3. Datamodel

| Concept | Client (`types.ts`) | Supabase-tabel |
|---|---|---|
| Gebruiker | sessie | `auth.users`, `profiles` |
| Project | `Project` / `ProjectMeta` | `projects` |
| Plattegrond (onderlegger, schaal) | `FloorPlan.background` | `floor_plans` |
| Ruimtes | `Room` (polygoon in m, herkomst) | `rooms` |
| Muren | `Wall` (a/b, dikte, hoogte, herkomst) | `walls` |
| Deuren/ramen | `Opening` (op muur, offset, borstwering) | `openings` |
| Ontwerpvarianten | `DesignVariant` (+ afwerking per ruimte) | `design_variants` |
| 3D-objecten | `FurnitureItem` | `furniture_items` |
| Geüploade bestanden | `MediaAsset` | `media_assets` + bucket `project-media` |
| Visualisaties | `Visualization` (render_3d / ai_image / uploaded) | `visualizations` |
| AI-analyses | `AIAnalysis` (ruwe gestructureerde output) | `ai_analyses` |
| Exports | – | `exports` (log) |
| Deellinks | `ShareSettings` | `project_shares` (token, verloop, bcrypt-code) |

Coördinaten: meters; plattegrond-`y` = scène-`z`. Een meubel met rotatie θ heeft zijn voorkant in richting `(-sin θ, cos θ)`; in de scène is `rotation.y = -θ`.

## 4. Belangrijkste componenten en algoritmen

- **Muren met openingen** (`geometry.wallPieces`): een muur wordt opgesplitst in massieve stukken (naast, onder en boven elke opening). Elk stuk wordt een `BoxGeometry` met per zijde de wandkleur van de aangrenzende ruimte.
- **Botsingsdetectie** (`editor/collision.ts`): footprints als georiënteerde rechthoeken; Separating Axis Theorem tegen muurrechthoeken en andere vloerobjecten. Lagen: vloer, vloerkleed, wand, oppervlak, plafond. Stoelen/krukken mogen onder tafels. Bij slepen glijdt een object langs een obstakel (x en y apart proberen).
- **Kalibratie**: twee punten + bekende afstand → pixels per meter van de onderlegger. Alles wat daarna getekend wordt krijgt herkomst `traced`.
- **AI-voorstel → variant** (`ai/apply.ts`): elk voorgesteld object wordt binnen de opgegeven ruimte geplaatst en gecontroleerd; botst het, dan wordt spiraalsgewijs de dichtstbijzijnde vrije plek gezocht; anders wordt het overgeslagen en gemeld. De basisvariant blijft onaangetast tot de gebruiker goedkeurt.
- **Plattegrondanalyse → plan**: genormaliseerde beeldcoördinaten → meters via de kalibratie van de gebruiker, of anders via de mediaan van maatvoeringen die de AI op de tekening las (expliciet gemeld). Zonder schaal wordt niets overgenomen.

## 5. Contract externe reconstructieservice

`POST RECONSTRUCTION_API_URL` (multipart): `files` (foto's/video's/plattegronden), `meta` (JSON met o.a. projecttype en plafondhoogte), optioneel `Authorization: Bearer RECONSTRUCTION_API_KEY`.

Verwachte respons (JSON), in meters:

```json
{
  "walls":    [{ "a": {"x": 0, "y": 0}, "b": {"x": 5, "y": 0}, "thickness": 0.2 }],
  "openings": [{ "wallIndex": 0, "type": "door", "offset": 1.2, "width": 0.9, "height": 2.1, "sill": 0 }],
  "rooms":    [{ "name": "Woonkamer", "polygon": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 4}, {"x": 0, "y": 4}] }],
  "confidence": 0.8
}
```

De route `/api/reconstruct` is beschikbaar als doorgeefluik; de UI-koppeling (resultaat als `ai_estimate` overnemen, net als de plattegrondanalyse) is de eerstvolgende stap zodra er een concrete dienst gekozen is.

## 6. Ontwikkelplan en status

| Fase | Inhoud | Status |
|---|---|---|
| 1 — Werkende basis | Dashboard, wizard, afmetingen, 2D tekenen, automatische 3D, camera's | ✅ gereed |
| 2 — Interactieve inrichting | Bibliotheek, toevoegen/slepen/draaien/verwijderen, materialen/kleuren, opslaan/laden, undo/redo | ✅ gereed |
| 3 — AI | Uploads (incl. PDF), foto- en plattegrondanalyse, ontwerpassistent, staging, meerdere varianten | ✅ gebouwd; live AI-test met eigen sleutel nog nodig |
| 4 — Vastgoedproduct | Accounts, RLS, deellinks, PDF, presentatiemodus, tests, foutafhandeling | ✅ gereed |

Aanbevolen vervolgstappen:

1. Live acceptatietest van de AI-functies met echte woningfoto's en plattegronden; prompts en effort afstemmen op kwaliteit/kosten.
2. Ruimtes automatisch afleiden uit gesloten muurlussen (nu tekent u ruimtes apart).
3. Polygoonruimtes tekenen met de muis (nu: rechthoek + hoekpunten verslepen).
4. Bibliotheek uitbreiden met fotorealistische GLB-modellen (licenties controleren).
5. Meerdere verdiepingen per project.
6. UI-koppeling voor een gekozen externe reconstructiedienst.
