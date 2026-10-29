"use client";

import { renderPdfPages } from "./pdf";
import { storeAsset } from "./storage";
import type { MediaAsset } from "./types";

export const ACCEPT = {
  photo: "image/jpeg,image/png,.jpg,.jpeg,.png",
  floorplan: "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf",
  video: "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm",
  model: ".glb,.gltf,model/gltf-binary,model/gltf+json",
};

const MAX_BYTES = { photo: 25e6, floorplan: 40e6, video: 300e6, model: 60e6 };

export class UploadError extends Error {}

function check(file: File, kind: keyof typeof MAX_BYTES) {
  const name = file.name.toLowerCase();
  const ok =
    kind === "photo"
      ? /\.(jpe?g|png)$/.test(name) || ["image/jpeg", "image/png"].includes(file.type)
      : kind === "floorplan"
        ? /\.(jpe?g|png|pdf)$/.test(name) || ["image/jpeg", "image/png", "application/pdf"].includes(file.type)
        : kind === "video"
          ? /\.(mp4|mov|webm)$/.test(name) || file.type.startsWith("video/")
          : /\.(glb|gltf)$/.test(name);
  if (!ok) throw new UploadError(`${file.name}: bestandstype wordt niet ondersteund.`);
  if (file.size > MAX_BYTES[kind]) throw new UploadError(`${file.name}: bestand is groter dan ${Math.round(MAX_BYTES[kind] / 1e6)} MB.`);
}

/**
 * Slaat geüploade bestanden op bij een project. PDF-plattegronden worden
 * bewaard én per pagina naar een afbeelding gerenderd, zodat ze in de editor
 * als schaalbare achtergrond gebruikt kunnen worden.
 */
export async function ingestFiles(projectId: string, files: File[], kind: "photo" | "floorplan" | "video" | "model"): Promise<MediaAsset[]> {
  const out: MediaAsset[] = [];
  for (const f of files) {
    check(f, kind);
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (kind === "floorplan" && isPdf) {
      const original = await storeAsset(projectId, f, "floorplan", f.name);
      out.push(original);
      const pages = await renderPdfPages(f);
      for (let i = 0; i < pages.length; i++) {
        out.push(await storeAsset(projectId, pages[i], "floorplan", `${f.name.replace(/\.pdf$/i, "")} – pagina ${i + 1}.png`));
      }
    } else {
      const blob = kind === "model" && !f.type ? new Blob([f], { type: f.name.endsWith(".glb") ? "model/gltf-binary" : "model/gltf+json" }) : f;
      out.push(await storeAsset(projectId, blob, kind, f.name));
    }
  }
  return out;
}

export const isImageAsset = (m: MediaAsset) => m.mime.startsWith("image/");
