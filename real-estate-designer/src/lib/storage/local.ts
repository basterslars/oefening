"use client";

import { createStore, del, get, set, keys, type UseStore } from "idb-keyval";
import { normalizeProject, toMeta } from "../project";
import type { Project, ProjectMeta } from "../types";
import type { ProjectRepository } from "./types";

/**
 * Lokale opslag in IndexedDB van de browser. Werkt zonder account of server;
 * gegevens blijven op dit apparaat.
 */
export class LocalRepository implements ProjectRepository {
  readonly mode = "local" as const;
  private projects: UseStore;
  private blobs: UseStore;

  constructor() {
    this.projects = createStore("red-projects", "projects");
    this.blobs = createStore("red-blobs", "blobs");
  }

  async list(): Promise<ProjectMeta[]> {
    const ids = (await keys(this.projects)) as string[];
    const out: ProjectMeta[] = [];
    for (const id of ids) {
      const p = await get<Project>(id, this.projects);
      if (p) out.push(toMeta(normalizeProject(p)));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string) {
    const p = await get<Project>(id, this.projects);
    return p ? normalizeProject(p) : null;
  }

  async save(project: Project) {
    await set(project.id, project, this.projects);
  }

  async remove(id: string) {
    const p = await this.get(id);
    if (p) for (const m of p.media) await this.deleteBlob(id, m.id);
    await del(id, this.projects);
  }

  async putBlob(projectId: string, assetId: string, blob: Blob) {
    await set(`${projectId}/${assetId}`, blob, this.blobs);
  }

  async getBlob(projectId: string, assetId: string) {
    return (await get<Blob>(`${projectId}/${assetId}`, this.blobs)) ?? null;
  }

  async deleteBlob(projectId: string, assetId: string) {
    await del(`${projectId}/${assetId}`, this.blobs);
  }
}
