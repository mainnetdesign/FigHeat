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
