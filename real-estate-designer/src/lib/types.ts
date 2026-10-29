/**
 * Domeinmodel van de AI Real Estate Designer.
 *
 * Coördinaten van de plattegrond zijn in meters. `x` loopt naar rechts, `y` loopt
 * (in 2D) naar beneden; in 3D wordt `y` van de plattegrond de `z`-as van de scène.
 */

export type Vec2 = { x: number; y: number };

/**
 * Herkomst van een maat of element. Dit wordt overal in de UI getoond, zodat
 * altijd duidelijk is welke maten door de gebruiker zijn ingevoerd en welke
 * door AI zijn geschat.
 */
export type Provenance =
  | "user" // door de gebruiker ingevoerd of getekend
  | "traced" // door de gebruiker overgetrokken op een geschaalde plattegrond
  | "ai_estimate" // voorstel/schatting van een AI-analyse (niet geverifieerd)
  | "default"; // standaardwaarde van de applicatie

export interface Measured {
  value: number;
  source: Provenance;
}

export type PropertyType =
  | "appartement"
  | "tussenwoning"
  | "hoekwoning"
  | "twee-onder-een-kap"
  | "vrijstaand"
  | "studio"
  | "penthouse"
  | "bedrijfsruimte"
  | "anders";

export type FurnishingState = "leeg" | "gedeeltelijk" | "gemeubileerd";
export type ProjectStatus = "concept" | "in_bewerking" | "gereed" | "gepresenteerd";
export type InputMethod = "floorplan" | "manual" | "photo";

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  /** Dikte in meters */
  thickness: number;
  /** Hoogte in meters; valt terug op de plafondhoogte van het project */
  height?: number;
  color?: string;
  source: Provenance;
}

export type OpeningType = "door" | "window";

export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  /** Afstand van het middelpunt van de opening tot punt `a` van de muur (m) */
  offset: number;
  width: number;
  height: number;
  /** Borstwering / onderkant raam boven de vloer (m). Deuren: 0 */
  sill: number;
  /** Draairichting van de deur: 1 of -1 */
  swing?: 1 | -1;
  source: Provenance;
}

export type FloorMaterialId =
  | "oak"
  | "walnut"
  | "herringbone"
  | "concrete"
  | "tiles_light"
  | "tiles_dark"
  | "marble"
  | "carpet";

export interface Room {
  id: string;
  name: string;
  /** Polygoon in meters, met de klok mee of tegen de klok in */
  polygon: Vec2[];
  floor: FloorMaterialId;
  wallColor: string;
  /** Herkomst van de afmetingen van deze ruimte */
  source: Provenance;
}

export interface FloorPlanBackground {
  assetId: string;
  /** Pixels per meter, bepaald via schaalkalibratie */
  pxPerMeter: number | null;
  /** Positie van de linkerbovenhoek van de afbeelding in meters */
  offset: Vec2;
  opacity: number;
  /** Natuurlijke afmetingen van de afbeelding in pixels */
  widthPx: number;
  heightPx: number;
  visible: boolean;
}

export interface FloorPlan {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  background: FloorPlanBackground | null;
}

export type MaterialFinish = "fabric" | "leather" | "wood" | "metal" | "matte" | "gloss" | "glass";

export interface FurnitureItem {
  id: string;
  catalogId: string;
  /** Positie (middelpunt van de footprint) in meters */
  x: number;
  y: number;
  /** Rotatie rond de verticale as in radialen */
  rotation: number;
  /** Hoogte boven de vloer (bv. wanddecoratie) */
  elevation: number;
  color: string;
  finish: MaterialFinish;
  /** Optioneel afwijkende afmetingen (m) */
  size?: { w: number; d: number; h: number };
  /** Voor eigen GLB/GLTF-modellen: id van het media-asset */
  modelAssetId?: string;
  /** Wie heeft dit object geplaatst */
  source: "user" | "ai_proposal";
}

export interface RoomFinish {
  floor?: FloorMaterialId;
  wallColor?: string;
}

export interface DesignVariant {
  id: string;
  name: string;
  style: string;
  description?: string;
  furniture: FurnitureItem[];
  /** Afwerkingen per ruimte die afwijken van de basisplattegrond */
  finishes: Record<string, RoomFinish>;
  createdAt: string;
  updatedAt: string;
}

export type MediaKind = "photo" | "floorplan" | "video" | "model" | "visualization";

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  /** Ruimte waar de foto bij hoort (optioneel) */
  roomId?: string;
  createdAt: string;
}

export interface Visualization {
  id: string;
  kind: "screenshot" | "before_after" | "staging";
  title: string;
  /** Asset met het resultaat */
  assetId: string;
  /** Voor voor-en-na / staging: het originele beeld */
  beforeAssetId?: string;
  variantId?: string;
  style?: string;
  /**
   * Wat dit beeld is. `render_3d` = render van het bewerkbare 3D-model;
   * `ai_image` = door een beeldmodel gegenereerde visualisatie (geen 3D-model);
   * `uploaded` = door de gebruiker aangeleverd (bv. extern gestaged).
   */
  origin: "render_3d" | "ai_image" | "uploaded";
  /** Door de gebruiker gekozen als beste versie (virtual staging) */
  favorite?: boolean;
  createdAt: string;
}

export interface AIAnalysis {
  id: string;
  kind: "photo" | "floorplan" | "design";
  assetId?: string;
  provider: string;
  model: string;
  createdAt: string;
  /** Ruwe gestructureerde output van de provider */
  result: unknown;
  status: "applied" | "pending" | "dismissed";
}

export interface RoomInput {
  name: string;
  length?: number;
  width?: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  propertyType: PropertyType;
  address: string;
  status: ProjectStatus;
  furnishing: FurnishingState;
  inputMethod: InputMethod;
  roomCount: number | null;
  totalArea: Measured | null;
  ceilingHeight: Measured;
  /** Kleine preview (data-URL, JPEG) voor de projectkaart */
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectMeta {
  plan: FloorPlan;
  variants: DesignVariant[];
  activeVariantId: string;
  media: MediaAsset[];
  visualizations: Visualization[];
  analyses: AIAnalysis[];
  schemaVersion: 1;
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  appartement: "Appartement",
  tussenwoning: "Tussenwoning",
  hoekwoning: "Hoekwoning",
  "twee-onder-een-kap": "Twee-onder-een-kap",
  vrijstaand: "Vrijstaande woning",
  studio: "Studio",
  penthouse: "Penthouse",
  bedrijfsruimte: "Bedrijfsruimte",
  anders: "Anders",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  concept: "Concept",
  in_bewerking: "In bewerking",
  gereed: "Gereed",
  gepresenteerd: "Gepresenteerd",
};

export const FURNISHING_LABELS: Record<FurnishingState, string> = {
  leeg: "Leeg",
  gedeeltelijk: "Gedeeltelijk ingericht",
  gemeubileerd: "Gemeubileerd",
};

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  user: "Ingevoerd",
  traced: "Overgetrokken",
  ai_estimate: "AI-schatting",
  default: "Standaard",
};
