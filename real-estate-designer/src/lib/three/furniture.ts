import * as THREE from "three";
import type { CatalogItem } from "../catalog";
import type { MaterialFinish } from "../types";
import { finishMaterial, plainMaterial } from "./materials";

/**
 * Bouwt eenvoudige, procedurele 3D-meubels uit primitieven.
 * Conventies: oorsprong = middelpunt van de footprint op vloerniveau,
 * breedte langs x, diepte langs z, voorkant richting +z (rugleuning op -z).
 */

const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number) {
  const k = `b${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}
function cylGeo(rt: number, rb: number, h: number, seg = 24) {
  const k = `c${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geoCache.set(k, g);
  }
  return g;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Box met onderkant op `y` */
function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = mesh(boxGeo(w, h, d), mat, x, y + h / 2, z);
  g.add(m);
  return m;
}
function cyl(g: THREE.Group, r: number, h: number, x: number, y: number, z: number, mat: THREE.Material, rb = r, seg = 24) {
  const m = mesh(cylGeo(r, rb, h, seg), mat, x, y + h / 2, z);
  g.add(m);
  return m;
}

const LEG_DARK = () => plainMaterial("#2a2a2a", 0.4, 0.7);
const LEG_WOOD = () => finishMaterial("#9c7a55", "wood");
const WHITE = () => plainMaterial("#f7f7f5", 0.3);
const CERAMIC = () => finishMaterial("#ffffff", "gloss");
const STEEL = () => plainMaterial("#c8c9cb", 0.25, 0.9);

function legs(g: THREE.Group, w: number, d: number, h: number, inset: number, r: number, mat: THREE.Material) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) cyl(g, r, h, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), mat, r, 10);
}

function shade(color: string, f: number) {
  const c = new THREE.Color(color);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

export function buildFurniture(
  item: CatalogItem,
  opts: { color: string; finish: MaterialFinish; size?: { w: number; d: number; h: number } },
): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = opts.size ?? item.size;
  const mat = finishMaterial(opts.color, opts.finish);
  const matDark = finishMaterial(shade(opts.color, 0.82), opts.finish);

  switch (item.shape) {
    case "sofa": {
      const seatH = 0.42;
      const armW = 0.16;
      box(g, w, 0.12, d, 0, 0.06, 0, matDark); // plint
      box(g, w - armW * 2, seatH - 0.18, d - 0.2, 0, 0.18, 0.08, mat); // zitting
      box(g, w - armW * 2, h - 0.18, 0.2, 0, 0.18, -d / 2 + 0.1, mat); // rug
      box(g, armW, 0.62 - 0.18, d, -w / 2 + armW / 2, 0.18, 0, mat);
      box(g, armW, 0.62 - 0.18, d, w / 2 - armW / 2, 0.18, 0, mat);
      const seats = item.variant ?? 3;
      const cw = (w - armW * 2) / seats;
      for (let i = 0; i < seats; i++)
        box(g, cw - 0.02, 0.12, d - 0.24, -w / 2 + armW + cw * (i + 0.5), seatH, 0.1, mat);
      legs(g, w, d, 0.06, 0.06, 0.02, LEG_DARK());
      break;
    }
    case "sofa_corner": {
      const depth = 0.95;
      const seatTop = 0.42;
      // lange zijde langs -z (rug), korte zijde langs +x
      box(g, w, seatTop, depth, 0, 0, -d / 2 + depth / 2, mat);
      box(g, depth, seatTop, d - depth, w / 2 - depth / 2, 0, depth / 2, mat);
      box(g, w, h - seatTop, 0.2, 0, seatTop, -d / 2 + 0.1, matDark);
      box(g, 0.2, h - seatTop, d, w / 2 - 0.1, seatTop, 0, matDark);
      box(g, 0.16, 0.2, depth, -w / 2 + 0.08, seatTop, -d / 2 + depth / 2, matDark);
      for (let i = 0; i < 3; i++) box(g, (w - depth) / 3 - 0.03, 0.1, depth - 0.25, -w / 2 + 0.16 + ((w - depth - 0.16) / 3) * (i + 0.5), seatTop, -d / 2 + 0.2 + (depth - 0.25) / 2, mat);
      break;
    }
    case "armchair": {
      box(g, w, 0.3, d, 0, 0.12, 0, mat);
      box(g, w - 0.24, 0.12, d - 0.22, 0, 0.42, 0.06, mat);
      box(g, w, h - 0.12, 0.18, 0, 0.12, -d / 2 + 0.09, matDark);
      box(g, 0.12, 0.6 - 0.12, d, -w / 2 + 0.06, 0.12, 0, mat);
      box(g, 0.12, 0.6 - 0.12, d, w / 2 - 0.06, 0.12, 0, mat);
      legs(g, w, d, 0.12, 0.07, 0.018, LEG_WOOD());
      break;
    }
    case "coffee_table": {
      box(g, w, 0.04, d, 0, h - 0.04, 0, mat);
      box(g, w - 0.1, 0.02, d - 0.1, 0, 0.12, 0, mat);
      legs(g, w, d, h - 0.04, 0.05, 0.018, opts.finish === "metal" ? mat : LEG_DARK());
      break;
    }
    case "side_table": {
      cyl(g, w / 2, 0.03, 0, h - 0.03, 0, mat);
      cyl(g, 0.02, h - 0.03, 0, 0, 0, LEG_DARK(), 0.02, 10);
      cyl(g, w / 3, 0.015, 0, 0, 0, LEG_DARK());
      break;
    }
    case "dining_table":
    case "desk": {
      box(g, w, 0.04, d, 0, h - 0.04, 0, mat);
      legs(g, w, d, h - 0.04, 0.06, 0.025, opts.finish === "metal" ? mat : LEG_WOOD());
      if (item.shape === "desk") box(g, 0.4, 0.12, d - 0.1, w / 2 - 0.25, h - 0.17, 0, matDark);
      break;
    }
    case "dining_table_round": {
      cyl(g, w / 2, 0.04, 0, h - 0.04, 0, mat, w / 2, 48);
      cyl(g, 0.05, h - 0.04, 0, 0, 0, matDark, 0.05, 16);
      cyl(g, 0.25, 0.03, 0, 0, 0, matDark, 0.28, 32);
      break;
    }
    case "chair": {
      box(g, w, 0.04, w, 0, 0.44, 0.03, mat);
      box(g, w, h - 0.48, 0.03, 0, 0.48, -d / 2 + 0.03, mat);
      legs(g, w, d - 0.04, 0.44, 0.03, 0.015, opts.finish === "fabric" ? LEG_WOOD() : mat);
      break;
    }
    case "bar_stool": {
      cyl(g, w / 2 - 0.02, 0.05, 0, h - 0.05, 0, mat);
      cyl(g, 0.025, h - 0.05, 0, 0, 0, STEEL(), 0.025, 10);
      cyl(g, w / 2 - 0.04, 0.02, 0, 0, 0, STEEL());
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w / 2 - 0.08, 0.01, 8, 24), STEEL());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.28;
      g.add(ring);
      break;
    }
    case "office_chair": {
      cyl(g, 0.3, 0.04, 0, 0.04, 0, LEG_DARK(), 0.3, 5);
      cyl(g, 0.03, 0.4, 0, 0.06, 0, STEEL(), 0.03, 10);
      box(g, 0.5, 0.08, 0.5, 0, 0.46, 0.02, mat);
      box(g, 0.46, 0.5, 0.06, 0, 0.55, -0.23, mat);
      break;
    }
    case "bed": {
      const frameH = 0.32;
      box(g, w, frameH, d - 0.06, 0, 0.08, 0.03, mat);
      legs(g, w - 0.04, d - 0.1, 0.08, 0.06, 0.025, LEG_WOOD());
      box(g, w - 0.08, 0.22, d - 0.14, 0, 0.08 + frameH, 0.05, WHITE());
      box(g, w + 0.04, h, 0.08, 0, 0, -d / 2 + 0.04, matDark);
      // dekbed
      box(g, w - 0.06, 0.06, (d - 0.14) * 0.62, 0, 0.62, 0.05 + (d - 0.14) * 0.19, finishMaterial(shade(opts.color, 1.08), "fabric"));
      const pillows = w > 1.2 ? 2 : 1;
      const pw = (w - 0.2) / pillows;
      for (let i = 0; i < pillows; i++) box(g, pw - 0.06, 0.12, 0.4, -w / 2 + 0.1 + pw * (i + 0.5), 0.62, -d / 2 + 0.35, WHITE());
      break;
    }
    case "nightstand": {
      box(g, w, h - 0.08, d, 0, 0.08, 0, mat);
      box(g, w - 0.04, 0.005, 0.005, 0, h * 0.55, d / 2, LEG_DARK());
      legs(g, w, d, 0.08, 0.04, 0.012, LEG_DARK());
      break;
    }
    case "wardrobe": {
      box(g, w, h, d, 0, 0, 0, mat);
      const doors = Math.max(2, Math.round(w / 0.5));
      for (let i = 1; i < doors; i++) box(g, 0.006, h - 0.04, 0.005, -w / 2 + (w / doors) * i, 0.02, d / 2 + 0.002, LEG_DARK());
      for (let i = 0; i < doors; i++) box(g, 0.012, 0.25, 0.02, -w / 2 + (w / doors) * (i + 0.5) + (i % 2 ? -1 : 1) * (w / doors) * 0.4, h * 0.45, d / 2 + 0.01, STEEL());
      break;
    }
    case "sideboard":
    case "tv_cabinet": {
      const legH = item.shape === "sideboard" ? 0.15 : 0.06;
      box(g, w, h - legH, d, 0, legH, 0, mat);
      const doors = Math.max(2, Math.round(w / 0.45));
      for (let i = 1; i < doors; i++) box(g, 0.005, h - legH - 0.04, 0.004, -w / 2 + (w / doors) * i, legH + 0.02, d / 2 + 0.002, LEG_DARK());
      legs(g, w, d, legH, 0.06, 0.015, item.shape === "sideboard" ? LEG_WOOD() : LEG_DARK());
      if (item.shape === "tv_cabinet") {
        box(g, Math.min(1.4, w * 0.75), 0.75, 0.04, 0, h + 0.05, -d / 4, plainMaterial("#111111", 0.2, 0.3));
        box(g, 0.25, 0.05, 0.15, 0, h, -d / 4, LEG_DARK());
      }
      break;
    }
    case "bookshelf": {
      const t = 0.025;
      box(g, t, h, d, -w / 2 + t / 2, 0, 0, mat);
      box(g, t, h, d, w / 2 - t / 2, 0, 0, mat);
      box(g, w, t, d, 0, h - t, 0, mat);
      box(g, w, 0.005, d, 0, 0, -d / 2 + 0.0025, mat);
      box(g, w - t * 2, h, 0.01, 0, 0, -d / 2 + 0.005, matDark);
      const shelves = 5;
      const bookColors = ["#7a5c45", "#3f5a73", "#c56b4b", "#e6dccd", "#4f6b4a", "#2f2f2f"];
      for (let i = 0; i < shelves; i++) {
        const y = (h / shelves) * i;
        box(g, w - t * 2, t, d, 0, y, 0, mat);
        let x = -w / 2 + t + 0.02;
        let k = i * 3;
        while (x < w / 2 - t - 0.06 && i < shelves - 0) {
          const bw = 0.025 + ((k * 7) % 5) * 0.006;
          const bh = h / shelves - 0.08 - ((k * 3) % 4) * 0.02;
          if ((k * 5) % 7 !== 0) box(g, bw, bh, d * 0.75, x + bw / 2, y + t, 0, plainMaterial(bookColors[k % bookColors.length], 0.8));
          x += bw + 0.004;
          k++;
        }
      }
      break;
    }
    case "kitchen_base":
    case "kitchen_sink":
    case "kitchen_stove":
    case "kitchen_island": {
      const plinth = 0.1;
      const top = 0.04;
      box(g, w - 0.04, plinth, d - 0.06, 0, 0, -0.03, LEG_DARK());
      box(g, w, h - plinth - top, d - 0.02, 0, plinth, -0.01, mat);
      const counter = item.shape === "kitchen_island" ? finishMaterial("#e9e7e2", "gloss") : finishMaterial("#d9d6cf", "matte");
      box(g, w + (item.shape === "kitchen_island" ? 0.1 : 0), top, d, 0, h - top, item.shape === "kitchen_island" ? 0 : 0, counter);
      const fronts = Math.max(1, Math.round(w / 0.6));
      for (let i = 1; i < fronts; i++) box(g, 0.004, h - plinth - top - 0.02, 0.004, -w / 2 + (w / fronts) * i, plinth + 0.01, d / 2 - 0.01, LEG_DARK());
      for (let i = 0; i < fronts; i++) box(g, Math.min(0.3, w / fronts - 0.1), 0.015, 0.02, -w / 2 + (w / fronts) * (i + 0.5), h - top - 0.08, d / 2, STEEL());
      if (item.shape === "kitchen_sink") {
        box(g, 0.5, 0.012, 0.38, 0, h, 0.02, STEEL());
        cyl(g, 0.015, 0.3, 0, h, -d / 2 + 0.1, STEEL(), 0.015, 10);
        box(g, 0.025, 0.025, 0.2, 0, h + 0.28, -d / 2 + 0.2, STEEL());
      }
      if (item.shape === "kitchen_stove") {
        box(g, w * 0.8, 0.008, d * 0.75, 0, h, 0, plainMaterial("#111111", 0.15, 0.2));
        for (const [dx, dz] of [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.13], [0.2, 0.13]]) cyl(g, 0.09, 0.002, dx * (w / 0.9), h + 0.008, dz, plainMaterial("#3a3a3a", 0.4));
      }
      break;
    }
    case "kitchen_tall": {
      box(g, w, h, d, 0, 0, 0, mat);
      box(g, w - 0.02, 0.004, 0.004, 0, h * 0.42, d / 2 + 0.002, LEG_DARK());
      box(g, 0.015, 0.5, 0.025, w / 2 - 0.06, h * 0.55, d / 2 + 0.01, STEEL());
      break;
    }
    case "bathtub": {
      box(g, w, h, d, 0, 0, 0, mat);
      const inner = mesh(boxGeo(w - 0.14, 0.02, d - 0.14), plainMaterial("#dfeef3", 0.1), 0, h - 0.01, 0);
      g.add(inner);
      cyl(g, 0.015, 0.15, w / 2 - 0.12, h, 0, STEEL(), 0.015, 10);
      break;
    }
    case "shower": {
      box(g, w, 0.04, d, 0, 0, 0, CERAMIC());
      box(g, 0.01, h, d * 0.7, w / 2 - 0.005, 0.04, d / 2 - d * 0.35, finishMaterial(opts.color, "glass"));
      cyl(g, 0.012, h - 0.1, -w / 2 + 0.08, 0.04, -d / 2 + 0.08, STEEL(), 0.012, 10);
      cyl(g, 0.12, 0.015, -w / 2 + 0.22, h - 0.08, -d / 2 + 0.22, STEEL());
      break;
    }
    case "toilet": {
      box(g, w, 0.12, 0.08, 0, 0.3, -d / 2 + 0.04, mat);
      const bowl = mesh(cylGeo(w / 2, w / 2.6, 0.18, 24), mat, 0, 0.3, 0.02);
      bowl.scale.z = (d - 0.08) / w;
      g.add(bowl);
      box(g, w + 0.06, 0.8, 0.12, 0, 0, -d / 2 - 0.02, plainMaterial("#e8e6e1", 0.6));
      box(g, 0.2, 0.12, 0.01, 0, 0.6, -d / 2 + 0.045, STEEL());
      break;
    }
    case "vanity": {
      box(g, w, 0.45, d, 0, h - 0.6, 0, mat);
      box(g, w, 0.12, d, 0, h - 0.12, 0, CERAMIC());
      box(g, w * 0.5, 0.02, d * 0.55, 0, h - 0.005, 0.02, plainMaterial("#e6eef0", 0.1));
      cyl(g, 0.012, 0.18, 0, h, -d / 2 + 0.06, STEEL(), 0.012, 10);
      break;
    }
    case "mirror": {
      box(g, w, h, d, 0, 0, 0, plainMaterial("#2a2a2a", 0.4, 0.5));
      box(g, w - 0.03, h - 0.03, 0.006, 0, 0.015, d / 2, plainMaterial("#dfe6e8", 0.02, 1));
      break;
    }
    case "floor_lamp": {
      cyl(g, 0.14, 0.03, 0, 0, 0, LEG_DARK());
      cyl(g, 0.012, h - 0.35, 0, 0.03, 0, LEG_DARK(), 0.012, 8);
      cyl(g, 0.13, 0.32, 0, h - 0.34, 0, finishMaterial(opts.color, opts.finish), 0.2, 32);
      addLight(g, h - 0.25, 0.9);
      break;
    }
    case "table_lamp": {
      cyl(g, 0.07, 0.2, 0, 0, 0, plainMaterial("#c9bfae", 0.3), 0.09, 24);
      cyl(g, 0.09, 0.2, 0, 0.22, 0, finishMaterial(opts.color, opts.finish), 0.14, 32);
      addLight(g, 0.3, 0.5);
      break;
    }
    case "pendant": {
      cyl(g, 0.004, h - 0.25, 0, 0.25, 0, LEG_DARK(), 0.004, 6);
      const shadeMesh = mesh(new THREE.ConeGeometry(w / 2, 0.25, 32, 1, true), finishMaterial(opts.color, opts.finish), 0, 0.125, 0);
      (shadeMesh.material as THREE.Material).side = THREE.DoubleSide;
      g.add(shadeMesh);
      cyl(g, 0.05, 0.06, 0, 0.02, 0, plainMaterial("#fff6e0", 0.2), 0.05, 16);
      addLight(g, 0.05, 1.1);
      break;
    }
    case "plant_large":
    case "plant_small": {
      const potH = h * (item.shape === "plant_large" ? 0.28 : 0.4);
      cyl(g, w * 0.32, potH, 0, 0, 0, plainMaterial("#d8d2c8", 0.7), w * 0.26, 24);
      const leaf = finishMaterial(opts.color, "matte");
      const leafDark = finishMaterial(shade(opts.color, 0.75), "matte");
      const blobs = item.shape === "plant_large" ? 9 : 5;
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2;
        const r = (i % 3) * 0.06 * (w / 0.6);
        const y = potH + (h - potH) * (0.25 + ((i * 37) % 10) / 14);
        const s = (w / 0.6) * (0.14 + ((i * 13) % 5) * 0.025);
        const m = mesh(new THREE.IcosahedronGeometry(s, 1), i % 2 ? leaf : leafDark, Math.cos(a) * r, y, Math.sin(a) * r);
        g.add(m);
      }
      if (item.shape === "plant_large") cyl(g, 0.015, h * 0.6, 0, potH, 0, plainMaterial("#5b4630", 0.9), 0.02, 8);
      break;
    }
    case "painting": {
      box(g, w, h, d, 0, 0, 0, plainMaterial("#1e1e1e", 0.5));
      // abstract kunstwerk: vlakken
      const canvas = paintingTexture(opts.color);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), new THREE.MeshStandardMaterial({ map: canvas, roughness: opts.finish === "gloss" ? 0.2 : 0.85 }));
      art.position.set(0, h / 2, d / 2 + 0.001);
      g.add(art);
      break;
    }
    case "wall_shelf": {
      box(g, w, 0.03, d, 0, 0, 0, mat);
      box(g, 0.12, 0.2, 0.08, -w / 3, 0.03, 0, plainMaterial("#3f5a73", 0.8));
      cyl(g, 0.05, 0.16, w / 4, 0.03, 0, plainMaterial("#e0d6c4", 0.4), 0.04, 16);
      break;
    }
    case "rug_rect": {
      box(g, w, h, d, 0, 0, 0, finishMaterial(opts.color, "fabric"));
      box(g, w - 0.2, h + 0.002, d - 0.2, 0, 0, 0, finishMaterial(shade(opts.color, 0.88), "fabric"));
      box(g, w - 0.3, h + 0.004, d - 0.3, 0, 0, 0, finishMaterial(opts.color, "fabric"));
      break;
    }
    case "rug_round": {
      cyl(g, w / 2, h, 0, 0, 0, finishMaterial(opts.color, "fabric"), w / 2, 64);
      cyl(g, w / 2 - 0.12, h + 0.002, 0, 0, 0, finishMaterial(shade(opts.color, 0.88), "fabric"), w / 2 - 0.12, 64);
      break;
    }
    case "curtain": {
      cyl(g, 0.012, w + 0.2, 0, h - 0.04, 0, STEEL(), 0.012, 8).rotation.z = Math.PI / 2;
      g.children[g.children.length - 1].position.set(0, h - 0.03, 0);
      const panelW = w * 0.28;
      const folds = 6;
      const fabric = finishMaterial(opts.color, "fabric");
      for (const side of [-1, 1]) {
        for (let i = 0; i < folds; i++) {
          const fx = side * (w / 2 - panelW / 2) + (i - folds / 2 + 0.5) * (panelW / folds);
          const m = mesh(cylGeo(panelW / folds / 1.6, panelW / folds / 1.6, h - 0.06, 8), fabric, fx, (h - 0.06) / 2, (i % 2) * 0.025);
          g.add(m);
        }
      }
      break;
    }
    case "custom_model":
      // Wordt in de scene vervangen door het geladen GLB/GLTF-model
      box(g, w, h, d, 0, 0, 0, plainMaterial("#bbbbbb", 0.9));
      break;
  }
  return g;
}

/**
 * Lampen krijgen een oplichtende 'gloeilamp' in plaats van een echte lichtbron:
 * tientallen puntlichten maken de scène op gewone laptops te zwaar.
 */
function addLight(g: THREE.Group, y: number, intensity: number) {
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 8),
    new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd99a", emissiveIntensity: 2 * intensity }),
  );
  bulb.position.y = y;
  g.add(bulb);
}

const paintingCache = new Map<string, THREE.Texture>();
function paintingTexture(color: string) {
  const hit = paintingCache.get(color);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 180;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f3efe7";
  ctx.fillRect(0, 0, 256, 180);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(150, 90, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.6);
  ctx.fillRect(40, 30, 70, 120);
  ctx.fillStyle = "#d9b26f";
  ctx.fillRect(110, 120, 110, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  paintingCache.set(color, t);
  return t;
}
