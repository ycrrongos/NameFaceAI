const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("无法读取图片"));
    img.src = url;
  });
}

function resizeToJpegDataUrl(img: HTMLImageElement): string {
  let { width, height } = img;
  const maxEdge = Math.max(width, height);
  if (maxEdge > MAX_EDGE) {
    const scale = MAX_EDGE / maxEdge;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error(`不支持的格式：${file.name}（请使用 JPG、PNG 或 WebP）`);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    return resizeToJpegDataUrl(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function filesToDataUrls(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files);
  const results: string[] = [];
  const errors: string[] = [];

  for (const file of list) {
    try {
      results.push(await fileToDataUrl(file));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `${file.name} 处理失败`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors.join("；"));
  }
  return results;
}
