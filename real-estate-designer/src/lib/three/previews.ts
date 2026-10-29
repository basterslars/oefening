"use client";

import * as THREE from "three";
import type { CatalogItem } from "../catalog";
import { buildFurniture } from "./furniture";

/**
 * Rendert previewafbeeldingen van catalogusitems met één gedeelde WebGL-
 * renderer (browsers staan maar een beperkt aantal WebGL-contexten toe).
 */
let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, string>();
const SIZE = 160;

function getRenderer() {
  if (renderer) return renderer;
  const canvas = document.createElement("canvas");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function renderPreview(item: CatalogItem, color = item.defaultColor): string | null {
  const key = `${item.id}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const r = getRenderer();
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#cfc8bb", 1.6));
    const dl = new THREE.DirectionalLight("#ffffff", 1.6);
    dl.position.set(3, 5, 4);
    scene.add(dl);
    const g = buildFurniture(item, { color, finish: item.defaultFinish });
    scene.add(g);
    const { w, d, h } = item.size;
    const flat = h < 0.1 || item.layer === "wall";
    const radius = Math.max(w, d, h) * 0.95;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const target = new THREE.Vector3(0, h / 2, 0);
    if (item.layer === "wall") cam.position.set(radius * 0.6, h / 2 + radius * 0.3, radius * 2.6);
    else if (flat) cam.position.set(0, radius * 2.8, radius * 1.2);
    else cam.position.set(radius * 1.6, h / 2 + radius * 1.3, radius * 2.0);
    cam.lookAt(target);
    r.setClearColor(0x000000, 0);
    r.render(scene, cam);
    const url = r.domElement.toDataURL("image/png");
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
