import type { MaterialFinish } from "./types";

export type CatalogCategory =
  | "zitten"
  | "eten"
  | "slapen"
  | "opbergen"
  | "keuken"
  | "badkamer"
  | "verlichting"
  | "planten"
  | "wanddecoratie"
  | "vloerkleden"
  | "gordijnen"
  | "werken"
  | "eigen";

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  zitten: "Banken & fauteuils",
  eten: "Eettafels & stoelen",
  slapen: "Bedden & nachtkastjes",
  opbergen: "Kasten & dressoirs",
  keuken: "Keukenelementen",
  badkamer: "Badkamer",
  verlichting: "Lampen",
  planten: "Planten",
  wanddecoratie: "Wanddecoratie",
  vloerkleden: "Vloerkleden",
  gordijnen: "Gordijnen",
  werken: "Werkplek",
  eigen: "Eigen 3D-modellen",
};

/**
 * Plaatsingslaag; bepaalt botsingsregels.
 * - floor: staat op de vloer, botst met muren en andere vloerobjecten
 * - rug: ligt op de vloer, mag onder meubels liggen
 * - wall: hangt aan de muur (schilderij, gordijn), botst niet met muren
 * - surface: staat op een ander meubel (tafellamp)
 * - ceiling: hangt aan het plafond
 */
export type PlacementLayer = "floor" | "rug" | "wall" | "surface" | "ceiling";

export type ShapeId =
  | "sofa"
  | "sofa_corner"
  | "armchair"
  | "coffee_table"
  | "side_table"
  | "dining_table"
  | "dining_table_round"
  | "chair"
  | "bar_stool"
  | "bed"
  | "nightstand"
  | "wardrobe"
  | "sideboard"
  | "bookshelf"
  | "tv_cabinet"
  | "desk"
  | "office_chair"
  | "kitchen_base"
  | "kitchen_sink"
  | "kitchen_stove"
  | "kitchen_tall"
  | "kitchen_island"
  | "bathtub"
  | "shower"
  | "toilet"
  | "vanity"
  | "mirror"
  | "floor_lamp"
  | "table_lamp"
  | "pendant"
  | "plant_large"
  | "plant_small"
  | "painting"
  | "wall_shelf"
  | "rug_rect"
  | "rug_round"
  | "curtain"
  | "custom_model";

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  shape: ShapeId;
  /** Breedte (x), diepte (y/z) en hoogte in meters */
  size: { w: number; d: number; h: number };
  defaultColor: string;
  defaultFinish: MaterialFinish;
  finishes: MaterialFinish[];
  layer: PlacementLayer;
  /** Standaardhoogte boven de vloer (wand-/plafondobjecten) */
  elevation?: number;
  /** Shape-specifieke parameter (bv. aantal zitplaatsen) */
  variant?: number;
  /** Mag deze footprint overlappen met objecten in deze categorieën (stoel onder tafel) */
  tucksUnder?: ShapeId[];
  tags: string[];
}

const UPHOLSTERY: MaterialFinish[] = ["fabric", "leather"];
const WOODY: MaterialFinish[] = ["wood", "matte", "gloss"];
const HARD: MaterialFinish[] = ["matte", "gloss", "wood", "metal"];
const TABLES: ShapeId[] = ["dining_table", "dining_table_round", "kitchen_island", "desk", "coffee_table"];

export const CATALOG: CatalogItem[] = [
  // Zitten
  { id: "sofa-3", name: "Driezitsbank", category: "zitten", shape: "sofa", size: { w: 2.2, d: 0.92, h: 0.82 }, defaultColor: "#b9b2a6", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", variant: 3, tags: ["modern", "scandinavisch", "minimalistisch"] },
  { id: "sofa-2", name: "Tweezitsbank", category: "zitten", shape: "sofa", size: { w: 1.6, d: 0.88, h: 0.8 }, defaultColor: "#6f7d74", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", variant: 2, tags: ["compact", "jong"] },
  { id: "sofa-corner", name: "Hoekbank", category: "zitten", shape: "sofa_corner", size: { w: 2.8, d: 2.0, h: 0.82 }, defaultColor: "#8d8579", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", tags: ["gezin", "lounge"] },
  { id: "armchair", name: "Fauteuil", category: "zitten", shape: "armchair", size: { w: 0.82, d: 0.84, h: 0.8 }, defaultColor: "#c4a484", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", tags: ["klassiek", "lezen"] },
  { id: "armchair-leather", name: "Leren fauteuil", category: "zitten", shape: "armchair", size: { w: 0.86, d: 0.88, h: 0.82 }, defaultColor: "#6b4630", defaultFinish: "leather", finishes: UPHOLSTERY, layer: "floor", tags: ["luxe", "industrieel"] },
  { id: "coffee-table", name: "Salontafel", category: "zitten", shape: "coffee_table", size: { w: 1.2, d: 0.6, h: 0.4 }, defaultColor: "#a47b55", defaultFinish: "wood", finishes: HARD, layer: "floor", tags: ["modern"] },
  { id: "side-table", name: "Bijzettafel", category: "zitten", shape: "side_table", size: { w: 0.45, d: 0.45, h: 0.52 }, defaultColor: "#2f2f2f", defaultFinish: "metal", finishes: HARD, layer: "floor", tags: ["accent"] },

  // Eten
  { id: "dining-6", name: "Eettafel (6 pers.)", category: "eten", shape: "dining_table", size: { w: 1.8, d: 0.9, h: 0.75 }, defaultColor: "#b08a62", defaultFinish: "wood", finishes: HARD, layer: "floor", tags: ["gezin"] },
  { id: "dining-4", name: "Eettafel (4 pers.)", category: "eten", shape: "dining_table", size: { w: 1.4, d: 0.8, h: 0.75 }, defaultColor: "#d7c4a8", defaultFinish: "wood", finishes: HARD, layer: "floor", tags: ["compact"] },
  { id: "dining-round", name: "Ronde eettafel", category: "eten", shape: "dining_table_round", size: { w: 1.1, d: 1.1, h: 0.75 }, defaultColor: "#efefea", defaultFinish: "matte", finishes: HARD, layer: "floor", tags: ["scandinavisch"] },
  { id: "chair", name: "Eetkamerstoel", category: "eten", shape: "chair", size: { w: 0.46, d: 0.52, h: 0.82 }, defaultColor: "#3c3c3c", defaultFinish: "matte", finishes: [...HARD, "fabric"], layer: "floor", tucksUnder: TABLES, tags: [] },
  { id: "bar-stool", name: "Barkruk", category: "eten", shape: "bar_stool", size: { w: 0.42, d: 0.42, h: 0.75 }, defaultColor: "#2b2b2b", defaultFinish: "metal", finishes: HARD, layer: "floor", tucksUnder: TABLES, tags: ["industrieel"] },

  // Slapen
  { id: "bed-double", name: "Tweepersoonsbed", category: "slapen", shape: "bed", size: { w: 1.8, d: 2.1, h: 1.0 }, defaultColor: "#d9d4cb", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", tags: ["hotel", "luxe"] },
  { id: "bed-queen", name: "Bed 160×200", category: "slapen", shape: "bed", size: { w: 1.6, d: 2.1, h: 0.95 }, defaultColor: "#a9b4ae", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", tags: [] },
  { id: "bed-single", name: "Eenpersoonsbed", category: "slapen", shape: "bed", size: { w: 0.9, d: 2.05, h: 0.9 }, defaultColor: "#e5e1da", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", tags: ["kinderkamer", "logeer"] },
  { id: "nightstand", name: "Nachtkastje", category: "slapen", shape: "nightstand", size: { w: 0.45, d: 0.4, h: 0.5 }, defaultColor: "#b08a62", defaultFinish: "wood", finishes: WOODY, layer: "floor", tags: [] },

  // Opbergen
  { id: "wardrobe", name: "Kledingkast", category: "opbergen", shape: "wardrobe", size: { w: 1.5, d: 0.6, h: 2.2 }, defaultColor: "#f2f0eb", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: [] },
  { id: "sideboard", name: "Dressoir", category: "opbergen", shape: "sideboard", size: { w: 1.8, d: 0.45, h: 0.75 }, defaultColor: "#8b6a4b", defaultFinish: "wood", finishes: WOODY, layer: "floor", tags: ["mid-century"] },
  { id: "bookshelf", name: "Boekenkast", category: "opbergen", shape: "bookshelf", size: { w: 1.0, d: 0.35, h: 1.9 }, defaultColor: "#ece8e1", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: [] },
  { id: "tv-cabinet", name: "Tv-meubel", category: "opbergen", shape: "tv_cabinet", size: { w: 1.8, d: 0.42, h: 0.5 }, defaultColor: "#30302e", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: ["modern"] },

  // Keuken
  { id: "kitchen-base", name: "Onderkast 60 cm", category: "keuken", shape: "kitchen_base", size: { w: 0.6, d: 0.62, h: 0.92 }, defaultColor: "#f4f3ef", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: [] },
  { id: "kitchen-base-120", name: "Onderkast 120 cm", category: "keuken", shape: "kitchen_base", size: { w: 1.2, d: 0.62, h: 0.92 }, defaultColor: "#f4f3ef", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: [] },
  { id: "kitchen-sink", name: "Spoelkeuken", category: "keuken", shape: "kitchen_sink", size: { w: 0.9, d: 0.62, h: 0.92 }, defaultColor: "#f4f3ef", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: [] },
  { id: "kitchen-stove", name: "Kookplaat met onderkast", category: "keuken", shape: "kitchen_stove", size: { w: 0.9, d: 0.62, h: 0.92 }, defaultColor: "#f4f3ef", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: [] },
  { id: "kitchen-tall", name: "Hoge kast / koelkast", category: "keuken", shape: "kitchen_tall", size: { w: 0.6, d: 0.62, h: 2.2 }, defaultColor: "#f4f3ef", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: [] },
  { id: "kitchen-island", name: "Kookeiland", category: "keuken", shape: "kitchen_island", size: { w: 2.2, d: 1.0, h: 0.92 }, defaultColor: "#3b3d3f", defaultFinish: "matte", finishes: WOODY, layer: "floor", tags: ["luxe", "modern"] },

  // Badkamer
  { id: "bathtub", name: "Ligbad", category: "badkamer", shape: "bathtub", size: { w: 1.7, d: 0.75, h: 0.58 }, defaultColor: "#ffffff", defaultFinish: "gloss", finishes: ["gloss", "matte"], layer: "floor", tags: [] },
  { id: "shower", name: "Inloopdouche", category: "badkamer", shape: "shower", size: { w: 1.0, d: 1.0, h: 2.0 }, defaultColor: "#dfe7e8", defaultFinish: "glass", finishes: ["glass"], layer: "floor", tags: [] },
  { id: "toilet", name: "Hangtoilet", category: "badkamer", shape: "toilet", size: { w: 0.38, d: 0.55, h: 0.8 }, defaultColor: "#ffffff", defaultFinish: "gloss", finishes: ["gloss", "matte"], layer: "floor", tags: [] },
  { id: "vanity", name: "Badmeubel met wastafel", category: "badkamer", shape: "vanity", size: { w: 1.0, d: 0.48, h: 0.85 }, defaultColor: "#a47b55", defaultFinish: "wood", finishes: WOODY, layer: "floor", tags: [] },
  { id: "mirror", name: "Spiegel", category: "badkamer", shape: "mirror", size: { w: 0.8, d: 0.03, h: 0.7 }, defaultColor: "#c9d3d6", defaultFinish: "glass", finishes: ["glass"], layer: "wall", elevation: 1.15, tags: [] },

  // Verlichting
  { id: "floor-lamp", name: "Staande lamp", category: "verlichting", shape: "floor_lamp", size: { w: 0.4, d: 0.4, h: 1.6 }, defaultColor: "#ece6da", defaultFinish: "fabric", finishes: ["fabric", "metal"], layer: "floor", tags: [] },
  { id: "table-lamp", name: "Tafellamp", category: "verlichting", shape: "table_lamp", size: { w: 0.28, d: 0.28, h: 0.45 }, defaultColor: "#ece6da", defaultFinish: "fabric", finishes: ["fabric", "metal", "glass"], layer: "surface", elevation: 0.5, tags: [] },
  { id: "pendant", name: "Hanglamp", category: "verlichting", shape: "pendant", size: { w: 0.5, d: 0.5, h: 0.9 }, defaultColor: "#1f1f1f", defaultFinish: "metal", finishes: ["metal", "matte", "glass"], layer: "ceiling", tags: [] },

  // Planten
  { id: "plant-large", name: "Grote kamerplant", category: "planten", shape: "plant_large", size: { w: 0.6, d: 0.6, h: 1.6 }, defaultColor: "#4f7a4a", defaultFinish: "matte", finishes: ["matte"], layer: "floor", tags: ["natuurlijk", "scandinavisch"] },
  { id: "plant-small", name: "Kleine plant", category: "planten", shape: "plant_small", size: { w: 0.35, d: 0.35, h: 0.6 }, defaultColor: "#5f8a52", defaultFinish: "matte", finishes: ["matte"], layer: "floor", tags: ["natuurlijk"] },

  // Wanddecoratie
  { id: "painting", name: "Schilderij", category: "wanddecoratie", shape: "painting", size: { w: 1.0, d: 0.04, h: 0.7 }, defaultColor: "#c56b4b", defaultFinish: "matte", finishes: ["matte", "gloss"], layer: "wall", elevation: 1.2, tags: [] },
  { id: "painting-large", name: "Groot kunstwerk", category: "wanddecoratie", shape: "painting", size: { w: 1.6, d: 0.04, h: 1.0 }, defaultColor: "#3f5a73", defaultFinish: "matte", finishes: ["matte", "gloss"], layer: "wall", elevation: 1.0, tags: ["luxe"] },
  { id: "wall-shelf", name: "Wandplank", category: "wanddecoratie", shape: "wall_shelf", size: { w: 1.0, d: 0.22, h: 0.04 }, defaultColor: "#b08a62", defaultFinish: "wood", finishes: WOODY, layer: "wall", elevation: 1.4, tags: [] },

  // Vloerkleden
  { id: "rug-rect", name: "Vloerkleed 200×300", category: "vloerkleden", shape: "rug_rect", size: { w: 3.0, d: 2.0, h: 0.015 }, defaultColor: "#d8cfc0", defaultFinish: "fabric", finishes: ["fabric"], layer: "rug", tags: [] },
  { id: "rug-rect-s", name: "Vloerkleed 160×230", category: "vloerkleden", shape: "rug_rect", size: { w: 2.3, d: 1.6, h: 0.015 }, defaultColor: "#9aa3a8", defaultFinish: "fabric", finishes: ["fabric"], layer: "rug", tags: [] },
  { id: "rug-round", name: "Rond vloerkleed", category: "vloerkleden", shape: "rug_round", size: { w: 2.0, d: 2.0, h: 0.015 }, defaultColor: "#c9b79c", defaultFinish: "fabric", finishes: ["fabric"], layer: "rug", tags: [] },

  // Gordijnen
  { id: "curtain", name: "Gordijn (paar)", category: "gordijnen", shape: "curtain", size: { w: 2.0, d: 0.12, h: 2.5 }, defaultColor: "#e9e4da", defaultFinish: "fabric", finishes: ["fabric"], layer: "wall", elevation: 0.02, tags: [] },
  { id: "curtain-dark", name: "Verduisterend gordijn", category: "gordijnen", shape: "curtain", size: { w: 1.6, d: 0.12, h: 2.5 }, defaultColor: "#5b5f63", defaultFinish: "fabric", finishes: ["fabric"], layer: "wall", elevation: 0.02, tags: [] },

  // Werken
  { id: "desk", name: "Bureau", category: "werken", shape: "desk", size: { w: 1.4, d: 0.7, h: 0.75 }, defaultColor: "#d7c4a8", defaultFinish: "wood", finishes: HARD, layer: "floor", tags: ["thuiswerken"] },
  { id: "office-chair", name: "Bureaustoel", category: "werken", shape: "office_chair", size: { w: 0.6, d: 0.6, h: 1.0 }, defaultColor: "#2d2d2d", defaultFinish: "fabric", finishes: UPHOLSTERY, layer: "floor", tucksUnder: TABLES, tags: ["thuiswerken"] },
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

/** Catalogusitem voor een eigen GLB/GLTF-model */
export const CUSTOM_MODEL_ITEM: CatalogItem = {
  id: "custom-model",
  name: "Eigen 3D-model",
  category: "eigen",
  shape: "custom_model",
  size: { w: 1, d: 1, h: 1 },
  defaultColor: "#cccccc",
  defaultFinish: "matte",
  finishes: [],
  layer: "floor",
  tags: [],
};

export function getCatalogItem(id: string): CatalogItem {
  return CATALOG_BY_ID[id] ?? CUSTOM_MODEL_ITEM;
}

export const FINISH_LABELS: Record<MaterialFinish, string> = {
  fabric: "Stof",
  leather: "Leer",
  wood: "Hout",
  metal: "Metaal",
  matte: "Mat gelakt",
  gloss: "Hoogglans",
  glass: "Glas",
};

export const COLOR_SWATCHES = [
  "#ffffff", "#f2f0eb", "#e9e4da", "#d8cfc0", "#c4a484", "#b08a62", "#8b6a4b", "#6b4630",
  "#b9b2a6", "#8d8579", "#5b5f63", "#3c3c3c", "#1f1f1f", "#6f7d74", "#4f7a4a", "#a9b4ae",
  "#3f5a73", "#9aa3a8", "#c56b4b", "#d9b26f",
];
