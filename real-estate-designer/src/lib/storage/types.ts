import type { Project, ProjectMeta } from "../types";

/**
 * Opslag-adapter. De applicatie praat alleen met deze interface, zodat lokale
 * opslag (IndexedDB) en Supabase uitwisselbaar zijn.
 */
export interface ProjectRepository {
  readonly mode: "local" | "cloud";
  list(): Promise<ProjectMeta[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
  putBlob(projectId: string, assetId: string, blob: Blob): Promise<void>;
  getBlob(projectId: string, assetId: string): Promise<Blob | null>;
  deleteBlob(projectId: string, assetId: string): Promise<void>;
}

export interface ShareSettings {
  id: string;
  token: string;
  projectId: string;
  enabled: boolean;
  expiresAt: string | null;
  hasPasscode: boolean;
  allowOriginalPhotos: boolean;
  createdAt: string;
}
