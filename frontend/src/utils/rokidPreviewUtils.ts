import type { FaceMatch } from "../api/client";

export type PreviewRotation = 0 | 90 | 180 | 270;

export const ROKID_PREVIEW_ROTATIONS: PreviewRotation[] = [0, 90, 180, 270];

export function nextPreviewRotation(current: PreviewRotation): PreviewRotation {
  const idx = ROKID_PREVIEW_ROTATIONS.indexOf(current);
  return ROKID_PREVIEW_ROTATIONS[(idx + 1) % ROKID_PREVIEW_ROTATIONS.length];
}

export function previewContentSize(
  srcW: number,
  srcH: number,
  rotationCW: PreviewRotation,
): { contentW: number; contentH: number } {
  if (rotationCW === 90 || rotationCW === 270) {
    return { contentW: srcH, contentH: srcW };
  }
  return { contentW: srcW, contentH: srcH };
}

export function drawRokidPreviewFrame(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  faces: FaceMatch[],
  rotationCW: PreviewRotation,
  unknownLabel = "?",
) {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (srcW < 1 || srcH < 1) return;

  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;
  if (displayW < 1 || displayH < 1) return;

  const { contentW, contentH } = previewContentSize(srcW, srcH, rotationCW);

  canvas.width = displayW;
  canvas.height = displayH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, displayW, displayH);

  const scale = Math.min(displayW / contentW, displayH / contentH);

  ctx.save();
  ctx.translate(displayW / 2, displayH / 2);
  ctx.scale(scale, scale);
  ctx.rotate((rotationCW * Math.PI) / 180);
  ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);

  for (const face of faces) {
    if (!face.bbox || face.bbox.length < 4) continue;
    const [x1, y1, x2, y2] = face.bbox;
    const bx = x1 - srcW / 2;
    const by = y1 - srcH / 2;
    const bw = x2 - x1;
    const bh = y2 - y1;
    const known = face.name !== "未知";

    ctx.strokeStyle = known ? "#39FF14" : "#FF4444";
    ctx.lineWidth = 3 / scale;
    ctx.strokeRect(bx, by, bw, bh);

    const label = known ? face.name : unknownLabel;
    ctx.font = `700 ${20 / scale}px "Noto Sans SC", sans-serif`;
    const tw = ctx.measureText(label).width + 16 / scale;
    ctx.fillStyle = known ? "rgba(57,255,20,0.9)" : "rgba(255,68,68,0.9)";
    ctx.fillRect(bx, by - 30 / scale, tw, 28 / scale);
    ctx.fillStyle = known ? "#000" : "#fff";
    ctx.fillText(label, bx + 8 / scale, by - 10 / scale);
  }

  ctx.restore();
}
