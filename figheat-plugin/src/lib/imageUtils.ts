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

/** Limite do snapshot exportado para o Figma (antes: 1920×1080). */
export const EXPORT_SNAPSHOT_MAX_W = 3840;
export const EXPORT_SNAPSHOT_MAX_H = 2160;

/** Render interno N× maior e depois redução — suaviza bordas do heatmap. */
export const EXPORT_SUPER_SAMPLE = 2;

/** Teto ~15MP no canvas hi-res para reduzir risco de OOM no iframe do plugin. */
export const EXPORT_MAX_HI_PIXELS = 15_000_000;

/**
 * Monta o canvas final: imagem + camada de heatmap, com supersampling opcional.
 */
export function composeExportSnapshotCanvas(
  img: HTMLImageElement,
  paintHeatmap: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  options?: {
    maxW?: number;
    maxH?: number;
    superSample?: number;
    maxHiPixels?: number;
  }
): HTMLCanvasElement {
  const maxW = options?.maxW ?? EXPORT_SNAPSHOT_MAX_W;
  const maxH = options?.maxH ?? EXPORT_SNAPSHOT_MAX_H;
  let superSample = options?.superSample ?? EXPORT_SUPER_SAMPLE;
  const maxHiPixels = options?.maxHiPixels ?? EXPORT_MAX_HI_PIXELS;

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw <= 0 || nh <= 0) throw new Error("Invalid image dimensions for export.");

  const { w: outW, h: outH } = fitWithin(nw, nh, maxW, maxH);

  let hiW = Math.round(outW * superSample);
  let hiH = Math.round(outH * superSample);
  if (hiW * hiH > maxHiPixels) {
    superSample = 1;
    hiW = outW;
    hiH = outH;
  }

  const hi = document.createElement("canvas");
  hi.width = hiW;
  hi.height = hiH;
  const ctxHi = hi.getContext("2d");
  if (!ctxHi) throw new Error("Failed to create export canvas.");

  ctxHi.imageSmoothingEnabled = true;
  ctxHi.imageSmoothingQuality = "high";
  ctxHi.fillStyle = "#ffffff";
  ctxHi.fillRect(0, 0, hiW, hiH);
  ctxHi.drawImage(img, 0, 0, hiW, hiH);
  paintHeatmap(ctxHi, hiW, hiH);

  if (superSample <= 1) {
    return hi;
  }

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctxOut = out.getContext("2d");
  if (!ctxOut) throw new Error("Failed to create export output canvas.");

  ctxOut.imageSmoothingEnabled = true;
  ctxOut.imageSmoothingQuality = "high";
  ctxOut.fillStyle = "#ffffff";
  ctxOut.fillRect(0, 0, outW, outH);
  ctxOut.drawImage(hi, 0, 0, hiW, hiH, 0, 0, outW, outH);
  return out;
}

export type OptimizeImageResult = {
  bytes: Uint8Array;
  base64: string;
  width: number;
  height: number;
};

/**
 * Parâmetros adaptativos para imagens grandes/complexas.
 * Otimização agressiva para caber no limite de 60s do Flash.
 * - Enormes (>4000px ou >4MB): 480px, 0.65
 * - Muito grandes (>3000px ou >3MB): 512px, 0.7
 * - Grandes (>2000px ou >1.5MB): 576px, 0.72
 * - Médias (>1500px ou >800KB): 640px, 0.78
 * - Normais: usa maxSize e quality informados
 */
function getAdaptiveParams(
  maxDim: number,
  fileSizeBytes: number,
  defaultMaxSize: number,
  defaultQuality: number
): { maxSize: number; quality: number } {
  if (maxDim > 4000 || fileSizeBytes > 4 * 1024 * 1024) {
    return { maxSize: 480, quality: 0.65 };
  }
  if (maxDim > 3000 || fileSizeBytes > 3 * 1024 * 1024) {
    return { maxSize: 512, quality: 0.7 };
  }
  if (maxDim > 2000 || fileSizeBytes > 1.5 * 1024 * 1024) {
    return { maxSize: 576, quality: 0.72 };
  }
  if (maxDim > 1500 || fileSizeBytes > 800 * 1024) {
    return { maxSize: 640, quality: 0.78 };
  }
  return { maxSize: defaultMaxSize, quality: defaultQuality };
}

/**
 * Redimensiona e comprime imagem antes de enviar (ex.: Quick Mode).
 * Aplica otimização adaptativa para imagens grandes/complexas.
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

  const { maxSize: effectiveMaxSize, quality: effectiveQuality } = getAdaptiveParams(
    Math.max(img.naturalWidth, img.naturalHeight),
    file.size,
    maxSize,
    quality
  );

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width > effectiveMaxSize || height > effectiveMaxSize) {
    const ratio = Math.min(effectiveMaxSize / width, effectiveMaxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas");

  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to compress"))),
      "image/jpeg",
      effectiveQuality
    );
  });

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = canvas.toDataURL("image/jpeg", effectiveQuality);

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
