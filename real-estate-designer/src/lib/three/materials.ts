import * as THREE from "three";
import type { FloorMaterialId, MaterialFinish } from "../types";

const materialCache = new Map<string, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>();

/** Materiaal voor meubels op basis van kleur en afwerking. Gedeeld (gecachet), dus niet muteren. */
export function finishMaterial(color: string, finish: MaterialFinish) {
  const key = `${color}|${finish}`;
  const hit = materialCache.get(key);
  if (hit) return hit;
  let m: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  switch (finish) {
    case "fabric":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
      break;
    case "leather":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.6 });
      break;
    case "wood":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, map: woodGrainTexture() });
      break;
    case "metal":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.85 });
      break;
    case "gloss":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
      break;
    case "glass":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, transmission: 0.85, transparent: true, opacity: 0.35, thickness: 0.02 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
  }
  materialCache.set(key, m);
  return m;
}

export function plainMaterial(color: string, roughness = 0.8, metalness = 0) {
  const key = `plain|${color}|${roughness}|${metalness}`;
  const hit = materialCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  materialCache.set(key, m);
  return m;
}

// ---------- Procedurele texturen (geen externe downloads nodig) ----------

const textureCache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  textureCache.set(key, t);
  return t;
}

/** Deterministische pseudo-random zodat texturen bij elke render gelijk zijn */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function woodGrainTexture() {
  return canvasTexture("grain", 256, (ctx, s) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, s, s);
    const r = rng(7);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(90,60,30,${0.04 + r() * 0.06})`;
      ctx.lineWidth = 1 + r() * 2;
      const y = r() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) ctx.lineTo(x, y + Math.sin(x / 30 + i) * 3);
      ctx.stroke();
    }
  });
}

function planks(ctx: CanvasRenderingContext2D, s: number, base: [number, number, number], seed: number) {
  const r = rng(seed);
  const rows = 8;
  const h = s / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * s * 0.5;
    while (x < s) {
      const w = s * (0.4 + r() * 0.6);
      const v = 0.85 + r() * 0.25;
      ctx.fillStyle = `rgb(${base[0] * v},${base[1] * v},${base[2] * v})`;
      ctx.fillRect(x, row * h, w, h);
      for (let g = 0; g < 6; g++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
        ctx.beginPath();
        const gy = row * h + r() * h;
        ctx.moveTo(x, gy);
        ctx.lineTo(x + w, gy + (r() - 0.5) * 4);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.strokeRect(x, row * h, w, h);
      x += w;
    }
  }
}

function floorTexture(id: FloorMaterialId) {
  return canvasTexture(`floor-${id}`, 512, (ctx, s) => {
    switch (id) {
      case "oak":
        planks(ctx, s, [196, 160, 118], 3);
        break;
      case "walnut":
        planks(ctx, s, [112, 80, 56], 5);
        break;
      case "herringbone": {
        ctx.fillStyle = "#b8925f";
        ctx.fillRect(0, 0, s, s);
        const r = rng(11);
        const w = s / 16;
        const l = w * 4;
        ctx.save();
        for (let i = -4; i < 24; i++) {
          for (let j = -4; j < 24; j++) {
            const v = 0.85 + r() * 0.25;
            ctx.fillStyle = `rgb(${190 * v},${150 * v},${100 * v})`;
            const x = i * l * 0.5 + j * w;
            const y = j * w - i * l * 0.5 + i * w;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(((i + j) % 2 === 0 ? 1 : -1) * Math.PI / 4);
            ctx.fillRect(0, 0, l, w);
            ctx.strokeStyle = "rgba(0,0,0,0.2)";
            ctx.strokeRect(0, 0, l, w);
            ctx.restore();
          }
        }
        ctx.restore();
        break;
      }
      case "concrete": {
        ctx.fillStyle = "#a7a6a2";
        ctx.fillRect(0, 0, s, s);
        const r = rng(13);
        for (let i = 0; i < 4000; i++) {
          ctx.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.03)`;
          ctx.fillRect(r() * s, r() * s, 2 + r() * 6, 2 + r() * 6);
        }
        break;
      }
      case "tiles_light":
      case "tiles_dark": {
        const light = id === "tiles_light";
        ctx.fillStyle = light ? "#c9c5bd" : "#3a3a3a";
        ctx.fillRect(0, 0, s, s);
        const r = rng(17);
        const n = 4;
        const t = s / n;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const v = 0.95 + r() * 0.08;
            const c = light ? [232, 228, 220] : [72, 72, 74];
            ctx.fillStyle = `rgb(${c[0] * v},${c[1] * v},${c[2] * v})`;
            ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
          }
        break;
      }
      case "marble": {
        ctx.fillStyle = "#efede8";
        ctx.fillRect(0, 0, s, s);
        const r = rng(19);
        for (let i = 0; i < 18; i++) {
          ctx.strokeStyle = `rgba(120,120,125,${0.08 + r() * 0.15})`;
          ctx.lineWidth = 0.5 + r() * 2;
          ctx.beginPath();
          let x = r() * s;
          let y = 0;
          ctx.moveTo(x, y);
          while (y < s) {
            x += (r() - 0.5) * 40;
            y += 10 + r() * 30;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        break;
      }
      case "carpet": {
        ctx.fillStyle = "#b9b3a9";
        ctx.fillRect(0, 0, s, s);
        const r = rng(23);
        for (let i = 0; i < 9000; i++) {
          ctx.fillStyle = `rgba(${r() > 0.5 ? 255 : 60},${r() > 0.5 ? 255 : 60},${r() > 0.5 ? 255 : 60},0.05)`;
          ctx.fillRect(r() * s, r() * s, 1.5, 1.5);
        }
        break;
      }
    }
  });
}

/** Hoeveel meter beslaat één textuurtegel */
const FLOOR_TILE_METERS: Record<FloorMaterialId, number> = {
  oak: 2.4,
  walnut: 2.4,
  herringbone: 2.0,
  concrete: 3,
  tiles_light: 2.4,
  tiles_dark: 2.4,
  marble: 2.4,
  carpet: 1.5,
};

export const FLOOR_LABELS: Record<FloorMaterialId, string> = {
  oak: "Eiken planken",
  walnut: "Notenhout",
  herringbone: "Visgraat parket",
  concrete: "Gietvloer / beton",
  tiles_light: "Lichte tegels",
  tiles_dark: "Donkere tegels",
  marble: "Marmer",
  carpet: "Tapijt",
};

export const FLOOR_SWATCH: Record<FloorMaterialId, string> = {
  oak: "#c4a076",
  walnut: "#705038",
  herringbone: "#b8925f",
  concrete: "#a7a6a2",
  tiles_light: "#e8e4dc",
  tiles_dark: "#48484a",
  marble: "#efede8",
  carpet: "#b9b3a9",
};

const floorMatCache = new Map<string, THREE.MeshStandardMaterial>();

export function floorMaterial(id: FloorMaterialId) {
  const hit = floorMatCache.get(id);
  if (hit) return hit;
  const map = floorTexture(id);
  const m = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: map ?? undefined,
    roughness: id === "marble" || id === "tiles_light" || id === "tiles_dark" ? 0.25 : id === "carpet" ? 1 : 0.6,
    metalness: 0,
  });
  if (map) {
    // Shape-geometrie heeft UV's in meters; schaal zodat een tegel FLOOR_TILE_METERS beslaat.
    const t = map.clone();
    t.needsUpdate = true;
    const k = 1 / FLOOR_TILE_METERS[id];
    t.repeat.set(k, k);
    m.map = t;
  }
  floorMatCache.set(id, m);
  return m;
}
