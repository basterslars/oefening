"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PresentationViewer } from "@/components/PresentationViewer";
import { Notice } from "@/components/ui";
import { assetUrl, getRepository } from "@/lib/storage";
import type { Project } from "@/lib/types";

export default function PresentMode() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getRepository().get(id);
        if (!p) return setError("Project niet gevonden.");
        const out: Record<string, string> = {};
        for (const m of p.media) {
          const u = await assetUrl(p.id, m.id);
          if (u) out[m.id] = u;
        }
        setUrls(out);
        setProject(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  if (error) return <div className="mx-auto max-w-lg p-10"><Notice tone="error">{error}</Notice></div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Presentatie laden…</div>;
  return (
    <div className="min-h-screen">
      <div className="border-b border-line bg-white/80 px-4 py-2 text-right text-[13px] backdrop-blur">
        <Link href={`/projects/${id}?tab=presentatie`} className="text-muted hover:text-ink">
          Presentatiemodus sluiten
        </Link>
      </div>
      <PresentationViewer project={project} urls={urls} />
    </div>
  );
}
