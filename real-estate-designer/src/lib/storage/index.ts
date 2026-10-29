"use client";

import { getSupabase } from "../supabase/client";
import { normalizeProject, nowIso, uid } from "../project";
import type { MediaAsset, Project } from "../types";
import { LocalRepository } from "./local";
import { SupabaseRepository } from "./supabase";
import type { ProjectRepository } from "./types";

let repo: ProjectRepository | null = null;

export function getRepository(): ProjectRepository {
  if (repo) return repo;
  const sb = getSupabase();
  repo = sb ? new SupabaseRepository(sb) : new LocalRepository();
  return repo;
}

export function cloudRepository(): SupabaseRepository | null {
  const r = getRepository();
  return r instanceof SupabaseRepository ? r : null;
}

// ---------- Media ----------

const urlCache = new Map<string, string>();

/** Object-URL voor een asset (gecachet per sessie) */
export async function assetUrl(projectId: string, assetId: string): Promise<string | null> {
  const key = `${projectId}/${assetId}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const blob = await getRepository().getBlob(projectId, assetId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export async function imageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (!blob.type.startsWith("image/")) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const d = { width: bmp.width, height: bmp.height };
    bmp.close();
    return d;
  } catch {
    return null;
  }
}

/** Slaat een bestand op bij het project en geeft de metadata terug (voeg die zelf toe aan project.media). */
export async function storeAsset(projectId: string, blob: Blob, kind: MediaAsset["kind"], name: string, extra: Partial<MediaAsset> = {}): Promise<MediaAsset> {
  const id = uid("asset");
  await getRepository().putBlob(projectId, id, blob);
  const dims = await imageDimensions(blob);
  return {
    id,
    kind,
    name,
    mime: blob.type || "application/octet-stream",
    size: blob.size,
    ...(dims ?? {}),
    createdAt: nowIso(),
    ...extra,
  };
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Verkleint een afbeelding (bv. voor thumbnails of om naar de AI te sturen) */
export async function downscaleImage(blob: Blob, maxSide: number, type = "image/jpeg", quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Kon afbeelding niet verkleinen"))), type, quality));
}

// ---------- Projectbeheer ----------

/** Dupliceert een project inclusief bestanden, met nieuwe id's */
export async function duplicateProject(id: string): Promise<Project> {
  const r = getRepository();
  const src = await r.get(id);
  if (!src) throw new Error("Project niet gevonden");
  const copy: Project = structuredClone(src);
  copy.id = uid();
  copy.name = `${src.name} (kopie)`;
  copy.createdAt = copy.updatedAt = nowIso();
  copy.status = "concept";
  for (const m of src.media) {
    const blob = await r.getBlob(src.id, m.id);
    if (blob) await r.putBlob(copy.id, m.id, blob);
  }
  await r.save(copy);
  return copy;
}

// ---------- Projectbestand (export/import, werkt ook zonder cloud) ----------

export interface ProjectBundle {
  format: "ai-real-estate-designer";
  version: 1;
  project: Project;
  blobs: Record<string, string>; // assetId -> data-URL
}

export async function exportBundle(project: Project): Promise<Blob> {
  const blobs: Record<string, string> = {};
  for (const m of project.media) {
    const b = await getRepository().getBlob(project.id, m.id);
    if (b) blobs[m.id] = await blobToDataUrl(b);
  }
  const bundle: ProjectBundle = { format: "ai-real-estate-designer", version: 1, project, blobs };
  return new Blob([JSON.stringify(bundle)], { type: "application/json" });
}

export async function importBundle(file: File): Promise<Project> {
  const bundle = JSON.parse(await file.text()) as ProjectBundle;
  if (bundle.format !== "ai-real-estate-designer") throw new Error("Dit is geen projectbestand van AI Real Estate Designer.");
  const p = normalizeProject(bundle.project);
  p.id = uid();
  p.updatedAt = nowIso();
  for (const [assetId, url] of Object.entries(bundle.blobs ?? {})) {
    await getRepository().putBlob(p.id, assetId, await dataUrlToBlob(url));
  }
  await getRepository().save(p);
  return p;
}
