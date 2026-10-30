"use client";

import { blobToDataUrl, downscaleImage } from "../storage";
import { getSupabase } from "../supabase/client";
import type { AICapabilities, DesignContext, DesignProposal, FloorPlanAnalysis, PhotoAnalysis } from "./schemas";

export class AIClientError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

let capsPromise: Promise<AICapabilities> | null = null;

export function getCapabilities(): Promise<AICapabilities> {
  if (!capsPromise)
    capsPromise = fetch("/api/ai/status")
      .then((r) => r.json())
      .catch(() => ({
        vision: { available: false, provider: "none", model: null },
        design: { available: false, provider: "none", model: null },
        staging: { available: false, provider: "none", model: null },
        reconstruction: { available: false, provider: "none" },
      }));
  return capsPromise;
}

async function authHeaders(): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb) return {};
  const { data } = await sb.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIClientError(json.error ?? `Fout ${res.status}`, json.code);
  return json as T;
}

/** Afbeeldingen worden verkleind tot max. 1568 px — groter levert bij vision-modellen geen extra detail op */
async function prepareImage(blob: Blob) {
  return blobToDataUrl(await downscaleImage(blob, 1568, "image/jpeg", 0.88));
}

export interface AIResult<T> {
  provider: string;
  model: string;
  result: T;
}

export async function analyzePhoto(blob: Blob, hint: string) {
  return postJson<AIResult<PhotoAnalysis>>("/api/ai/analyze-photo", { image: await prepareImage(blob), hint });
}

export async function analyzeFloorPlan(blob: Blob, hint: string) {
  // Plattegronden in PNG houden voor scherpe lijnen
  const dataUrl = await blobToDataUrl(await downscaleImage(blob, 1568, "image/png"));
  return postJson<AIResult<FloorPlanAnalysis>>("/api/ai/analyze-floorplan", { image: dataUrl, hint });
}

export async function proposeDesign(context: DesignContext) {
  return postJson<AIResult<DesignProposal>>("/api/ai/design", { context });
}

export async function stageImage(blob: Blob, prompt: string): Promise<{ blob: Blob; provider: string; model: string }> {
  const form = new FormData();
  form.append("image", await downscaleImage(blob, 1536, "image/png"), "room.png");
  form.append("prompt", prompt);
  const res = await fetch("/api/ai/stage", { method: "POST", body: form, headers: await authHeaders() });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new AIClientError(json.error ?? `Fout ${res.status}`, json.code);
  }
  return { blob: await res.blob(), provider: res.headers.get("x-provider") ?? "?", model: res.headers.get("x-model") ?? "?" };
}
