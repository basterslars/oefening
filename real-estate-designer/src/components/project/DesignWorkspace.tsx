"use client";

import {
  Armchair,
  Box,
  Camera,
  DoorOpen,
  Eye,
  Footprints,
  Grid3x3,
  Layers,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Rotate3d,
  Ruler,
  Square,
  SquareSplitHorizontal,
  AppWindow,
  Columns2,
  PencilLine,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AssistantPanel } from "@/components/ai/AssistantPanel";
import { FloorPlanEditor } from "@/components/editor2d/FloorPlanEditor";
import type { CaptureApi } from "@/components/editor3d/Scene3D";
import { Inspector } from "@/components/inspector/Inspector";
import { FurnitureLibrary } from "@/components/library/FurnitureLibrary";
import { VariantBar } from "@/components/project/VariantBar";
import { Badge, Button, IconButton, Notice, Segmented, Select, Toggle, cx } from "@/components/ui";
import { sceneCapture } from "@/lib/editor/capture";
import { useEditor, type Tool } from "@/lib/editor/store";
import { composeSideBySide } from "@/lib/export/visuals";
import { activeVariant, DEFAULT_WALL_THICKNESS, EXTERIOR_WALL_THICKNESS, nowIso, uid } from "@/lib/project";
import { assetUrl, dataUrlToBlob, storeAsset } from "@/lib/storage";

const Scene3D = dynamic(() => import("@/components/editor3d/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">3D-weergave laden…</div>,
});

const TOOLS: { id: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Selecteren", key: "V", icon: <MousePointer2 size={16} /> },
  { id: "wall", label: "Muur", key: "W", icon: <PencilLine size={16} /> },
  { id: "room", label: "Ruimte", key: "R", icon: <Square size={16} /> },
  { id: "door", label: "Deur", key: "D", icon: <DoorOpen size={16} /> },
  { id: "window", label: "Raam", key: "F", icon: <AppWindow size={16} /> },
];

export function DesignWorkspace({ view, setView, startCalibration }: { view: "2d" | "3d" | "split"; setView(v: "2d" | "3d" | "split"): void; startCalibration: boolean }) {
  const [leftTab, setLeftTab] = useState<"draw" | "library">("draw");
  const [rightTab, setRightTab] = useState<"props" | "ai">("props");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [thickness, setThickness] = useState(DEFAULT_WALL_THICKNESS);
  const [roomWithWalls, setRoomWithWalls] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const notice = useEditor((s) => s.notice);
  const hasBg = useEditor((s) => !!s.project?.plan.background);
  const calibrated = useEditor((s) => !!s.project?.plan.background?.pxPerMeter);
  const captureRef = useRef<CaptureApi | null>(null);

  useEffect(() => {
    if (startCalibration && hasBg && !calibrated) useEditor.getState().setTool("calibrate");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij openen
  }, []);

  // Meldingen automatisch laten verdwijnen
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useEditor.getState().setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Maak de actieve 3D-weergave beschikbaar voor thumbnails
  useEffect(() => {
    const iv = setInterval(() => (sceneCapture.current = captureRef.current), 500);
    return () => {
      clearInterval(iv);
      sceneCapture.current = null;
    };
  }, []);

  async function saveScreenshot() {
    const cap = captureRef.current;
    const p = useEditor.getState().project;
    if (!cap || !p) return;
    setBusy("screenshot");
    try {
      // Selectiekaders horen niet in een presentatiebeeld
      useEditor.getState().select(null);
      await cap.nextFrame();
      const url = cap.capture({ type: "image/png" });
      const asset = await storeAsset(p.id, await dataUrlToBlob(url), "visualization", `3D-weergave ${new Date().toLocaleString("nl-NL")}.png`);
      const v = activeVariant(p);
      useEditor.getState().update(
        (d) => {
          d.media.push(asset);
          d.visualizations.push({ id: uid("vis"), kind: "screenshot", title: `3D-weergave · ${v.name}`, assetId: asset.id, variantId: v.id, style: v.style, origin: "render_3d", createdAt: nowIso() });
        },
        { history: false },
      );
      useEditor.getState().setNotice({ text: "Screenshot opgeslagen bij Presentatie & delen.", tone: "info" });
    } finally {
      setBusy(null);
    }
  }

  async function saveBeforeAfter() {
    const cap = captureRef.current;
    const st = useEditor.getState();
    const p = st.project;
    if (!cap || !p) return;
    setBusy("beforeafter");
    const wasShowing = st.showFurniture;
    try {
      st.select(null);
      st.setView({ showFurniture: false });
      await cap.nextFrame();
      const before = cap.capture({ type: "image/jpeg", quality: 0.92 });
      st.setView({ showFurniture: true });
      await cap.nextFrame();
      const after = cap.capture({ type: "image/jpeg", quality: 0.92 });
      const v = activeVariant(p);
      const combined = await composeSideBySide(before, after, ["Voor · leeg", `Na · ${v.name}`], "3D-visualisatie van een virtuele inrichting — meubels zijn niet aanwezig in de woning.");
      const aBefore = await storeAsset(p.id, await dataUrlToBlob(before), "visualization", "Voor (leeg).jpg");
      const aAfter = await storeAsset(p.id, combined, "visualization", `Voor-en-na ${v.name}.jpg`);
      useEditor.getState().update(
        (d) => {
          d.media.push(aBefore, aAfter);
          d.visualizations.push({ id: uid("vis"), kind: "before_after", title: `Voor-en-na · ${v.name}`, assetId: aAfter.id, beforeAssetId: aBefore.id, variantId: v.id, style: v.style, origin: "render_3d", createdAt: nowIso() });
        },
        { history: false },
      );
      useEditor.getState().setNotice({ text: "Voor-en-na-beeld opgeslagen bij Presentatie & delen.", tone: "info" });
    } finally {
      useEditor.getState().setView({ showFurniture: wasShowing });
      setBusy(null);
    }
  }

  const left = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <Segmented
          value={leftTab}
          onChange={setLeftTab}
          options={[
            { value: "draw", label: <><Ruler size={14} /> Tekenen</> },
            { value: "library", label: <><Armchair size={14} /> Meubels</> },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{leftTab === "draw" ? <DrawPanel thickness={thickness} setThickness={setThickness} roomWithWalls={roomWithWalls} setRoomWithWalls={setRoomWithWalls} onShow2d={() => view === "3d" && setView("2d")} /> : <FurnitureLibrary />}</div>
    </div>
  );

  const right = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <Segmented
          value={rightTab}
          onChange={setRightTab}
          options={[
            { value: "props", label: "Eigenschappen" },
            { value: "ai", label: <span className="text-ai">AI-assistent</span> },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{rightTab === "props" ? <Inspector /> : <AssistantPanel />}</div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-white lg:block">{left}</aside>
      {leftOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setLeftOpen(false)}>
          <aside className="h-full w-80 max-w-[85vw] bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
            {left}
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2">
          <IconButton label="Gereedschap en meubels" className="lg:hidden" onClick={() => setLeftOpen(true)}>
            <PanelLeft size={17} />
          </IconButton>
          <Segmented
            value={view}
            onChange={setView}
            size="sm"
            options={[
              { value: "2d", label: <><Grid3x3 size={13} /> 2D</> },
              { value: "3d", label: <><Box size={13} /> 3D</> },
              { value: "split", label: <><Columns2 size={13} /> Naast elkaar</>, title: "2D en 3D tegelijk; wijzigingen worden direct gesynchroniseerd" },
            ]}
          />
          {view !== "2d" && <ThreeDControls />}
          <div className="flex-1" />
          {view !== "2d" && (
            <>
              <Button size="sm" icon={<Camera size={14} />} onClick={saveScreenshot} disabled={!!busy}>
                Screenshot
              </Button>
              <Button size="sm" icon={<SquareSplitHorizontal size={14} />} onClick={saveBeforeAfter} disabled={!!busy}>
                Voor & na
              </Button>
            </>
          )}
          <IconButton label="Eigenschappen en AI" className="lg:hidden" onClick={() => setRightOpen(true)}>
            <PanelRight size={17} />
          </IconButton>
        </div>

        <div className="relative min-h-0 flex-1">
          <div className={cx("absolute inset-0 flex", view === "split" ? "flex-col md:flex-row" : "")}>
            {view !== "3d" && (
              <div className={cx("relative min-h-0 min-w-0", view === "split" ? "flex-1 border-b border-line md:border-b-0 md:border-r" : "flex-1")}>
                <FloorPlanEditor wallThickness={thickness} roomWithWalls={roomWithWalls} />
              </div>
            )}
            {view !== "2d" && (
              <div className="relative min-h-0 min-w-0 flex-1">
                <EditorScene captureRef={captureRef} />
              </div>
            )}
          </div>
          {notice && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <div className={cx("rounded-lg px-3 py-2 text-[13px] shadow-lift", notice.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-ink text-white")}>{notice.text}</div>
            </div>
          )}
          {!calibrated && hasBg && view !== "3d" && (
            <div className="absolute right-3 top-3 z-10 max-w-xs">
              <Notice tone="warn">
                De plattegrond is nog niet op schaal. Gebruik <strong>Schaal kalibreren</strong> en klik twee punten met een bekende afstand.
              </Notice>
            </div>
          )}
        </div>
        <VariantBar />
      </main>

      <aside className="hidden w-80 shrink-0 border-l border-line bg-white lg:block">{right}</aside>
      {rightOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20 lg:hidden" onClick={() => setRightOpen(false)}>
          <aside className="h-full w-80 max-w-[85vw] bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
            {right}
          </aside>
        </div>
      )}
    </div>
  );
}

function ThreeDControls() {
  const cameraMode = useEditor((s) => s.cameraMode);
  const wallMode = useEditor((s) => s.wallMode);
  const showFurniture = useEditor((s) => s.showFurniture);
  const setView = useEditor((s) => s.setView);
  return (
    <>
      <Segmented
        size="sm"
        value={cameraMode}
        onChange={(v) => setView({ cameraMode: v })}
        options={[
          { value: "orbit", label: <><Rotate3d size={13} /> Rondom</>, title: "Draai rond het model (slepen), zoom (scroll), verschuif (rechtermuisknop)" },
          { value: "top", label: <><Layers size={13} /> Boven</>, title: "Bovenaanzicht" },
          { value: "walk", label: <><Footprints size={13} /> Ooghoogte</>, title: "Loop door de woning: WASD/pijltjes, slepen om rond te kijken, Shift = sneller" },
        ]}
      />
      <Select value={wallMode} onChange={(e) => setView({ wallMode: e.target.value as typeof wallMode })} className="h-8 w-auto py-0 text-xs" aria-label="Zichtbaarheid muren">
        <option value="full">Muren: volledig</option>
        <option value="cutaway">Muren: verlaagd</option>
        <option value="hidden">Muren: verborgen</option>
      </Select>
      <Segmented
        size="sm"
        value={showFurniture ? "on" : "off"}
        onChange={(v) => setView({ showFurniture: v === "on" })}
        options={[
          { value: "on", label: <><Armchair size={13} /> Ingericht</> },
          { value: "off", label: <><Eye size={13} /> Leeg</> },
        ]}
      />
    </>
  );
}

function EditorScene({ captureRef }: { captureRef: React.MutableRefObject<CaptureApi | null> }) {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const showFurniture = useEditor((s) => s.showFurniture);
  const wallMode = useEditor((s) => s.wallMode);
  const cameraMode = useEditor((s) => s.cameraMode);
  const collisions = useEditor((s) => s.collisions);
  const modelUrls = useModelUrls();
  const st = useEditor.getState;
  return (
    <>
      <Scene3D
        className="h-full w-full"
        plan={project.plan}
        variant={activeVariant(project)}
        ceilingHeight={project.ceilingHeight.value}
        showFurniture={showFurniture}
        wallMode={wallMode}
        cameraMode={cameraMode}
        selectedItemId={selection?.kind === "item" ? selection.id : null}
        interactive
        collisions={collisions}
        modelUrls={modelUrls}
        onSelectItem={(id) => st().select(id ? { kind: "item", id } : null)}
        onDragStart={() => st().checkpoint()}
        onMoveItem={(id, patch) => st().updateItem(id, patch, { history: false })}
        captureRef={captureRef}
      />
      {project.plan.walls.length === 0 && project.plan.rooms.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-white/90 px-4 py-3 text-center text-sm shadow-soft">
            Nog niets om te tonen. Teken muren of ruimtes in de 2D-weergave.
          </div>
        </div>
      )}
      {cameraMode === "walk" && (
        <div className="pointer-events-none absolute bottom-3 left-3">
          <Badge>WASD / pijltjes om te lopen · slepen om rond te kijken · Shift = sneller</Badge>
        </div>
      )}
    </>
  );
}

/** Object-URL's van geüploade GLB/GLTF-modellen */
export function useModelUrls() {
  const project = useEditor((s) => s.project)!;
  const [urls, setUrls] = useState<Record<string, string>>({});
  const ids = project.media.filter((m) => m.kind === "model").map((m) => m.id).join(",");
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const id of ids.split(",").filter(Boolean)) {
        const u = await assetUrl(project.id, id);
        if (u) out[id] = u;
      }
      if (alive) setUrls(out);
    })();
    return () => {
      alive = false;
    };
  }, [ids, project.id]);
  return urls;
}

function DrawPanel({ thickness, setThickness, roomWithWalls, setRoomWithWalls, onShow2d }: { thickness: number; setThickness(v: number): void; roomWithWalls: boolean; setRoomWithWalls(v: boolean): void; onShow2d(): void }) {
  const tool = useEditor((s) => s.tool);
  const snap = useEditor((s) => s.snap);
  const gridStep = useEditor((s) => s.gridStep);
  const collisions = useEditor((s) => s.collisions);
  const project = useEditor((s) => s.project)!;
  const bg = project.plan.background;
  const plans = project.media.filter((m) => m.kind === "floorplan" && m.mime.startsWith("image/"));
  const st = useEditor.getState;
  return (
    <div className="space-y-5 p-3">
      <div>
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Gereedschap</div>
        <div className="grid grid-cols-3 gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => (st().setTool(t.id), onShow2d())}
              title={`${t.label} (${t.key})`}
              className={cx("flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11.5px] font-medium transition", tool === t.id ? "border-accent bg-accent text-white" : "border-line bg-white hover:bg-stone-50")}
              data-testid={`tool-${t.id}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
          {bg && (
            <button
              onClick={() => (st().setTool("calibrate"), onShow2d())}
              title="Schaal instellen met een bekende afstand"
              className={cx("flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11.5px] font-medium", tool === "calibrate" ? "border-bronze bg-bronze text-white" : "border-line bg-white hover:bg-stone-50")}
            >
              <Ruler size={16} />
              Schaal
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">Muren</div>
        <Segmented
          size="sm"
          value={thickness === EXTERIOR_WALL_THICKNESS ? "ext" : thickness === DEFAULT_WALL_THICKNESS ? "int" : "custom"}
          onChange={(v) => setThickness(v === "ext" ? EXTERIOR_WALL_THICKNESS : DEFAULT_WALL_THICKNESS)}
          options={[
            { value: "int", label: "Binnenmuur 12 cm" },
            { value: "ext", label: "Buitenmuur 25 cm" },
          ]}
        />
        <Toggle checked={roomWithWalls} onChange={setRoomWithWalls} label="Ruimte tekenen met muren" />
      </div>

      <div className="space-y-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">Raster & uitlijning</div>
        <Toggle checked={snap} onChange={(v) => st().setView({ snap: v })} label="Uitlijnen op raster" />
        <Select value={gridStep} onChange={(e) => st().setView({ gridStep: parseFloat(e.target.value) })} aria-label="Rastermaat">
          <option value={0.05}>Raster 5 cm</option>
          <option value={0.1}>Raster 10 cm</option>
          <option value={0.25}>Raster 25 cm</option>
          <option value={0.5}>Raster 50 cm</option>
        </Select>
        <Toggle checked={collisions} onChange={(v) => st().setView({ collisions: v })} label="Botsingsdetectie meubels" />
      </div>

      {(bg || plans.length > 0) && (
        <div className="space-y-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">Onderlegger (plattegrond)</div>
          <Select
            value={bg?.assetId ?? ""}
            onChange={(e) => {
              const a = plans.find((m) => m.id === e.target.value);
              st().update((d) => {
                d.plan.background = a ? { assetId: a.id, pxPerMeter: null, offset: { x: 0, y: 0 }, opacity: 0.6, widthPx: a.width ?? 1000, heightPx: a.height ?? 1000, visible: true } : null;
              });
            }}
            aria-label="Plattegrond als onderlegger"
          >
            <option value="">Geen onderlegger</option>
            {plans.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          {bg && (
            <>
              <Toggle checked={bg.visible} onChange={(v) => st().update((d) => void (d.plan.background!.visible = v), { history: false })} label="Zichtbaar" />
              <label className="block text-[13px]">
                Transparantie
                <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={(e) => st().update((d) => void (d.plan.background!.opacity = parseFloat(e.target.value)), { history: false })} className="mt-1 w-full" />
              </label>
              <p className="text-xs text-muted">{bg.pxPerMeter ? `Schaal: ${bg.pxPerMeter.toFixed(1)} px per meter (door u gekalibreerd).` : "Nog niet gekalibreerd — maten zijn nog niet betrouwbaar."}</p>
            </>
          )}
        </div>
      )}

      <div className="rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-muted">
        <strong className="text-ink">Tips:</strong> scroll om te zoomen, sleep een lege plek om te verschuiven. Typ tijdens het tekenen van een muur een lengte (bv. <kbd>3.6</kbd>) en druk Enter voor een exacte maat.
      </div>
    </div>
  );
}
