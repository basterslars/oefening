import { getCatalogItem } from "./catalog";
import { rectPolygon } from "./geometry";
import type {
  DesignVariant,
  FloorPlan,
  FurnitureItem,
  Measured,
  Project,
  ProjectMeta,
  Room,
  RoomInput,
  Wall,
} from "./types";

export function uid(prefix = "") {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${r}` : r;
}

export const nowIso = () => new Date().toISOString();

export const DEFAULT_CEILING = 2.6;
export const DEFAULT_WALL_THICKNESS = 0.12;
export const EXTERIOR_WALL_THICKNESS = 0.25;

export function emptyPlan(): FloorPlan {
  return { walls: [], openings: [], rooms: [], background: null };
}

export function newVariant(name = "Basisontwerp", style = "Eigen ontwerp", furniture: FurnitureItem[] = []): DesignVariant {
  const t = nowIso();
  return { id: uid("var"), name, style, furniture, finishes: {}, createdAt: t, updatedAt: t };
}

export interface NewProjectInput {
  name: string;
  propertyType: Project["propertyType"];
  address: string;
  furnishing: Project["furnishing"];
  inputMethod: Project["inputMethod"];
  roomCount: number | null;
  totalArea: Measured | null;
  ceilingHeight: Measured;
  rooms: RoomInput[];
}

export function createProject(input: NewProjectInput): Project {
  const t = nowIso();
  const variant = newVariant();
  const plan = emptyPlan();
  if (input.inputMethod === "manual") {
    const { rooms, walls } = layoutRoomsFromInputs(input.rooms);
    plan.rooms = rooms;
    plan.walls = walls;
  }
  return {
    id: uid(),
    name: input.name.trim() || "Nieuw project",
    propertyType: input.propertyType,
    address: input.address.trim(),
    status: "concept",
    furnishing: input.furnishing,
    inputMethod: input.inputMethod,
    roomCount: input.roomCount,
    totalArea: input.totalArea,
    ceilingHeight: input.ceilingHeight,
    thumbnail: null,
    createdAt: t,
    updatedAt: t,
    plan,
    variants: [variant],
    activeVariantId: variant.id,
    media: [],
    visualizations: [],
    analyses: [],
    schemaVersion: 1,
  };
}

/**
 * Zet ruimtes waarvan de gebruiker lengte × breedte opgaf als rechthoeken naast
 * elkaar, inclusief muren. Dit is een startpunt dat in de 2D-editor verplaatst
 * en aangepast kan worden; het is géén reconstructie van de werkelijke indeling.
 */
export function layoutRoomsFromInputs(inputs: RoomInput[]): { rooms: Room[]; walls: Wall[] } {
  const rooms: Room[] = [];
  const walls: Wall[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  const maxRowW = 14;
  for (const r of inputs) {
    if (!r.length || !r.width || r.length <= 0 || r.width <= 0) continue;
    const w = r.length;
    const h = r.width;
    if (x > 0 && x + w > maxRowW) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    const room: Room = {
      id: uid("room"),
      name: r.name || `Ruimte ${rooms.length + 1}`,
      polygon: rectPolygon(x, y, w, h),
      floor: /bad|douche|toilet|wc/i.test(r.name) ? "tiles_light" : /keuken/i.test(r.name) ? "tiles_dark" : "oak",
      wallColor: "#f4f2ee",
      source: "user",
    };
    rooms.push(room);
    walls.push(...wallsForPolygon(room.polygon, DEFAULT_WALL_THICKNESS, "user"));
    x += w + 1;
    rowH = Math.max(rowH, h);
  }
  return { rooms, walls };
}

export function wallsForPolygon(poly: Room["polygon"], thickness: number, source: Wall["source"]): Wall[] {
  return poly.map((a, i) => ({
    id: uid("wall"),
    a: { ...a },
    b: { ...poly[(i + 1) % poly.length] },
    thickness,
    source,
  }));
}

export function newFurniture(catalogId: string, x: number, y: number, rotation = 0, overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  const c = getCatalogItem(catalogId);
  return {
    id: uid("obj"),
    catalogId,
    x,
    y,
    rotation,
    elevation: c.elevation ?? 0,
    color: c.defaultColor,
    finish: c.defaultFinish,
    source: "user",
    ...overrides,
  };
}

export function toMeta(p: Project): ProjectMeta {
  const {
    plan: _plan,
    variants: _v,
    activeVariantId: _a,
    media: _m,
    visualizations: _vis,
    analyses: _an,
    schemaVersion: _s,
    ...meta
  } = p;
  return meta;
}

export function activeVariant(p: Pick<Project, "variants" | "activeVariantId">): DesignVariant {
  return p.variants.find((v) => v.id === p.activeVariantId) ?? p.variants[0];
}

/** Effectieve afwerking van een ruimte binnen een variant */
export function roomFinish(room: Room, variant: DesignVariant | null) {
  const f = variant?.finishes[room.id];
  return { floor: f?.floor ?? room.floor, wallColor: f?.wallColor ?? room.wallColor };
}

/**
 * Valideert en herstelt een (geïmporteerd of uit opslag geladen) project, zodat
 * oudere of onvolledige documenten de editor niet laten crashen.
 */
export function normalizeProject(raw: unknown): Project {
  const p = raw as Partial<Project>;
  if (!p || typeof p !== "object" || typeof p.id !== "string") throw new Error("Ongeldig projectbestand");
  const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [newVariant()];
  const plan = { ...emptyPlan(), ...(p.plan ?? {}) };
  return {
    id: p.id,
    name: p.name ?? "Naamloos project",
    propertyType: p.propertyType ?? "anders",
    address: p.address ?? "",
    status: p.status ?? "concept",
    furnishing: p.furnishing ?? "leeg",
    inputMethod: p.inputMethod ?? "manual",
    roomCount: p.roomCount ?? null,
    totalArea: p.totalArea ?? null,
    ceilingHeight: p.ceilingHeight ?? { value: DEFAULT_CEILING, source: "default" },
    thumbnail: p.thumbnail ?? null,
    createdAt: p.createdAt ?? nowIso(),
    updatedAt: p.updatedAt ?? nowIso(),
    plan: {
      walls: plan.walls ?? [],
      openings: (plan.openings ?? []).filter((o) => (plan.walls ?? []).some((w) => w.id === o.wallId)),
      rooms: plan.rooms ?? [],
      background: plan.background ?? null,
    },
    variants: variants.map((v) => ({ ...v, furniture: v.furniture ?? [], finishes: v.finishes ?? {} })),
    activeVariantId: variants.some((v) => v.id === p.activeVariantId) ? p.activeVariantId! : variants[0].id,
    media: p.media ?? [],
    visualizations: p.visualizations ?? [],
    analyses: p.analyses ?? [],
    schemaVersion: 1,
  };
}
