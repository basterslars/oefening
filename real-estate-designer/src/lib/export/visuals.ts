"use client";

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

/** Zet twee beelden naast elkaar met duidelijke labels (voor-en-na) */
export async function composeSideBySide(beforeSrc: string, afterSrc: string, labels: [string, string], footer?: string): Promise<Blob> {
  const [a, b] = await Promise.all([loadImg(beforeSrc), loadImg(afterSrc)]);
  const h = Math.min(a.naturalHeight, b.naturalHeight, 1200);
  const wa = Math.round((a.naturalWidth / a.naturalHeight) * h);
  const wb = Math.round((b.naturalWidth / b.naturalHeight) * h);
  const gap = 16;
  const foot = footer ? 44 : 0;
  const c = document.createElement("canvas");
  c.width = wa + wb + gap;
  c.height = h + foot;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(a, 0, 0, wa, h);
  ctx.drawImage(b, wa + gap, 0, wb, h);
  const tag = (text: string, x: number) => {
    ctx.font = "600 22px Inter, system-ui, sans-serif";
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = "rgba(28,27,25,0.78)";
    ctx.beginPath();
    ctx.roundRect(x + 16, 16, w, 38, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x + 30, 43);
  };
  tag(labels[0], 0);
  tag(labels[1], wa + gap);
  if (footer) {
    ctx.fillStyle = "#6f6b64";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText(footer, 16, h + 28);
  }
  return new Promise((resolve, reject) => c.toBlob((bl) => (bl ? resolve(bl) : reject(new Error("Samenstellen mislukt"))), "image/jpeg", 0.9));
}

/** Plaatst een vaste markering 'Virtueel ingericht' op een afbeelding */
export async function watermark(src: string, text: string): Promise<Blob> {
  const img = await loadImg(src);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const size = Math.max(14, Math.round(c.width / 60));
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 1.2;
  ctx.fillStyle = "rgba(28,27,25,0.72)";
  ctx.beginPath();
  ctx.roundRect(c.width - w - size, c.height - size * 2.6, w, size * 1.8, size * 0.4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, c.width - w - size + size * 0.6, c.height - size * 1.3);
  return new Promise((resolve, reject) => c.toBlob((bl) => (bl ? resolve(bl) : reject(new Error("Markeren mislukt"))), "image/jpeg", 0.92));
}
