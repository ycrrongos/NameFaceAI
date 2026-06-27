const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export class UploadError extends Error {
  i18nKey: string;
  i18nParams?: Record<string, string | number>;

  constructor(i18nKey: string, i18nParams?: Record<string, string | number>) {
    super(i18nKey);
    this.name = "UploadError";
    this.i18nKey = i18nKey;
    this.i18nParams = i18nParams;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new UploadError("upload.readFailed"));
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
  if (!ctx) throw new UploadError("upload.processFailed");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new UploadError("upload.unsupportedFormat", { name: file.name });
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
  const errors: UploadError[] = [];

  for (const file of list) {
    try {
      results.push(await fileToDataUrl(file));
    } catch (e) {
      errors.push(
        e instanceof UploadError
          ? e
          : new UploadError("upload.fileFailed", { name: file.name }),
      );
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw errors[0];
  }
  return results;
}
