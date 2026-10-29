"use client";

import { Camera, CheckCircle2, FileImage, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyzeFloorPlan, analyzePhoto, AIClientError, getCapabilities } from "@/lib/ai/client";
import { floorPlanFromAnalysis } from "@/lib/ai/apply";
import type { AICapabilities, FloorPlanAnalysis, PhotoAnalysis } from "@/lib/ai/schemas";
import { useEditor } from "@/lib/editor/store";
import { rectPolygon } from "@/lib/geometry";
import { nowIso, uid, wallsForPolygon, DEFAULT_WALL_THICKNESS } from "@/lib/project";
import { getRepository } from "@/lib/storage";
import type { AIAnalysis, MediaAsset } from "@/lib/types";
import { Badge, Button, Card, Notice, Spinner, cx } from "../ui";
import { MediaThumb, useAssetUrl } from "./MediaThumb";

const CONF_TONE = { laag: "warn", middel: "neutral", hoog: "ok" } as const;

export function AnalysisTab({ onOpenEditor }: { onOpenEditor(): void }) {
  const project = useEditor((s) => s.project)!;
  const [caps, setCaps] = useState<AICapabilities | null>(null);
  useEffect(() => {
    getCapabilities().then(setCaps);
  }, []);
  const photos = project.media.filter((m) => m.kind === "photo");
  const plans = project.media.filter((m) => m.kind === "floorplan" && m.mime.startsWith("image/"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold">AI-beeldanalyse</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Laat foto&apos;s en plattegronden analyseren voor een eerste voorstel. Resultaten zijn <strong>schattingen</strong>: één foto levert geen betrouwbare exacte afmetingen op. Alles wat u overneemt wordt gemarkeerd als <Badge tone="ai">AI-schatting</Badge> totdat u het controleert.
          </p>
        </div>
        {caps && !caps.vision.available && (
          <Notice tone="info">
            <strong>Beeldanalyse is niet geconfigureerd.</strong> Voeg <code>ANTHROPIC_API_KEY</code> toe aan <code>.env.local</code> (zie README). Zonder AI kunt u de woning volledig reconstrueren met de handmatige 2D-editor of door een plattegrond over te trekken.
            <div className="mt-2">
              <Button size="sm" onClick={onOpenEditor}>
                Naar de 2D-editor
              </Button>
            </div>
          </Notice>
        )}
        {caps?.reconstruction.available === false && (
          <p className="text-xs text-muted">Externe 3D-reconstructieservice: niet aangesloten (optioneel, zie docs/architecture.md).</p>
        )}

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <FileImage size={18} /> Plattegronden
          </h2>
          {plans.length === 0 ? (
            <p className="text-sm text-muted">Geen plattegrond geüpload. Voeg er een toe via het Overzicht.</p>
          ) : (
            <div className="grid gap-4">
              {plans.map((a) => (
                <FloorPlanAnalysisCard key={a.id} asset={a} disabled={!caps?.vision.available} onOpenEditor={onOpenEditor} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Camera size={18} /> Foto&apos;s
          </h2>
          {photos.length === 0 ? (
            <p className="text-sm text-muted">Geen foto&apos;s geüpload. Voeg ze toe via het Overzicht.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {photos.map((a) => (
                <PhotoAnalysisCard key={a.id} asset={a} disabled={!caps?.vision.available} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function latestAnalysis(analyses: AIAnalysis[], assetId: string, kind: AIAnalysis["kind"]) {
  return [...analyses].reverse().find((a) => a.assetId === assetId && a.kind === kind);
}

function PhotoAnalysisCard({ asset, disabled }: { asset: MediaAsset; disabled: boolean }) {
  const project = useEditor((s) => s.project)!;
  const existing = latestAnalysis(project.analyses, asset.id, "photo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = existing?.result as PhotoAnalysis | undefined;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const blob = await getRepository().getBlob(project.id, asset.id);
      if (!blob) throw new Error("Foto niet gevonden");
      const res = await analyzePhoto(blob, `Woningtype: ${project.propertyType}. Plafondhoogte opgegeven: ${project.ceilingHeight.source === "user" ? project.ceilingHeight.value + " m" : "onbekend"}.`);
      useEditor.getState().update((d) => void d.analyses.push({ id: uid("ai"), kind: "photo", assetId: asset.id, provider: res.provider, model: res.model, createdAt: nowIso(), result: res.result, status: "pending" }), { history: false });
    } catch (e) {
      setError(e instanceof AIClientError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function addRoom() {
    if (!r || !existing) return;
    const w = r.estimatedDimensions.widthM;
    const dpt = r.estimatedDimensions.depthM;
    if (!w || !dpt) return;
    const st = useEditor.getState();
    const p = st.project!;
    const maxX = Math.max(0, ...p.plan.walls.flatMap((x) => [x.a.x, x.b.x]), ...p.plan.rooms.flatMap((x) => x.polygon.map((v) => v.x)));
    const poly = rectPolygon(p.plan.rooms.length ? maxX + 1 : 0, 0, Math.round(w * 10) / 10, Math.round(dpt * 10) / 10);
    st.update((d) => {
      d.plan.rooms.push({ id: uid("room"), name: cap(r.roomType), polygon: poly, floor: "oak", wallColor: r.wallColorHex && /^#[0-9a-f]{6}$/i.test(r.wallColorHex) ? r.wallColorHex : "#f4f2ee", source: "ai_estimate" });
      d.plan.walls.push(...wallsForPolygon(poly, DEFAULT_WALL_THICKNESS, "ai_estimate"));
      const an = d.analyses.find((x) => x.id === existing.id);
      if (an) an.status = "applied";
      if (r.estimatedDimensions.ceilingHeightM && d.ceilingHeight.source !== "user") d.ceilingHeight = { value: r.estimatedDimensions.ceilingHeightM, source: "ai_estimate" };
    });
    st.setNotice({ text: "Ruimte toegevoegd als AI-schatting. Controleer de maten in de editor.", tone: "info" });
  }

  return (
    <Card className="overflow-hidden">
      <MediaThumb projectId={project.id} asset={asset} className="aspect-[16/9] w-full" />
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium">{asset.name}</span>
          <Button size="sm" variant="ai" disabled={disabled || busy} onClick={run} icon={busy ? <Spinner /> : <ScanSearch size={14} />}>
            {existing ? "Opnieuw" : "Analyseer"}
          </Button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {r && (
          <div className="space-y-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{cap(r.roomType)}</span>
              <Badge tone={CONF_TONE[r.roomTypeConfidence]}>zekerheid {r.roomTypeConfidence}</Badge>
              <Badge>{r.furnishing}</Badge>
            </div>
            <div className="rounded-lg bg-ai-soft p-3 text-[12.5px] text-[#4a3570]">
              <div className="mb-1 font-medium">Geschatte afmetingen (AI-schatting)</div>
              <div className="tabular-nums">
                Breedte {fmt(r.estimatedDimensions.widthM)} · Diepte {fmt(r.estimatedDimensions.depthM)} · Plafond {fmt(r.estimatedDimensions.ceilingHeightM)}
              </div>
              <div className="mt-1 opacity-80">Basis: {r.estimatedDimensions.basis} · zekerheid {r.estimatedDimensions.confidence}</div>
            </div>
            {r.features.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-stone-700">
                {r.features.map((f, i) => (
                  <li key={i}>
                    <span className="font-medium">{f.type.replace("_", " ")}</span>: {f.description}
                  </li>
                ))}
              </ul>
            )}
            {r.stagingSuggestions.length > 0 && (
              <details className="text-[12.5px]">
                <summary className="cursor-pointer font-medium">Suggesties voor presentatie</summary>
                <ul className="mt-1 list-disc pl-4 text-stone-700">
                  {r.stagingSuggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
            {r.caveats.length > 0 && <p className="text-[11.5px] text-muted">Let op: {r.caveats.join(" ")}</p>}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-muted">{existing && `${existing.model} · ${new Date(existing.createdAt).toLocaleString("nl-NL")}`}</span>
              {r.estimatedDimensions.widthM && r.estimatedDimensions.depthM ? (
                existing?.status === "applied" ? (
                  <Badge tone="ok">
                    <CheckCircle2 size={12} /> Overgenomen
                  </Badge>
                ) : (
                  <Button size="sm" onClick={addRoom}>
                    Ruimte overnemen als voorstel
                  </Button>
                )
              ) : (
                <span className="text-[11px] text-muted">Geen maatschatting mogelijk</span>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function FloorPlanAnalysisCard({ asset, disabled, onOpenEditor }: { asset: MediaAsset; disabled: boolean; onOpenEditor(): void }) {
  const project = useEditor((s) => s.project)!;
  const existing = latestAnalysis(project.analyses, asset.id, "floorplan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = useAssetUrl(project.id, asset.id);
  const r = existing?.result as FloorPlanAnalysis | undefined;
  const bg = project.plan.background?.assetId === asset.id ? project.plan.background : null;
  const img = { widthPx: asset.width ?? 1000, heightPx: asset.height ?? 1000 };
  const converted = useMemo(() => (r ? floorPlanFromAnalysis(r, img, bg?.pxPerMeter ?? null, bg?.offset ?? { x: 0, y: 0 }) : null), [r, bg?.pxPerMeter, bg?.offset, img.widthPx, img.heightPx]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const blob = await getRepository().getBlob(project.id, asset.id);
      if (!blob) throw new Error("Plattegrond niet gevonden");
      const res = await analyzeFloorPlan(blob, `Woningtype: ${project.propertyType}.`);
      useEditor.getState().update((d) => void d.analyses.push({ id: uid("ai"), kind: "floorplan", assetId: asset.id, provider: res.provider, model: res.model, createdAt: nowIso(), result: res.result, status: "pending" }), { history: false });
    } catch (e) {
      setError(e instanceof AIClientError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function apply(mode: "replace" | "add") {
    if (!converted || !existing) return;
    const st = useEditor.getState();
    st.update((d) => {
      if (mode === "replace") {
        d.plan.walls = [];
        d.plan.openings = [];
        d.plan.rooms = [];
      }
      d.plan.walls.push(...converted.plan.walls);
      d.plan.openings.push(...converted.plan.openings);
      d.plan.rooms.push(...converted.plan.rooms);
      // Zet deze plattegrond als onderlegger op dezelfde schaal, zodat de gebruiker kan controleren
      if (converted.pxPerMeter) {
        d.plan.background = { assetId: asset.id, pxPerMeter: bg?.pxPerMeter ?? converted.pxPerMeter, offset: bg?.offset ?? { x: 0, y: 0 }, opacity: 0.5, widthPx: img.widthPx, heightPx: img.heightPx, visible: true };
      }
      const an = d.analyses.find((x) => x.id === existing.id);
      if (an) an.status = "applied";
    });
    onOpenEditor();
  }

  return (
    <Card className="grid gap-0 overflow-hidden md:grid-cols-[1.2fr_1fr]">
      <div className="relative bg-stone-50">
        {url && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={asset.name} className="block w-full" />
            {r && (
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {r.rooms.map((room, i) => (
                  <polygon key={i} points={room.polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill="#6b4fa0" fillOpacity={0.12} stroke="#6b4fa0" strokeWidth={0.002} />
                ))}
                {r.walls.map((w, i) => (
                  <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#6b4fa0" strokeWidth={w.exterior ? 0.006 : 0.004} />
                ))}
                {r.openings.map((o, i) => (
                  <circle key={i} cx={o.x} cy={o.y} r={0.008} fill={o.type === "door" ? "#a07a4c" : "#2a7ab0"} />
                ))}
              </svg>
            )}
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium">{asset.name}</span>
          <Button size="sm" variant="ai" disabled={disabled || busy} onClick={run} icon={busy ? <Spinner /> : <ScanSearch size={14} />}>
            {existing ? "Opnieuw analyseren" : "Detecteer muren, deuren & ramen"}
          </Button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {!r && !error && <p className="text-[13px] text-muted">De AI zoekt muren, deuren, ramen, ruimtes en maatvoeringen op de tekening. U ziet het resultaat eerst als overlay en beslist zelf of u het overneemt.</p>}
        {r && converted && (
          <div className="space-y-2 text-[13px]">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="ai">{r.walls.length} muren</Badge>
              <Badge tone="ai">{r.openings.filter((o) => o.type === "door").length} deuren</Badge>
              <Badge tone="ai">{r.openings.filter((o) => o.type === "window").length} ramen</Badge>
              <Badge tone="ai">{r.rooms.length} ruimtes</Badge>
              <Badge tone={CONF_TONE[r.confidence]}>zekerheid {r.confidence}</Badge>
            </div>
            <div className={cx("rounded-lg p-3 text-[12.5px]", converted.scaleSource === "calibration" ? "bg-emerald-50 text-emerald-900" : converted.scaleSource === "ai_dimensions" ? "bg-ai-soft text-[#4a3570]" : "bg-amber-50 text-amber-900")}>
              {converted.scaleSource === "calibration" && "Schaal: door u gekalibreerd. Posities blijven AI-schattingen."}
              {converted.scaleSource === "ai_dimensions" && `Schaal afgeleid uit ${r.dimensions.length} maatvoering(en) die de AI op de tekening las (${converted.pxPerMeter!.toFixed(1)} px/m). Controleer dit met de kalibratietool.`}
              {converted.scaleSource === "none" && "Geen schaal bekend: er zijn geen maatvoeringen herkend en de plattegrond is niet gekalibreerd. Kalibreer eerst de schaal in de editor (Schaal-gereedschap) en kom dan terug."}
            </div>
            {r.dimensions.length > 0 && (
              <p className="text-[12px] text-muted">Gelezen maten: {r.dimensions.map((d) => d.text).join(", ")}</p>
            )}
            {r.caveats.length > 0 && <p className="text-[11.5px] text-muted">Let op: {r.caveats.join(" ")}</p>}
            {converted.pxPerMeter && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="primary" onClick={() => apply(project.plan.walls.length ? "replace" : "add")}>
                  {project.plan.walls.length ? "Vervang huidige plattegrond" : "Overnemen als voorstel"}
                </Button>
                {project.plan.walls.length > 0 && (
                  <Button size="sm" onClick={() => apply("add")}>
                    Toevoegen aan huidige
                  </Button>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted">Overgenomen elementen worden paars gestippeld getoond tot u ze bevestigt of aanpast.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function fmt(v: number | null) {
  return v ? `${v.toFixed(1).replace(".", ",")} m` : "onbekend";
}
function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
