"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCatalogItem } from "@/lib/catalog";
import { checkPlacement, itemCorners, snapToWall } from "@/lib/editor/collision";
import { useEditor } from "@/lib/editor/store";
import {
  add,
  dist,
  formatArea,
  formatMeters,
  normalize,
  openingFits,
  orthoSnap,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  projectOnSegment,
  rectPolygon,
  snapPoint,
  snapToEndpoints,
  sub,
  wallAngle,
  wallLength,
} from "@/lib/geometry";
import { activeVariant, DEFAULT_WALL_THICKNESS, EXTERIOR_WALL_THICKNESS, roomFinish } from "@/lib/project";
import { FLOOR_SWATCH } from "@/lib/three/materials";
import type { FurnitureItem, Opening, Vec2, Wall } from "@/lib/types";
import { DND_CATALOG, DND_MODEL } from "../library/FurnitureLibrary";
import { useAssetUrl } from "../project/MediaThumb";
import { Button, Field, Input, Modal } from "../ui";

type Drag =
  | { kind: "pan"; sx: number; sy: number; tx: number; ty: number }
  | { kind: "wallEnd"; id: string; end: "a" | "b" }
  | { kind: "wallMove"; id: string; start: Vec2; a: Vec2; b: Vec2 }
  | { kind: "roomMove"; id: string; start: Vec2; poly: Vec2[] }
  | { kind: "roomVertex"; id: string; index: number }
  | { kind: "opening"; id: string }
  | { kind: "item"; id: string; start: Vec2; ox: number; oy: number }
  | { kind: "rect"; start: Vec2; cur: Vec2 }
  | null;

export interface EditorView {
  scale: number; // px per meter
  tx: number;
  ty: number;
}

const ENDPOINT_SNAP_PX = 12;

export function FloorPlanEditor({ wallThickness, roomWithWalls, onRequestCalibration }: { wallThickness: number; roomWithWalls: boolean; onRequestCalibration?: () => void }) {
  const project = useEditor((s) => s.project)!;
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const snap = useEditor((s) => s.snap);
  const gridStep = useEditor((s) => s.gridStep);
  const showFurniture = useEditor((s) => s.showFurniture);
  const ed = useEditor.getState;

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<EditorView>({ scale: 60, tx: 80, ty: 80 });
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [chain, setChain] = useState<Vec2[]>([]); // muurtekenen
  const [typed, setTyped] = useState(""); // getypte lengte tijdens tekenen
  const [calPoints, setCalPoints] = useState<Vec2[]>([]);
  const [calOpen, setCalOpen] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const drag = useRef<Drag>(null);
  const [dragState, setDragState] = useState<Drag>(null);
  const fitted = useRef(false);

  const plan = project.plan;
  const variant = activeVariant(project);
  const bg = plan.background;
  const bgScale = bg?.pxPerMeter ?? 100; // voorlopige schaal tot kalibratie

  const bgUrl = useAssetUrl(project.id, bg?.assetId);

  // Afmetingen van het tekenvlak volgen
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitToContent = useCallback(() => {
    const pts: Vec2[] = [...plan.walls.flatMap((w) => [w.a, w.b]), ...plan.rooms.flatMap((r) => r.polygon)];
    if (bg) pts.push(bg.offset, add(bg.offset, { x: bg.widthPx / bgScale, y: bg.heightPx / bgScale }));
    if (pts.length === 0) {
      setView({ scale: 60, tx: size.w / 2 - 5 * 60, ty: size.h / 2 - 4 * 60 });
      return;
    }
    const b = polygonBounds(pts);
    const scale = Math.min(200, Math.max(10, Math.min((size.w - 120) / Math.max(b.width, 1), (size.h - 120) / Math.max(b.height, 1))));
    setView({ scale, tx: size.w / 2 - (b.minX + b.width / 2) * scale, ty: size.h / 2 - (b.minY + b.height / 2) * scale });
  }, [plan.walls, plan.rooms, bg, bgScale, size.w, size.h]);

  // Passend maken bij openen, en opnieuw bij een formaatwijziging (bv. naast-elkaar-weergave)
  // zolang de gebruiker nog niet zelf heeft gezoomd of verschoven.
  const userMoved = useRef(false);
  useEffect(() => {
    if (size.w > 100 && (!fitted.current || !userMoved.current)) {
      fitted.current = true;
      fitToContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij formaatwijziging
  }, [size.w, size.h]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left - view.tx) / view.scale, y: (clientY - r.top - view.ty) / view.scale };
    },
    [view],
  );

  const snapWorld = useCallback(
    (p: Vec2, excludeWall?: string, from?: Vec2) => {
      const e = snapToEndpoints(p, plan.walls, ENDPOINT_SNAP_PX / view.scale, excludeWall);
      if (e) return e;
      let q = from ? orthoSnap(from, p) : p;
      if (snap) q = snapPoint(q, gridStep);
      return q;
    },
    [plan.walls, view.scale, snap, gridStep],
  );

  // Wisselen van gereedschap annuleert lopende tekenacties
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset bij wisselen van gereedschap
    setChain([]);
    setTyped("");
    setCalPoints([]);
  }, [tool]);

  // ---------- Toetsenbord ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const s = ed();
      if (e.code === "Space") {
        setSpaceDown(e.type === "keydown");
        return;
      }
      if (e.type !== "keydown") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && s.selection?.kind === "item") {
        e.preventDefault();
        s.duplicateItem(s.selection.id);
        return;
      }
      if (s.tool === "wall" && chain.length > 0) {
        if (/^[0-9.,]$/.test(e.key)) {
          setTyped((v) => v + (e.key === "," ? "." : e.key));
          return;
        }
        if (e.key === "Backspace" && typed) {
          setTyped((v) => v.slice(0, -1));
          return;
        }
        if (e.key === "Enter") {
          const l = parseFloat(typed);
          const from = chain[chain.length - 1];
          if (l > 0 && cursor) {
            const dir = normalize(sub(orthoSnap(from, cursor), from));
            if (dir.x || dir.y) {
              const to = add(from, { x: dir.x * l, y: dir.y * l });
              s.addWall(from, to, wallThickness);
              setChain([...chain, to]);
            }
          } else setChain([]);
          setTyped("");
          return;
        }
      }
      if (e.key === "Escape") {
        setChain([]);
        setTyped("");
        setCalPoints([]);
        s.select(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        s.deleteSelection();
        return;
      }
      if ((e.key === "q" || e.key === "e") && s.selection?.kind === "item") {
        const it = activeVariant(s.project!).furniture.find((f) => f.id === s.selection!.id);
        if (it) s.updateItem(it.id, { rotation: it.rotation + ((e.key === "e" ? 1 : -1) * Math.PI) / 12 });
        return;
      }
      const map: Record<string, typeof tool> = { v: "select", w: "wall", r: "room", d: "door", f: "window" };
      if (!mod && map[e.key.toLowerCase()]) s.setTool(map[e.key.toLowerCase()]);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [ed, chain, typed, cursor, wallThickness]);

  // ---------- Zoom ----------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userMoved.current = true;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView((v) => {
        const k = Math.exp(-e.deltaY * 0.0015);
        const scale = Math.min(400, Math.max(8, v.scale * k));
        const f = scale / v.scale;
        return { scale, tx: mx - (mx - v.tx) * f, ty: my - (my - v.ty) * f };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---------- Openingen plaatsen ----------
  const openingPreview = useMemo(() => {
    if ((tool !== "door" && tool !== "window") || !cursor) return null;
    let best: { wall: Wall; t: number; d: number } | null = null;
    for (const w of plan.walls) {
      const pr = projectOnSegment(cursor, w.a, w.b);
      if (pr.distance < 0.6 && (!best || pr.distance < best.d)) best = { wall: w, t: pr.t, d: pr.distance };
    }
    if (!best) return null;
    const l = wallLength(best.wall);
    const width = tool === "door" ? Math.min(0.9, l - 0.1) : Math.min(1.2, l - 0.1);
    let offset = best.t * l;
    if (snap) offset = Math.round(offset / 0.05) * 0.05;
    offset = Math.min(Math.max(offset, width / 2), l - width / 2);
    const o: Opening = {
      id: "preview",
      wallId: best.wall.id,
      type: tool,
      offset,
      width,
      height: tool === "door" ? 2.1 : 1.3,
      sill: tool === "door" ? 0 : 0.9,
      swing: 1,
      source: bg?.pxPerMeter ? "traced" : "user",
    };
    return { o, ok: width > 0.3 && openingFits(o, best.wall, plan.openings) };
  }, [tool, cursor, plan.walls, plan.openings, snap, bg?.pxPerMeter]);

  // ---------- Pointer-afhandeling ----------
  function startDrag(d: Drag, e: React.PointerEvent) {
    drag.current = d;
    setDragState(d);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (d && d.kind !== "pan" && d.kind !== "rect") ed().checkpoint();
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    const p = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || e.button === 2 || spaceDown || (tool === "select" && e.button === 0)) {
      if (tool === "select" && e.button === 0 && !spaceDown) ed().select(null);
      startDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty }, e);
      return;
    }
    if (e.button !== 0) return;
    if (tool === "wall") {
      const q = snapWorld(p, undefined, chain[chain.length - 1]);
      if (chain.length === 0) setChain([q]);
      else {
        const from = chain[chain.length - 1];
        const id = ed().addWall(from, q, wallThickness);
        // Afsluiten op het startpunt beëindigt de reeks
        if (id && dist(q, chain[0]) < 1e-3) setChain([]);
        else if (id) setChain([...chain, q]);
      }
      setTyped("");
    } else if (tool === "room") {
      const q = snap ? snapPoint(p, gridStep) : p;
      startDrag({ kind: "rect", start: q, cur: q }, e);
    } else if ((tool === "door" || tool === "window") && openingPreview?.ok) {
      const { id: _id, ...o } = openingPreview.o;
      const id = ed().addOpening(o);
      ed().select({ kind: "opening", id });
    } else if (tool === "calibrate") {
      const next = [...calPoints, p];
      setCalPoints(next);
      if (next.length === 2) setCalOpen(true);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = toWorld(e.clientX, e.clientY);
    setCursor(p);
    const d = drag.current;
    if (!d) return;
    const s = ed();
    switch (d.kind) {
      case "pan":
        userMoved.current = true;
        setView((v) => ({ ...v, tx: d.tx + e.clientX - d.sx, ty: d.ty + e.clientY - d.sy }));
        break;
      case "wallEnd": {
        const w = plan.walls.find((x) => x.id === d.id);
        if (!w) break;
        const other = d.end === "a" ? w.b : w.a;
        s.moveWallEndpoint(d.id, d.end, snapWorld(p, d.id, other), { history: false });
        break;
      }
      case "wallMove": {
        let delta = sub(p, d.start);
        if (snap) delta = snapPoint(delta, gridStep);
        const w = s.project!.plan.walls.find((x) => x.id === d.id);
        if (!w) break;
        // beide eindpunten verplaatsen; aangesloten muren rekken mee
        s.moveWallEndpoint(d.id, "a", add(d.a, delta), { history: false });
        s.moveWallEndpoint(d.id, "b", add(d.b, delta), { history: false });
        break;
      }
      case "roomMove": {
        let delta = sub(p, d.start);
        if (snap) delta = snapPoint(delta, gridStep);
        s.updateRoom(d.id, { polygon: d.poly.map((v) => add(v, delta)) }, { history: false });
        break;
      }
      case "roomVertex": {
        const r = s.project!.plan.rooms.find((x) => x.id === d.id);
        if (!r) break;
        const q = snapWorld(p);
        s.updateRoom(d.id, { polygon: r.polygon.map((v, i) => (i === d.index ? q : v)), source: r.source === "ai_estimate" ? "user" : r.source }, { history: false });
        break;
      }
      case "opening": {
        const o = s.project!.plan.openings.find((x) => x.id === d.id);
        const w = o && s.project!.plan.walls.find((x) => x.id === o.wallId);
        if (!o || !w) break;
        const l = wallLength(w);
        let off = projectOnSegment(p, w.a, w.b).t * l;
        if (snap) off = Math.round(off / 0.05) * 0.05;
        off = Math.min(Math.max(off, o.width / 2), l - o.width / 2);
        if (openingFits({ ...o, offset: off }, w, s.project!.plan.openings)) s.updateOpening(o.id, { offset: off }, { history: false });
        break;
      }
      case "item": {
        const it = activeVariant(s.project!).furniture.find((f) => f.id === d.id);
        if (!it) break;
        const cat = getCatalogItem(it.catalogId);
        let x = d.ox + p.x - d.start.x;
        let y = d.oy + p.y - d.start.y;
        if (snap) {
          x = Math.round(x / 0.05) * 0.05;
          y = Math.round(y / 0.05) * 0.05;
        }
        if (cat.layer === "wall") {
          const sw = snapToWall({ x, y }, (it.size ?? cat.size).d, s.project!.plan.walls);
          if (sw) {
            s.updateItem(it.id, sw, { history: false });
            break;
          }
        }
        // Probeer volledige verplaatsing; anders langs de muur/het object glijden
        if (!s.updateItem(it.id, { x, y }, { history: false }))
          if (!s.updateItem(it.id, { x, y: it.y }, { history: false })) s.updateItem(it.id, { x: it.x, y }, { history: false });
        break;
      }
      case "rect": {
        const q = snap ? snapPoint(p, gridStep) : p;
        const nd = { ...d, cur: q };
        drag.current = nd;
        setDragState(nd);
        break;
      }
    }
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setDragState(null);
    if (d?.kind === "rect") {
      const x = Math.min(d.start.x, d.cur.x);
      const y = Math.min(d.start.y, d.cur.y);
      const w = Math.abs(d.cur.x - d.start.x);
      const h = Math.abs(d.cur.y - d.start.y);
      if (w >= 0.5 && h >= 0.5) {
        const n = project.plan.rooms.length + 1;
        const id = ed().addRoom(
          { name: `Ruimte ${n}`, polygon: rectPolygon(x, y, w, h), floor: "oak", wallColor: "#f4f2ee", source: bg?.pxPerMeter ? "traced" : "user" },
          roomWithWalls ? { thickness: wallThickness } : undefined,
        );
        ed().select({ kind: "room", id });
        ed().setTool("select");
      }
    }
    ed().setNotice(null);
  }

  // ---------- Render ----------
  const S = view.scale;
  const W = (p: Vec2) => ({ x: p.x * S + view.tx, y: p.y * S + view.ty });
  const minorPx = gridStep * S;
  const showMinor = minorPx >= 6;
  const sel = selection;
  const selectedWall = tool === "select" && sel?.kind === "wall" ? plan.walls.find((w) => w.id === sel.id) : undefined;
  const selectedRoom = tool === "select" && sel?.kind === "room" ? plan.rooms.find((r) => r.id === sel.id) : undefined;
  const cursorSnapped = cursor && tool === "wall" ? snapWorld(cursor, undefined, chain[chain.length - 1]) : null;
  const typedLen = parseFloat(typed);
  const previewEnd =
    tool === "wall" && chain.length && cursorSnapped
      ? typedLen > 0
        ? add(chain[chain.length - 1], (() => {
            const dir = normalize(sub(cursorSnapped, chain[chain.length - 1]));
            return { x: dir.x * typedLen, y: dir.y * typedLen };
          })())
        : cursorSnapped
      : null;

  const cursorStyle = spaceDown || dragState?.kind === "pan" ? "grabbing" : tool === "select" ? "default" : "crosshair";

  return (
    <div
      className="relative h-full w-full select-none overflow-hidden bg-[#fbfaf8]"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_CATALOG) || e.dataTransfer.types.includes(DND_MODEL)) e.preventDefault();
      }}
      onDrop={(e) => {
        const catalogId = e.dataTransfer.getData(DND_CATALOG);
        const modelId = e.dataTransfer.getData(DND_MODEL);
        if (!catalogId && !modelId) return;
        e.preventDefault();
        const p = toWorld(e.clientX, e.clientY);
        if (modelId) {
          ed().addItem("custom-model", p, { modelAssetId: modelId, size: { w: 1, d: 1, h: 1 } });
          return;
        }
        const cat = getCatalogItem(catalogId);
        const sw = cat.layer === "wall" ? snapToWall(p, cat.size.d, plan.walls, 1.5) : null;
        ed().addItem(catalogId, sw ?? p, sw ? { rotation: sw.rotation } : undefined);
      }}
    >
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block touch-none"
        style={{ cursor: cursorStyle }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          setChain([]);
        }}
        onDoubleClick={() => setChain([])}
        data-testid="plan-svg"
      >
        <defs>
          <pattern id="grid-minor" width={minorPx} height={minorPx} patternUnits="userSpaceOnUse" x={view.tx} y={view.ty}>
            <path d={`M ${minorPx} 0 L 0 0 0 ${minorPx}`} fill="none" stroke="#efece6" strokeWidth={1} />
          </pattern>
          <pattern id="grid-major" width={S} height={S} patternUnits="userSpaceOnUse" x={view.tx} y={view.ty}>
            {showMinor && <rect width={S} height={S} fill="url(#grid-minor)" />}
            <path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#e2ddd4" strokeWidth={1} />
          </pattern>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#8a857c" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} fill="url(#grid-major)" onPointerDown={onBackgroundPointerDown} />

        {/* Achtergrond-plattegrond */}
        {bg && bgUrl && bg.visible && (
          <image
            href={bgUrl}
            x={W(bg.offset).x}
            y={W(bg.offset).y}
            width={(bg.widthPx / bgScale) * S}
            height={(bg.heightPx / bgScale) * S}
            opacity={bg.opacity}
            preserveAspectRatio="none"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Ruimtes */}
        {plan.rooms.map((r) => {
          const pts = r.polygon.map(W);
          const isSel = sel?.kind === "room" && sel.id === r.id;
          const fin = roomFinish(r, variant);
          return (
            <polygon
              key={r.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={FLOOR_SWATCH[fin.floor]}
              fillOpacity={isSel ? 0.45 : 0.28}
              stroke={isSel ? "#1f3a34" : r.source === "ai_estimate" ? "#6b4fa0" : "transparent"}
              strokeDasharray={r.source === "ai_estimate" ? "6 4" : undefined}
              strokeWidth={isSel ? 2 : 1.5}
              onPointerDown={(e) => {
                if (tool !== "select" || e.button !== 0 || spaceDown) return onBackgroundPointerDown(e);
                e.stopPropagation();
                ed().select({ kind: "room", id: r.id });
                startDrag({ kind: "roomMove", id: r.id, start: toWorld(e.clientX, e.clientY), poly: r.polygon.map((v) => ({ ...v })) }, e);
              }}
              style={{ cursor: tool === "select" ? "move" : undefined }}
            />
          );
        })}

        {/* Meubels (footprints) */}
        {showFurniture &&
          [...variant.furniture]
            .sort((a, b) => layerOrder(a) - layerOrder(b))
            .map((it) => <ItemFootprint key={it.id} it={it} W={W} S={S} selected={sel?.kind === "item" && sel.id === it.id} others={variant.furniture} walls={plan.walls} onPointerDown={(e) => {
              if (tool !== "select" || e.button !== 0 || spaceDown) return onBackgroundPointerDown(e);
              e.stopPropagation();
              ed().select({ kind: "item", id: it.id });
              startDrag({ kind: "item", id: it.id, start: toWorld(e.clientX, e.clientY), ox: it.x, oy: it.y }, e);
            }} />)}

        {/* Muren */}
        {plan.walls.map((w) => {
          const corners = wallCorners(w).map(W);
          const isSel = sel?.kind === "wall" && sel.id === w.id;
          return (
            <polygon
              key={w.id}
              points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={w.source === "ai_estimate" ? "#b9a6dc" : isSel ? "#1f3a34" : "#3a3833"}
              stroke={isSel ? "#1f3a34" : w.source === "ai_estimate" ? "#6b4fa0" : "#2a2925"}
              strokeWidth={1}
              strokeDasharray={w.source === "ai_estimate" ? "4 3" : undefined}
              onPointerDown={(e) => {
                if (tool !== "select" || e.button !== 0 || spaceDown) return onBackgroundPointerDown(e);
                e.stopPropagation();
                ed().select({ kind: "wall", id: w.id });
                startDrag({ kind: "wallMove", id: w.id, start: toWorld(e.clientX, e.clientY), a: { ...w.a }, b: { ...w.b } }, e);
              }}
              style={{ cursor: tool === "select" ? "move" : undefined }}
            />
          );
        })}

        {/* Openingen */}
        {plan.openings.map((o) => {
          const w = plan.walls.find((x) => x.id === o.wallId);
          if (!w) return null;
          return (
            <OpeningShape
              key={o.id}
              o={o}
              w={w}
              W={W}
              S={S}
              selected={sel?.kind === "opening" && sel.id === o.id}
              onPointerDown={(e) => {
                if (tool !== "select" || e.button !== 0) return onBackgroundPointerDown(e);
                e.stopPropagation();
                ed().select({ kind: "opening", id: o.id });
                startDrag({ kind: "opening", id: o.id }, e);
              }}
            />
          );
        })}
        {openingPreview && (() => {
          const w = plan.walls.find((x) => x.id === openingPreview.o.wallId)!;
          return <OpeningShape o={openingPreview.o} w={w} W={W} S={S} preview ok={openingPreview.ok} />;
        })()}

        {/* Maatvoering muren */}
        {S > 25 &&
          plan.walls.map((w) => {
            const l = wallLength(w);
            if (l * S < 50) return null;
            const mid = W({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
            let ang = (wallAngle(w) * 180) / Math.PI;
            if (ang > 90) ang -= 180;
            if (ang < -90) ang += 180;
            const n = normalize({ x: -(w.b.y - w.a.y), y: w.b.x - w.a.x });
            const off = (w.thickness / 2) * S + 10;
            return (
              <text key={`d-${w.id}`} x={mid.x + n.x * off} y={mid.y + n.y * off} transform={`rotate(${ang} ${mid.x + n.x * off} ${mid.y + n.y * off})`} textAnchor="middle" dominantBaseline="middle" className="pointer-events-none fill-stone-500 text-[11px] tabular-nums">
                {formatMeters(l)}
              </text>
            );
          })}

        {/* Ruimtelabels */}
        {plan.rooms.map((r) => {
          const c = W(polygonCentroid(r.polygon));
          return (
            <g key={`l-${r.id}`} className="pointer-events-none">
              <text x={c.x} y={c.y - 7} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
                {r.name}
              </text>
              <text x={c.x} y={c.y + 9} textAnchor="middle" className={r.source === "ai_estimate" ? "fill-ai text-[11px]" : "fill-stone-500 text-[11px]"}>
                {formatArea(polygonArea(r.polygon))}
                {r.source === "ai_estimate" ? " · AI-schatting" : ""}
              </text>
            </g>
          );
        })}

        {/* Grepen geselecteerde muur */}
        {selectedWall &&
          (["a", "b"] as const).map((end) => {
            const p = W(selectedWall[end]);
            return (
              <circle
                key={end}
                cx={p.x}
                cy={p.y}
                r={7}
                fill="white"
                stroke="#1f3a34"
                strokeWidth={2}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  // eslint-disable-next-line react-hooks/refs -- event-handler, wordt niet tijdens render uitgevoerd
                  startDrag({ kind: "wallEnd", id: selectedWall.id, end }, e);
                }}
              />
            );
          })}
        {selectedRoom &&
          selectedRoom.polygon.map((v, i) => {
            const p = W(v);
            return (
              <rect
                key={i}
                x={p.x - 5}
                y={p.y - 5}
                width={10}
                height={10}
                fill="white"
                stroke="#1f3a34"
                strokeWidth={2}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startDrag({ kind: "roomVertex", id: selectedRoom.id, index: i }, e);
                }}
              />
            );
          })}

        {/* Tekenvoorbeeld muur */}
        {tool === "wall" && chain.length > 0 && previewEnd && (() => {
          const a = W(chain[chain.length - 1]);
          const b = W(previewEnd);
          const l = dist(chain[chain.length - 1], previewEnd);
          return (
            <g className="pointer-events-none">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1f3a34" strokeWidth={Math.max(2, wallThickness * S)} strokeOpacity={0.45} strokeLinecap="square" />
              <rect x={(a.x + b.x) / 2 - 34} y={(a.y + b.y) / 2 - 24} width={68} height={18} rx={4} fill="#1f3a34" />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 15} textAnchor="middle" dominantBaseline="middle" className="fill-white text-[11px] font-medium tabular-nums">
                {typed ? `${typed} m` : formatMeters(l)}
              </text>
            </g>
          );
        })()}
        {tool === "wall" && cursorSnapped && (
          <circle cx={W(cursorSnapped).x} cy={W(cursorSnapped).y} r={4} fill="#1f3a34" className="pointer-events-none" />
        )}
        {dragState?.kind === "rect" && (() => {
          const a = W(dragState.start);
          const b = W(dragState.cur);
          const w = Math.abs(dragState.cur.x - dragState.start.x);
          const h = Math.abs(dragState.cur.y - dragState.start.y);
          return (
            <g className="pointer-events-none">
              <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="#1f3a34" fillOpacity={0.08} stroke="#1f3a34" strokeDasharray="5 4" />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} textAnchor="middle" className="fill-accent text-[12px] font-medium tabular-nums">
                {formatMeters(w)} × {formatMeters(h)} · {formatArea(w * h)}
              </text>
            </g>
          );
        })()}

        {/* Kalibratie */}
        {calPoints.map((p, i) => (
          <circle key={i} cx={W(p).x} cy={W(p).y} r={5} fill="#a07a4c" stroke="white" strokeWidth={2} className="pointer-events-none" />
        ))}
        {tool === "calibrate" && calPoints.length === 1 && cursor && (
          <line x1={W(calPoints[0]).x} y1={W(calPoints[0]).y} x2={W(cursor).x} y2={W(cursor).y} stroke="#a07a4c" strokeWidth={2} strokeDasharray="6 4" className="pointer-events-none" />
        )}
      </svg>

      {/* Statusinfo */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        {cursor && (
          <span className="rounded-md bg-white/90 px-2 py-1 tabular-nums shadow-sm">
            x {cursor.x.toFixed(2)} · y {cursor.y.toFixed(2)} m
          </span>
        )}
        {size.w > 760 && <span className="rounded-md bg-white/90 px-2 py-1 shadow-sm">{hintFor(tool, chain.length > 0)}</span>}
      </div>
      <div className="absolute bottom-3 right-3 flex gap-1">
        <Button size="sm" onClick={() => setView((v) => zoomAt(v, 1.25, size))}>
          +
        </Button>
        <Button size="sm" onClick={() => setView((v) => zoomAt(v, 0.8, size))}>
          −
        </Button>
        <Button size="sm" onClick={fitToContent}>
          Passend
        </Button>
      </div>

      <CalibrationModal
        open={calOpen}
        measured={calPoints.length === 2 ? dist(calPoints[0], calPoints[1]) : 0}
        onCancel={() => {
          setCalOpen(false);
          setCalPoints([]);
        }}
        onConfirm={(meters) => {
          if (!bg || calPoints.length !== 2) return;
          const pixelDist = dist(calPoints[0], calPoints[1]) * bgScale;
          const pxPerMeter = pixelDist / meters;
          ed().update((d) => {
            if (d.plan.background) d.plan.background.pxPerMeter = pxPerMeter;
          });
          setCalOpen(false);
          setCalPoints([]);
          ed().setTool("wall");
          onRequestCalibration?.();
          setTimeout(fitToContent, 0);
        }}
      />
    </div>
  );
}

function zoomAt(v: EditorView, k: number, size: { w: number; h: number }): EditorView {
  const scale = Math.min(400, Math.max(8, v.scale * k));
  const f = scale / v.scale;
  const mx = size.w / 2;
  const my = size.h / 2;
  return { scale, tx: mx - (mx - v.tx) * f, ty: my - (my - v.ty) * f };
}

function hintFor(tool: string, drawing: boolean) {
  switch (tool) {
    case "wall":
      return drawing ? "Klik voor het volgende punt · typ een lengte + Enter · Esc/dubbelklik om te stoppen" : "Klik om een muur te beginnen";
    case "room":
      return "Sleep een rechthoek om een ruimte te maken";
    case "door":
    case "window":
      return "Beweeg over een muur en klik om te plaatsen";
    case "calibrate":
      return "Klik twee punten waarvan u de echte afstand kent";
    default:
      return "Klik om te selecteren · sleep om te verplaatsen · scroll om te zoomen · Delete verwijdert";
  }
}

function layerOrder(it: FurnitureItem) {
  const l = getCatalogItem(it.catalogId).layer;
  return l === "rug" ? 0 : l === "floor" ? 1 : 2;
}

export function wallCorners(w: Wall): Vec2[] {
  const dir = normalize(sub(w.b, w.a));
  const n = { x: -dir.y * (w.thickness / 2), y: dir.x * (w.thickness / 2) };
  return [add(w.a, n), add(w.b, n), sub(w.b, n), sub(w.a, n)];
}

function OpeningShape({ o, w, W, S, selected, preview, ok, onPointerDown }: { o: Opening; w: Wall; W: (p: Vec2) => Vec2; S: number; selected?: boolean; preview?: boolean; ok?: boolean; onPointerDown?: (e: React.PointerEvent) => void }) {
  const dir = normalize(sub(w.b, w.a));
  const n = { x: -dir.y, y: dir.x };
  const c = add(w.a, { x: dir.x * o.offset, y: dir.y * o.offset });
  const h = o.width / 2;
  const t = w.thickness / 2 + 0.01;
  const p1 = add(c, { x: -dir.x * h, y: -dir.y * h });
  const p2 = add(c, { x: dir.x * h, y: dir.y * h });
  const rect = [add(p1, { x: n.x * t, y: n.y * t }), add(p2, { x: n.x * t, y: n.y * t }), add(p2, { x: -n.x * t, y: -n.y * t }), add(p1, { x: -n.x * t, y: -n.y * t })].map(W);
  const color = preview ? (ok ? "#1f3a34" : "#b91c1c") : selected ? "#1f3a34" : o.source === "ai_estimate" ? "#6b4fa0" : "#5c574e";
  const sw = o.swing ?? 1;
  const hinge = W(p1);
  const leafEnd = W(add(p1, { x: n.x * o.width * sw, y: n.y * o.width * sw }));
  const arcEnd = W(p2);
  return (
    <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "ew-resize" : undefined, pointerEvents: preview ? "none" : undefined }} opacity={preview ? 0.7 : 1}>
      <polygon points={rect.map((p) => `${p.x},${p.y}`).join(" ")} fill="white" stroke={color} strokeWidth={selected ? 2 : 1} />
      {o.type === "window" ? (
        <line x1={W(p1).x} y1={W(p1).y} x2={W(p2).x} y2={W(p2).y} stroke={color} strokeWidth={2} />
      ) : (
        <>
          <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={1.5} />
          <path d={`M ${leafEnd.x} ${leafEnd.y} A ${o.width * S} ${o.width * S} 0 0 ${sw > 0 ? 0 : 1} ${arcEnd.x} ${arcEnd.y}`} fill="none" stroke={color} strokeWidth={1} strokeDasharray="3 3" />
        </>
      )}
    </g>
  );
}

function ItemFootprint({ it, W, S, selected, others, walls, onPointerDown }: { it: FurnitureItem; W: (p: Vec2) => Vec2; S: number; selected: boolean; others: FurnitureItem[]; walls: Wall[]; onPointerDown: (e: React.PointerEvent) => void }) {
  const cat = getCatalogItem(it.catalogId);
  const pts = itemCorners(it).map(W);
  const colliding = !checkPlacement(it, others, walls).ok;
  const c = W({ x: it.x, y: it.y });
  const size = it.size ?? cat.size;
  const round = cat.shape === "rug_round" || cat.shape === "dining_table_round" || cat.shape === "side_table";
  const front = W({ x: it.x - Math.sin(it.rotation) * (size.d / 2), y: it.y + Math.cos(it.rotation) * (size.d / 2) });
  return (
    <g onPointerDown={onPointerDown} style={{ cursor: "move" }} data-testid="item-footprint">
      {round ? (
        <ellipse cx={c.x} cy={c.y} rx={(size.w / 2) * S} ry={(size.d / 2) * S} transform={`rotate(${(it.rotation * 180) / Math.PI} ${c.x} ${c.y})`} fill={it.color} fillOpacity={cat.layer === "rug" ? 0.35 : 0.75} stroke={colliding ? "#b91c1c" : selected ? "#1f3a34" : "#6f6b64"} strokeWidth={selected || colliding ? 2 : 1} />
      ) : (
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill={it.color} fillOpacity={cat.layer === "rug" ? 0.35 : 0.75} stroke={colliding ? "#b91c1c" : selected ? "#1f3a34" : "#6f6b64"} strokeWidth={selected || colliding ? 2 : 1} strokeDasharray={it.source === "ai_proposal" ? "4 3" : undefined} />
      )}
      {cat.layer !== "rug" && <line x1={c.x} y1={c.y} x2={front.x} y2={front.y} stroke="#00000033" strokeWidth={1} />}
      {S > 45 && size.w * S > 50 && (
        <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" className="pointer-events-none fill-ink text-[10px]">
          {cat.name}
        </text>
      )}
    </g>
  );
}

function CalibrationModal({ open, measured, onCancel, onConfirm }: { open: boolean; measured: number; onCancel(): void; onConfirm(m: number): void }) {
  const [v, setV] = useState("");
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Schaal instellen"
      footer={
        <>
          <Button onClick={onCancel}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              const m = parseFloat(v.replace(",", "."));
              if (m > 0) {
                onConfirm(m);
                setV("");
              }
            }}
          >
            Schaal toepassen
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Voer de werkelijke afstand in tussen de twee punten die u heeft aangeklikt — bijvoorbeeld een maatvoering op de plattegrond of de breedte van een standaard binnendeur (meestal 0,83 m dagmaat). Alle overgetrokken maten worden hierop gebaseerd.
      </p>
      <Field label="Werkelijke afstand (meter)" hint={`Huidige (ongekalibreerde) afstand: ${measured.toFixed(2)} eenheden`}>
        <Input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="bv. 4,20" onKeyDown={(e) => e.stopPropagation()} />
      </Field>
    </Modal>
  );
}

export { DEFAULT_WALL_THICKNESS, EXTERIOR_WALL_THICKNESS };
