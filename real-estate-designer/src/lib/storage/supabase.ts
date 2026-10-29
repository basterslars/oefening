"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProject } from "../project";
import { MEDIA_BUCKET } from "../supabase/client";
import type { Project, ProjectMeta, PropertyType } from "../types";
import type { ProjectRepository, ShareSettings } from "./types";

/**
 * Cloudopslag via Supabase. Projecten worden opgeslagen in genormaliseerde
 * tabellen via de database-functies `save_project` / `project_document`
 * (zie supabase/migrations). Bestanden staan in de privé bucket `project-media`.
 */
export class SupabaseRepository implements ProjectRepository {
  readonly mode = "cloud" as const;
  constructor(private sb: SupabaseClient) {}

  private async userId() {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new Error("Niet ingelogd");
    return data.user.id;
  }

  async list(): Promise<ProjectMeta[]> {
    const { data, error } = await this.sb
      .from("projects")
      .select("id,name,property_type,address,status,furnishing,input_method,room_count,total_area,total_area_source,ceiling_height,ceiling_height_source,thumbnail,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      propertyType: r.property_type as PropertyType,
      address: r.address,
      status: r.status,
      furnishing: r.furnishing,
      inputMethod: r.input_method,
      roomCount: r.room_count,
      totalArea: r.total_area == null ? null : { value: Number(r.total_area), source: r.total_area_source ?? "user" },
      ceilingHeight: { value: Number(r.ceiling_height), source: r.ceiling_height_source },
      thumbnail: r.thumbnail,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async get(id: string): Promise<Project | null> {
    const { data, error } = await this.sb.rpc("project_document", { p_project: id });
    if (error) throw error;
    return data ? normalizeProject(data) : null;
  }

  async save(project: Project) {
    const { error } = await this.sb.rpc("save_project", { doc: project });
    if (error) throw error;
  }

  async remove(id: string) {
    const uid = await this.userId();
    const { data: files } = await this.sb.storage.from(MEDIA_BUCKET).list(`${uid}/${id}`, { limit: 1000 });
    if (files?.length) await this.sb.storage.from(MEDIA_BUCKET).remove(files.map((f) => `${uid}/${id}/${f.name}`));
    const { error } = await this.sb.from("projects").delete().eq("id", id);
    if (error) throw error;
  }

  async putBlob(projectId: string, assetId: string, blob: Blob) {
    const uid = await this.userId();
    const { error } = await this.sb.storage
      .from(MEDIA_BUCKET)
      .upload(`${uid}/${projectId}/${assetId}`, blob, { upsert: true, contentType: blob.type || "application/octet-stream" });
    if (error) throw error;
  }

  async getBlob(projectId: string, assetId: string) {
    const uid = await this.userId();
    const { data, error } = await this.sb.storage.from(MEDIA_BUCKET).download(`${uid}/${projectId}/${assetId}`);
    if (error) return null;
    return data;
  }

  async deleteBlob(projectId: string, assetId: string) {
    const uid = await this.userId();
    await this.sb.storage.from(MEDIA_BUCKET).remove([`${uid}/${projectId}/${assetId}`]);
  }

  // ---------- Delen ----------

  async listShares(projectId: string): Promise<ShareSettings[]> {
    const { data, error } = await this.sb
      .from("project_shares")
      .select("id,token,project_id,enabled,expires_at,passcode_hash,allow_original_photos,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((s) => ({
      id: s.id,
      token: s.token,
      projectId: s.project_id,
      enabled: s.enabled,
      expiresAt: s.expires_at,
      hasPasscode: Boolean(s.passcode_hash),
      allowOriginalPhotos: s.allow_original_photos,
      createdAt: s.created_at,
    }));
  }

  async createShare(projectId: string, opts: { expiresAt: string | null; passcode: string; allowOriginalPhotos: boolean }) {
    const { data, error } = await this.sb
      .from("project_shares")
      .insert({ project_id: projectId, expires_at: opts.expiresAt, allow_original_photos: opts.allowOriginalPhotos })
      .select("id")
      .single();
    if (error) throw error;
    if (opts.passcode) {
      const { error: e2 } = await this.sb.rpc("set_share_passcode", { p_share: data.id, p_passcode: opts.passcode });
      if (e2) throw e2;
    }
  }

  async updateShare(id: string, patch: { enabled?: boolean; expiresAt?: string | null }) {
    const row: Record<string, unknown> = {};
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
    const { error } = await this.sb.from("project_shares").update(row).eq("id", id);
    if (error) throw error;
  }

  async deleteShare(id: string) {
    const { error } = await this.sb.from("project_shares").delete().eq("id", id);
    if (error) throw error;
  }

  async logExport(projectId: string, kind: "pdf" | "csv" | "json" | "image", meta: Record<string, unknown> = {}) {
    await this.sb.from("exports").insert({ project_id: projectId, kind, meta });
  }
}
