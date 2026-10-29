"use client";

import { FileText, Film, Box } from "lucide-react";
import { useEffect, useState } from "react";
import { assetUrl } from "@/lib/storage";
import type { MediaAsset } from "@/lib/types";
import { cx } from "../ui";

export function useAssetUrl(projectId: string, assetId: string | undefined | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (assetId) assetUrl(projectId, assetId).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [projectId, assetId]);
  return assetId ? url : null;
}

export function MediaThumb({ projectId, asset, className, contain }: { projectId: string; asset: MediaAsset; className?: string; contain?: boolean }) {
  const url = useAssetUrl(projectId, asset.id);
  if (asset.mime.startsWith("image/"))
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={asset.name} className={cx(contain ? "object-contain" : "object-cover", className)} />
    ) : (
      <div className={cx("animate-pulse bg-stone-100", className)} />
    );
  if (asset.mime.startsWith("video/")) return url ? <video src={url} className={cx("object-cover", className)} controls preload="metadata" /> : <div className={cx("flex items-center justify-center bg-stone-100", className)}><Film size={20} /></div>;
  return (
    <div className={cx("flex flex-col items-center justify-center gap-1 bg-stone-100 text-muted", className)}>
      {asset.kind === "model" ? <Box size={20} /> : <FileText size={20} />}
      <span className="px-2 text-center text-[10px]">{asset.mime === "application/pdf" ? "PDF (origineel)" : asset.mime}</span>
    </div>
  );
}
