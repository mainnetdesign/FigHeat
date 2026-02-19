/**
 * FigHeat - Image loading and optimization utilities
 * @license MIT
 */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = src;
  });
}

export function fitWithin(
  w: number,
  h: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 960, h: 540 };
  const s = Math.min(1, maxW / w, maxH / h);
  return {
    w: Math.max(1, Math.round(w * s)),
    h: Math.max(1, Math.round(h * s)),
  };
}

export type OptimizeImageResult = {
  bytes: Uint8Array;
  base64: string;
  width: number;
  height: number;
};

/**
 * Redimensiona e comprime imagem antes de enviar (ex.: Quick Mode).
 */
export async function optimizeImage(
  file: File,
  maxSize: number = 1024,
  quality: number = 0.85
): Promise<OptimizeImageResult> {
  const originalBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  const img = await loadImage(originalBase64);

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Falha ao criar canvas");

  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to compress"))),
      "image/jpeg",
      quality
    );
  });

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = canvas.toDataURL("image/jpeg", quality);

  return { bytes, base64, width, height };
}

export function canvasToPngBytes(
  canvas: HTMLCanvasElement
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        try {
          if (!blob) return reject(new Error("Failed to generate PNG."));
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        } catch {
          reject(new Error("Failed to convert PNG."));
        }
      },
      "image/png"
    );
  });
}
