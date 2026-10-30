"use client";

import { create } from "zustand";
import { getCatalogItem } from "../catalog";
import { dist, polygonCentroid, wallLength } from "../geometry";
import { activeVariant, newFurniture, newVariant, nowIso, uid } from "../project";
import type { DesignVariant, FloorPlan, FurnitureItem, Opening, Project, Room, RoomFinish, Vec2, Wall } from "../types";
import { checkPlacement, findFreeSpot } from "./collision";

export type Tool = "select" | "wall" | "room" | "door" | "window" | "calibrate";
export type Selection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "room"; id: string }
  | { kind: "item"; id: string }
  | null;
export type WallMode = "full" | "cutaway" | "hidden";
export type CameraMode = "orbit" | "top" | "walk";

type Snapshot = Pick<Project, "plan" | "variants" | "activeVariantId">;

const HISTORY_LIMIT = 100;

interface EditorState {
  project: Project | null;
  /** Telt elke wijziging; autosave luistert hiernaar */
  revision: number;
  past: Snapshot[];
  future: Snapshot[];
  selection: Selection;
  tool: Tool;
  snap: boolean;
  gridStep: number;
  collisions: boolean;
  showFurniture: boolean;
  wallMode: WallMode;
  cameraMode: CameraMode;
  /** Laatste melding (bv. botsing) voor de statusbalk */
  notice: { text: string; tone: "info" | "warn" } | null;

  load(p: Project): void;
  unload(): void;
  /** Wijzig het project. `history: false` voor tussenstappen tijdens slepen. */
  update(recipe: (draft: Project) => void, opts?: { history?: boolean }): void;
  /** Leg de huidige staat vast in de geschiedenis (vóór een sleepactie) */
  checkpoint(): void;
  undo(): void;
  redo(): void;

  setTool(t: Tool): void;
  select(s: Selection): void;
  setView(p: Partial<Pick<EditorState, "snap" | "gridStep" | "collisions" | "showFurniture" | "wallMode" | "cameraMode">>): void;
  setNotice(n: EditorState["notice"]): void;

  addWall(a: Vec2, b: Vec2, thickness: number): string | null;
  updateWall(id: string, patch: Partial<Wall>, opts?: { history?: boolean }): void;
  moveWallEndpoint(id: string, end: "a" | "b", to: Vec2, opts?: { history?: boolean; connected?: boolean }): void;
  setWallLength(id: string, length: number): void;
  addRoom(room: Omit<Room, "id">, withWalls?: { thickness: number }): string;
  updateRoom(id: string, patch: Partial<Room>, opts?: { history?: boolean }): void;
  addOpening(o: Omit<Opening, "id">): string;
  updateOpening(id: string, patch: Partial<Opening>, opts?: { history?: boolean }): void;
  deleteSelection(): void;

  addItem(catalogId: string, at: Vec2, overrides?: Partial<FurnitureItem>): string | null;
  updateItem(id: string, patch: Partial<FurnitureItem>, opts?: { history?: boolean; enforce?: boolean }): boolean;
  duplicateItem(id: string): void;

  setActiveVariant(id: string): void;
  addVariant(name: string, style: string, base?: "empty" | "copy"): string;
  renameVariant(id: string, name: string, style?: string): void;
  deleteVariant(id: string): void;
  setRoomFinish(roomId: string, finish: RoomFinish): void;
  /** Vervangt een hele variant (bv. na goedkeuren AI-voorstel) */
  upsertVariant(v: DesignVariant, makeActive?: boolean): void;
}

const snap = (p: Project): Snapshot => structuredClone({ plan: p.plan, variants: p.variants, activeVariantId: p.activeVariantId });

function variantOf(p: Project) {
  return activeVariant(p);
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  revision: 0,
  past: [],
  future: [],
  selection: null,
  tool: "select",
  snap: true,
  gridStep: 0.1,
  collisions: true,
  showFurniture: true,
  wallMode: "full",
  cameraMode: "orbit",
  notice: null,

  load: (p) => set({ project: p, past: [], future: [], selection: null, revision: 0, tool: "select", notice: null }),
  unload: () => set({ project: null, past: [], future: [], selection: null }),

  update: (recipe, opts) => {
    const cur = get().project;
    if (!cur) return;
    const draft = structuredClone(cur);
    recipe(draft);
    draft.updatedAt = nowIso();
    const history = opts?.history ?? true;
    set((s) => ({
      project: draft,
      revision: s.revision + 1,
      past: history ? [...s.past, snap(cur)].slice(-HISTORY_LIMIT) : s.past,
      future: history ? [] : s.future,
    }));
  },

  checkpoint: () => {
    const cur = get().project;
    if (!cur) return;
    set((s) => ({ past: [...s.past, snap(cur)].slice(-HISTORY_LIMIT), future: [] }));
  },

  undo: () => {
    const { past, project } = get();
    if (!project || past.length === 0) return;
    const prev = past[past.length - 1];
    set((s) => ({
      project: { ...project, ...structuredClone(prev), updatedAt: nowIso() },
      past: past.slice(0, -1),
      future: [snap(project), ...s.future],
      revision: s.revision + 1,
      selection: null,
    }));
  },

  redo: () => {
    const { future, project } = get();
    if (!project || future.length === 0) return;
    const next = future[0];
    set((s) => ({
      project: { ...project, ...structuredClone(next), updatedAt: nowIso() },
      future: future.slice(1),
      past: [...s.past, snap(project)],
      revision: s.revision + 1,
      selection: null,
    }));
  },

  // Bij een teken-gereedschap vervalt de selectie, zodat grepen niet per ongeluk worden versleept
  setTool: (t) => set(t === "select" ? { tool: t } : { tool: t, selection: null }),
  select: (s) => set({ selection: s }),
  setView: (p) => set(p),
  setNotice: (n) => set({ notice: n }),

  addWall: (a, b, thickness) => {
    if (dist(a, b) < 0.05) return null;
    const id = uid("wall");
    get().update((d) => {
      d.plan.walls.push({ id, a, b, thickness, source: d.plan.background?.pxPerMeter ? "traced" : "user" });
    });
    return id;
  },

  updateWall: (id, patch, opts) =>
    get().update((d) => {
      const w = d.plan.walls.find((x) => x.id === id);
      if (w) Object.assign(w, patch, patch.source ? {} : { source: w.source === "ai_estimate" ? "user" : w.source });
      clampOpenings(d.plan);
    }, opts),

  moveWallEndpoint: (id, end, to, opts) =>
    get().update((d) => {
      const w = d.plan.walls.find((x) => x.id === id);
      if (!w) return;
      const from = { ...w[end] };
      w[end] = { ...to };
      if (w.source === "ai_estimate") w.source = "user";
      if (opts?.connected ?? true) {
        for (const o of d.plan.walls) {
          if (o.id === id) continue;
          if (dist(o.a, from) < 1e-3) o.a = { ...to };
          if (dist(o.b, from) < 1e-3) o.b = { ...to };
        }
      }
      clampOpenings(d.plan);
    }, opts),

  setWallLength: (id, length) => {
    const w = get().project?.plan.walls.find((x) => x.id === id);
    if (!w || length <= 0.05) return;
    const l = wallLength(w);
    const k = length / l;
    const to = { x: w.a.x + (w.b.x - w.a.x) * k, y: w.a.y + (w.b.y - w.a.y) * k };
    get().moveWallEndpoint(id, "b", to, { connected: true });
  },

  addRoom: (room, withWalls) => {
    const id = uid("room");
    get().update((d) => {
      d.plan.rooms.push({ ...room, id });
      if (withWalls) {
        const poly = room.polygon;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i];
          const b = poly[(i + 1) % poly.length];
          // Sla muren over die al bestaan (gedeelde wand tussen twee kamers)
          const exists = d.plan.walls.some((w) => (dist(w.a, a) < 0.02 && dist(w.b, b) < 0.02) || (dist(w.a, b) < 0.02 && dist(w.b, a) < 0.02));
          if (!exists) d.plan.walls.push({ id: uid("wall"), a: { ...a }, b: { ...b }, thickness: withWalls.thickness, source: room.source });
        }
      }
    });
    return id;
  },

  updateRoom: (id, patch, opts) =>
    get().update((d) => {
      const r = d.plan.rooms.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    }, opts),

  addOpening: (o) => {
    const id = uid(o.type);
    get().update((d) => {
      d.plan.openings.push({ ...o, id });
    });
    return id;
  },

  updateOpening: (id, patch, opts) =>
    get().update((d) => {
      const o = d.plan.openings.find((x) => x.id === id);
      if (o) Object.assign(o, patch);
      clampOpenings(d.plan);
    }, opts),

  deleteSelection: () => {
    const sel = get().selection;
    if (!sel) return;
    get().update((d) => {
      if (sel.kind === "wall") {
        d.plan.walls = d.plan.walls.filter((w) => w.id !== sel.id);
        d.plan.openings = d.plan.openings.filter((o) => o.wallId !== sel.id);
      } else if (sel.kind === "opening") d.plan.openings = d.plan.openings.filter((o) => o.id !== sel.id);
      else if (sel.kind === "room") {
        d.plan.rooms = d.plan.rooms.filter((r) => r.id !== sel.id);
        for (const v of d.variants) delete v.finishes[sel.id];
      } else if (sel.kind === "item") {
        const v = variantOf(d);
        v.furniture = v.furniture.filter((f) => f.id !== sel.id);
        v.updatedAt = nowIso();
      }
    });
    set({ selection: null });
  },

  addItem: (catalogId, at, overrides) => {
    const p = get().project;
    if (!p) return null;
    const v = variantOf(p);
    let item = newFurniture(catalogId, at.x, at.y, 0, overrides);
    if (get().collisions) {
      const free = findFreeSpot(item, v.furniture, p.plan.walls);
      if (!free) {
        get().setNotice({ text: "Geen vrije plek gevonden voor dit object. Maak ruimte of zet botsingsdetectie uit.", tone: "warn" });
        return null;
      }
      item = free;
    }
    get().update((d) => {
      const dv = variantOf(d);
      dv.furniture.push(item);
      dv.updatedAt = nowIso();
    });
    set({ selection: { kind: "item", id: item.id } });
    return item.id;
  },

  updateItem: (id, patch, opts) => {
    const p = get().project;
    if (!p) return false;
    const v = variantOf(p);
    const cur = v.furniture.find((f) => f.id === id);
    if (!cur) return false;
    const next = { ...cur, ...patch };
    const enforce = (opts?.enforce ?? true) && get().collisions;
    if (enforce && ("x" in patch || "y" in patch || "rotation" in patch || "size" in patch)) {
      const check = checkPlacement(next, v.furniture, p.plan.walls);
      // Een object dat al in botsing stond (bv. na het uitzetten van botsingsdetectie)
      // mag wel bewegen als de botsing er niet erger op wordt.
      const before = checkPlacement(cur, v.furniture, p.plan.walls);
      const worse = check.wallIds.length + check.itemIds.length > before.wallIds.length + before.itemIds.length;
      if (!check.ok && (before.ok || worse)) {
        get().setNotice({
          text: check.wallIds.length ? "Object kan niet door een muur geplaatst worden." : "Object zou een ander meubel overlappen.",
          tone: "warn",
        });
        return false;
      }
    }
    get().update((d) => {
      const dv = variantOf(d);
      const it = dv.furniture.find((f) => f.id === id);
      if (it) Object.assign(it, patch);
      dv.updatedAt = nowIso();
    }, opts);
    return true;
  },

  duplicateItem: (id) => {
    const p = get().project;
    if (!p) return;
    const it = variantOf(p).furniture.find((f) => f.id === id);
    if (!it) return;
    const { id: _id, ...rest } = it;
    const size = it.size ?? getCatalogItem(it.catalogId).size;
    get().addItem(it.catalogId, { x: it.x + size.w * 0.6, y: it.y + 0.2 }, { ...rest, x: it.x + size.w * 0.6, y: it.y + 0.2, source: "user" });
  },

  setActiveVariant: (id) =>
    get().update((d) => {
      if (d.variants.some((v) => v.id === id)) d.activeVariantId = id;
    }),

  addVariant: (name, style, base = "copy") => {
    const p = get().project;
    const v = newVariant(name, style);
    if (p && base === "copy") {
      const cur = variantOf(p);
      v.furniture = cur.furniture.map((f) => ({ ...f, id: uid("obj") }));
      v.finishes = structuredClone(cur.finishes);
    }
    get().update((d) => {
      d.variants.push(v);
      d.activeVariantId = v.id;
    });
    set({ selection: null });
    return v.id;
  },

  renameVariant: (id, name, style) =>
    get().update((d) => {
      const v = d.variants.find((x) => x.id === id);
      if (v) {
        v.name = name;
        if (style !== undefined) v.style = style;
      }
    }),

  deleteVariant: (id) =>
    get().update((d) => {
      if (d.variants.length <= 1) return;
      d.variants = d.variants.filter((v) => v.id !== id);
      if (d.activeVariantId === id) d.activeVariantId = d.variants[0].id;
    }),

  setRoomFinish: (roomId, finish) =>
    get().update((d) => {
      const v = variantOf(d);
      v.finishes[roomId] = { ...v.finishes[roomId], ...finish };
      v.updatedAt = nowIso();
    }),

  upsertVariant: (v, makeActive = true) =>
    get().update((d) => {
      const i = d.variants.findIndex((x) => x.id === v.id);
      if (i >= 0) d.variants[i] = v;
      else d.variants.push(v);
      if (makeActive) d.activeVariantId = v.id;
    }),
}));

/** Houdt openingen binnen hun muur na het inkorten van een muur */
function clampOpenings(plan: FloorPlan) {
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const l = wallLength(w);
    o.width = Math.min(o.width, Math.max(0.3, l - 0.02));
    o.offset = Math.min(Math.max(o.offset, o.width / 2), l - o.width / 2);
  }
  plan.openings = plan.openings.filter((o) => plan.walls.some((w) => w.id === o.wallId));
}

export function roomLabelPosition(r: Room) {
  return polygonCentroid(r.polygon);
}
