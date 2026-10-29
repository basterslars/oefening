# AI Real Estate Designer

Webapplicatie waarmee makelaars, ontwikkelaars, verhuurders en interieurontwerpers een woning digitaal reconstrueren (2D-plattegrond → interactief 3D-model), virtueel inrichten, stijlen vergelijken en presentaties maken.

De applicatie werkt **zonder account, server-database of AI-sleutel**. Alles wat daarvan afhangt (cloudopslag, deellinks, AI-analyse, AI-staging) wordt pas actief als het geconfigureerd is. Er worden nooit gesimuleerde AI-resultaten getoond.

## Wat werkt er

| Onderdeel | Status | Vereist |
|---|---|---|
| Dashboard: zoeken, filteren, sorteren, dupliceren, hernoemen, verwijderen, recent bewerkt | ✅ | – |
| Wizard: type woning, kamers, oppervlakte, plafondhoogte, staat, ruimtematen, foto's/PDF/video's | ✅ | – |
| Methode A: plattegrond (PDF/JPG/PNG) als onderlegger, schaal kalibreren, overtrekken | ✅ | – |
| Methode B: handmatig tekenen (muren, ruimtes, deuren, ramen), raster, uitlijning, exacte maten | ✅ | – |
| Methode C: foto-analyse (ruimtetype, kenmerken, maatschatting als *AI-schatting*) | ✅ | `ANTHROPIC_API_KEY` |
| AI-detectie van muren/deuren/ramen op een plattegrond, eerst als overlay ter controle | ✅ | `ANTHROPIC_API_KEY` |
| 3D: rondom draaien, bovenaanzicht, rondlopen op ooghoogte, muren volledig/verlaagd/verborgen, ingericht/leeg | ✅ | – |
| Meubelbibliotheek (45 objecten in 12 categorieën) met 3D-previews, eigen GLB-modellen | ✅ | – |
| Meubels toevoegen, slepen (2D én 3D), roteren, dupliceren, verwijderen, kleur/materiaal | ✅ | – |
| Botsingsdetectie (geen meubels door muren of over elkaar; stoelen mogen onder tafels) | ✅ | – |
| Vloermateriaal en wandkleur per ruimte per ontwerpvariant | ✅ | – |
| Ontwerpvarianten + twee varianten naast elkaar in 3D vergelijken | ✅ | – |
| AI-ontwerpassistent in natuurlijke taal → concrete, bewerkbare wijzigingen, eerst bekijken en goedkeuren | ✅ | `ANTHROPIC_API_KEY` |
| Virtual staging met AI-beeldgeneratie (origineel blijft bewaard, gemarkeerd als virtueel) | ✅ | `IMAGE_PROVIDER` + `IMAGE_API_KEY` |
| Virtual staging zonder AI: extern gestaged beeld uploaden, voor/na-schuif, favoriet kiezen | ✅ | – |
| Screenshots en voor-en-na-beelden uit 3D, opgeslagen bij het project | ✅ | – |
| PDF-presentatie, CSV met ruimtes/afmetingen, projectbestand (export/import) | ✅ | – |
| Presentatiemodus (alleen-lezen weergave voor klantgesprekken) | ✅ | – |
| Accounts, cloudopslag, beveiligde deellinks (verloopdatum, toegangscode, uitschakelen) | ✅ | Supabase |
| Undo/redo, autosave, hervatten na herladen/opnieuw inloggen | ✅ | – |

Overal in de interface staat bij maten de herkomst: **Ingevoerd**, **Overgetrokken** (op een gekalibreerde plattegrond), **AI-schatting** (paars, gestippeld, nog niet gecontroleerd) of **Standaard**.

## Snel starten

Vereist: Node.js 20.9+ (getest met 22).

```bash
cd real-estate-designer
npm install
npm run dev
```

Open http://localhost:3000. Zonder verdere configuratie draait de app in **lokale modus**: projecten en bestanden staan in de IndexedDB van de browser.

### AI inschakelen (optioneel, betaald)

Kopieer `.env.example` naar `.env.local` en vul in:

- `ANTHROPIC_API_KEY` — voor foto- en plattegrondanalyse en de ontwerpassistent (Claude, standaard `claude-opus-5-5`). Een API-account met tegoed is nodig.
- `IMAGE_PROVIDER=openai` + `IMAGE_API_KEY` — voor AI-beeldgeneratie bij virtual staging (OpenAI-compatibel `images/edits`-endpoint, standaard `gpt-image-1`). Ook betaald.

De sleutels worden alleen server-side gebruikt (API-routes onder `src/app/api`). In cloudmodus accepteren die routes alleen ingelogde gebruikers. **Let op:** in lokale modus is er geen login; zet een server met AI-sleutels dan niet publiek open.

### Cloudopslag, accounts en deellinks (optioneel)

1. Maak een (nieuw, apart) Supabase-project.
2. Voer de migratie uit: `supabase db push` met de Supabase CLI, of plak `supabase/migrations/20261029000000_initial_schema.sql` in de SQL-editor.
3. Vul `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` en (voor deellinks) `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

Daarna is inloggen verplicht en zien gebruikers via Row Level Security alleen hun eigen projecten. Delen gebeurt uitsluitend via een expliciet aangemaakte link (standaard 30 dagen geldig, optioneel met toegangscode, op elk moment uit te schakelen).

## Tests

```bash
npm test            # unit-tests (geometrie, botsingen, editor-store, AI-mapping, CSV, AI-schema's)
npm run test:db     # Supabase-schema in PGlite: document-API, RLS, deellinks, cascades
npm run typecheck && npm run lint

# End-to-end in Chromium tegen een draaiende productie-build:
npm run build && npm start &
BASE_URL=http://localhost:3000 npm run test:e2e
```

De E2E-tests doorlopen o.a.: project aanmaken via de wizard → muur tekenen → deur plaatsen → meubels toevoegen → 3D (rondom/boven/ooghoogte/naast elkaar) → voor-en-na + screenshot → autosave → herladen → PDF; en: PDF-plattegrond uploaden → schaal kalibreren (een getekende muur van 9 m komt uit op 9,00 m) → ruimte overtrekken → meubel in 3D verslepen (synchroon met 2D).

## Beperkingen (eerlijk overzicht)

- **Foto's geven geen exacte maten.** De foto-analyse schat afmetingen alleen met een herkenbare referentie (bv. een deur van ±2,1 m) en markeert ze als AI-schatting. Gebruik voor betrouwbare maten een plattegrond met kalibratie of eigen metingen.
- **AI-plattegronddetectie is een voorstel.** Vision-modellen geven coördinaten bij benadering; het resultaat wordt eerst als overlay getoond en na overnemen als AI-schatting gemarkeerd. Controleer en corrigeer in de editor.
- **De AI-integratie is niet live getest in deze ontwikkelomgeving** (er was geen API-sleutel beschikbaar). Getest zijn: request-opbouw, outputschema's, het omzetten van AI-voorstellen naar geldige, botsingsvrije meubelposities, en de foutafhandeling zonder sleutel. Test met een eigen sleutel voordat u er klanten mee bedient.
- **Virtual staging via AI** levert een 2D-beeld, geen aangepast 3D-model; dit wordt zo gelabeld. Beeldmodellen kunnen ramen of verhoudingen vervormen ondanks de instructie dat niet te doen — controleer elk beeld vóór publicatie. Woningadvertenties mogen niet misleiden (misleidende handelspraktijken, art. 6:193c BW); het label "Virtueel ingericht" staat daarom standaard aan en de originele foto blijft altijd beschikbaar.
- **Meubels** zijn eenvoudige procedurele 3D-modellen. Voor fotorealisme kunt u eigen `.glb`-modellen uploaden (`.gltf` met losse texturen wordt niet ondersteund).
- **Ruimtes en muren zijn losse elementen**: een ruimte aanpassen verplaatst muren niet automatisch (en andersom). Muurhoeken die op elkaar aansluiten bewegen wel mee.
- **Woonoppervlakte**: de app telt de getekende vloeroppervlakte. De gebruiksoppervlakte volgens NEN 2580 en de Branchebrede Meetinstructie (BBMI) kent uitzonderingen (o.a. ruimtes lager dan 1,5 m); gebruik de getallen niet als officiële meting.
- **Mobiel**: dashboard, overzicht, presentatie en deellinks werken op mobiel; tekenen in de editor is bedoeld voor desktop.

Zie [`docs/architecture.md`](docs/architecture.md) voor de technische architectuur, projectstructuur, componenten en het ontwikkelplan.
