"use client";

import { ArrowLeft, ArrowRight, Camera, Check, FileImage, Film, PencilRuler, Plus, Ruler, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button, Card, Field, Input, Notice, Select, Spinner, cx } from "@/components/ui";
import { ACCEPT, ingestFiles, UploadError } from "@/lib/media";
import { createProject, DEFAULT_CEILING } from "@/lib/project";
import { getRepository } from "@/lib/storage";
import { FURNISHING_LABELS, PROPERTY_TYPE_LABELS, type FurnishingState, type InputMethod, type PropertyType, type RoomInput } from "@/lib/types";

const STEPS = ["Woning", "Kenmerken", "Bestanden", "Methode"];

const parseNum = (s: string) => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

export default function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("appartement");
  const [roomCount, setRoomCount] = useState("");
  const [totalArea, setTotalArea] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [furnishing, setFurnishing] = useState<FurnishingState>("leeg");
  const [rooms, setRooms] = useState<{ name: string; length: string; width: string }[]>([
    { name: "Woonkamer", length: "", width: "" },
  ]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [plans, setPlans] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [method, setMethod] = useState<InputMethod>("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomInputs: RoomInput[] = rooms.map((r) => ({ name: r.name.trim(), length: parseNum(r.length), width: parseNum(r.width) }));
  const knownRooms = roomInputs.filter((r) => r.length && r.width);
  const roomsArea = knownRooms.reduce((s, r) => s + r.length! * r.width!, 0);

  const canNext = step === 0 ? name.trim().length > 0 : true;
  const methodValid = method !== "floorplan" || plans.length > 0;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const ceilingV = parseNum(ceiling);
      const areaV = parseNum(totalArea);
      const project = createProject({
        name,
        address,
        propertyType,
        furnishing,
        inputMethod: method,
        roomCount: roomCount ? parseInt(roomCount, 10) || null : null,
        totalArea: areaV ? { value: areaV, source: "user" } : null,
        ceilingHeight: ceilingV ? { value: ceilingV, source: "user" } : { value: DEFAULT_CEILING, source: "default" },
        rooms: roomInputs,
      });
      const media = [
        ...(await ingestFiles(project.id, photos, "photo")),
        ...(await ingestFiles(project.id, plans, "floorplan")),
        ...(await ingestFiles(project.id, videos, "video")),
      ];
      project.media = media;
      if (method === "floorplan") {
        const bg = media.find((m) => m.kind === "floorplan" && m.mime.startsWith("image/"));
        if (bg) project.plan.background = { assetId: bg.id, pxPerMeter: null, offset: { x: 0, y: 0 }, opacity: 0.6, widthPx: bg.width ?? 1000, heightPx: bg.height ?? 1000, visible: true };
      }
      project.status = "in_bewerking";
      await getRepository().save(project);
      const tab = method === "photo" ? "analyse" : "plattegrond";
      router.push(`/projects/${project.id}?tab=${tab}${method === "floorplan" ? "&calibrate=1" : ""}`);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : `Project kon niet worden aangemaakt: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <button onClick={() => router.push("/")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Terug naar projecten
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Woning toevoegen</h1>

        <ol className="mt-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-accent text-white" : i === step ? "border-2 border-accent text-accent" : "border border-line text-muted")}>
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span className={cx("hidden text-[13px] sm:inline", i === step ? "font-medium" : "text-muted")}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
            </li>
          ))}
        </ol>

        <Card className="mt-6 p-6">
          {step === 0 && (
            <div className="grid gap-5">
              <Field label="Projectnaam">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Keizersgracht 112, 2e etage" autoFocus />
              </Field>
              <Field label="Type woning">
                <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value as PropertyType)}>
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Adres" hint="Optioneel. Wordt getoond in presentaties en exports.">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Straat, huisnummer, plaats" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Aantal kamers">
                  <Input type="number" min={0} value={roomCount} onChange={(e) => setRoomCount(e.target.value)} placeholder="bv. 4" />
                </Field>
                <Field label="Woonoppervlakte (m²)" hint="Indien bekend">
                  <Input inputMode="decimal" value={totalArea} onChange={(e) => setTotalArea(e.target.value)} placeholder="bv. 92" />
                </Field>
                <Field label="Plafondhoogte (m)" hint={`Leeg = standaard ${DEFAULT_CEILING.toString().replace(".", ",")} m`}>
                  <Input inputMode="decimal" value={ceiling} onChange={(e) => setCeiling(e.target.value)} placeholder="bv. 2,7" />
                </Field>
              </div>
              <Field label="Huidige staat">
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(FURNISHING_LABELS) as FurnishingState[]).map((k) => (
                    <button key={k} type="button" onClick={() => setFurnishing(k)} className={cx("rounded-lg border px-3 py-2.5 text-sm", furnishing === k ? "border-accent bg-accent-soft font-medium text-accent" : "border-line hover:bg-stone-50")}>
                      {FURNISHING_LABELS[k]}
                    </button>
                  ))}
                </div>
              </Field>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium">Afmetingen van ruimtes</span>
                  <span className="text-xs text-muted">Optioneel · lengte × breedte in meters</span>
                </div>
                <div className="grid gap-2">
                  {rooms.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_90px_90px_36px] gap-2">
                      <Input value={r.name} placeholder="Naam ruimte" aria-label="Naam ruimte" onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <Input inputMode="decimal" value={r.length} placeholder="Lengte" aria-label="Lengte" onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? { ...x, length: e.target.value } : x)))} />
                      <Input inputMode="decimal" value={r.width} placeholder="Breedte" aria-label="Breedte" onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? { ...x, width: e.target.value } : x)))} />
                      <button type="button" onClick={() => setRooms(rooms.filter((_, j) => j !== i))} className="flex items-center justify-center rounded-lg text-muted hover:bg-stone-100" aria-label="Ruimte verwijderen">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="ghost" className="mt-2" icon={<Plus size={14} />} onClick={() => setRooms([...rooms, { name: "", length: "", width: "" }])}>
                  Ruimte toevoegen
                </Button>
                {knownRooms.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Som van ingevoerde ruimtes: {roomsArea.toFixed(1).replace(".", ",")} m²
                    {parseNum(totalArea) && Math.abs(roomsArea - parseNum(totalArea)!) / parseNum(totalArea)! > 0.15 && (
                      <span className="text-amber-700"> — wijkt meer dan 15% af van de opgegeven woonoppervlakte; controleer de maten.</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5">
              <FileDrop icon={<Camera size={18} />} title="Foto's van de woning" hint="JPG of PNG · meerdere foto's mogelijk" accept={ACCEPT.photo} files={photos} onChange={setPhotos} />
              <FileDrop icon={<FileImage size={18} />} title="Plattegrond" hint="PDF, JPG of PNG" accept={ACCEPT.floorplan} files={plans} onChange={setPlans} />
              <FileDrop icon={<Film size={18} />} title="Video's (optioneel)" hint="MP4, MOV of WebM · worden bewaard als referentiemateriaal" accept={ACCEPT.video} files={videos} onChange={setVideos} />
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-3">
              <MethodCard
                active={method === "floorplan"}
                onClick={() => setMethod("floorplan")}
                icon={<Ruler size={20} />}
                title="A · Plattegrond overtrekken"
                text="Gebruik de geüploade plattegrond als ondergrond. U stelt de schaal in met een bekende afstand en tekent of controleert muren, deuren, ramen en ruimtes."
                warn={plans.length === 0 ? "Upload eerst een plattegrond in de vorige stap." : undefined}
              />
              <MethodCard
                active={method === "manual"}
                onClick={() => setMethod("manual")}
                icon={<PencilRuler size={20} />}
                title="B · Handmatig tekenen"
                text={knownRooms.length ? `Begin met ${knownRooms.length} ruimte(s) op basis van uw ingevoerde maten en pas de indeling aan in de editor.` : "Teken de plattegrond zelf met gereedschappen voor muren, ruimtes, deuren en ramen."}
              />
              <MethodCard
                active={method === "photo"}
                onClick={() => setMethod("photo")}
                icon={<Camera size={20} />}
                title="C · Foto-geassisteerd"
                text="Een AI-model analyseert uw foto's en doet een voorstel voor ruimtetype, kenmerken en globale verhoudingen. U controleert alles voordat het in het model komt."
                warn={photos.length === 0 ? "Upload foto's in de vorige stap om deze methode te gebruiken." : undefined}
              />
              {method === "photo" && (
                <Notice tone="ai">
                  Eén foto levert geen betrouwbare exacte afmetingen op. AI-schattingen worden in de hele applicatie gemarkeerd als <strong>AI-schatting</strong> totdat u ze bevestigt of corrigeert.
                </Notice>
              )}
            </div>
          )}

          {error && (
            <Notice tone="error" className="mt-5">
              {error}
            </Notice>
          )}

          <div className="mt-8 flex justify-between">
            <Button onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))} icon={<ArrowLeft size={16} />} disabled={busy}>
              {step === 0 ? "Annuleren" : "Vorige"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!canNext}>
                Volgende <ArrowRight size={16} />
              </Button>
            ) : (
              <Button variant="primary" onClick={create} disabled={busy || !methodValid || (method === "photo" && photos.length === 0)}>
                {busy ? <Spinner /> : <Check size={16} />} Project aanmaken
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}

function FileDrop({ icon, title, hint, accept, files, onChange }: { icon: React.ReactNode; title: string; hint: string; accept: string; files: File[]; onChange(f: File[]): void }) {
  const [over, setOver] = useState(false);
  return (
    <div>
      <label
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onChange([...files, ...Array.from(e.dataTransfer.files)]);
        }}
        className={cx("flex cursor-pointer items-center gap-4 rounded-xl border border-dashed px-4 py-4 transition", over ? "border-accent bg-accent-soft" : "border-stone-300 hover:bg-stone-50")}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-ink">{icon}</span>
        <span className="flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted">{hint} · sleep bestanden hierheen of klik</span>
        </span>
        <input type="file" multiple accept={accept} className="hidden" onChange={(e) => (onChange([...files, ...Array.from(e.target.files ?? [])]), (e.target.value = ""))} />
      </label>
      {files.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-1.5 text-[13px]">
              <span className="truncate">{f.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {(f.size / 1e6).toFixed(1)} MB
                <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`${f.name} verwijderen`} className="hover:text-ink">
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MethodCard({ active, onClick, icon, title, text, warn }: { active: boolean; onClick(): void; icon: React.ReactNode; title: string; text: string; warn?: string }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex gap-4 rounded-xl border p-4 text-left transition", active ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-line hover:bg-stone-50")}>
      <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", active ? "bg-accent text-white" : "bg-stone-100")}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{text}</span>
        {warn && <span className="mt-1 block text-xs text-amber-700">{warn}</span>}
      </span>
    </button>
  );
}
