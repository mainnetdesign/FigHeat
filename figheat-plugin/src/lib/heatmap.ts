/**
 * FigHeat - Heatmap drawing and color detection utilities
 * @license MIT
 */

import type { HeatmapPoint, BoundingBox } from "../types";
import type { ColorScheme } from "../types";

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Converte pontos do heatmap para escala 0–100 usada em drawHeatmapBlobs.
 * O schema da API pede 0–100, mas modelos às vezes devolvem 0–1 ou pixels.
 */
export function normalizeHeatmapPointsToPercent(
  points: HeatmapPoint[],
  imgNaturalW?: number,
  imgNaturalH?: number
): HeatmapPoint[] {
  if (!points.length) return points;
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  if (maxX <= 1.001 && maxY <= 1.001) {
    return points.map((p) => ({
      ...p,
      x: p.x * 100,
      y: p.y * 100,
    }));
  }
  const w = imgNaturalW ?? 0;
  const h = imgNaturalH ?? 0;
  if (w > 0 && h > 0 && (maxX > 100 || maxY > 100)) {
    return points.map((p) => ({
      ...p,
      x: Math.max(0, Math.min(100, (p.x / w) * 100)),
      y: Math.max(0, Math.min(100, (p.y / h) * 100)),
    }));
  }
  return points;
}

/**
 * Detecta cores predominantes da imagem para escolher esquema de heatmap.
 */
export function detectDominantColor(imageElement: HTMLImageElement): ColorScheme {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "warm";

    const sampleSize = 100;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    ctx.drawImage(imageElement, 0, 0, sampleSize, sampleSize);

    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;

    let totalRed = 0,
      totalGreen = 0,
      totalBlue = 0;
    let pixelCount = 0;

    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      if (a < 50) continue;
      totalRed += r;
      totalGreen += g;
      totalBlue += b;
      pixelCount++;
    }

    if (pixelCount === 0) return "warm";

    const avgRed = totalRed / pixelCount;
    const avgGreen = totalGreen / pixelCount;
    const avgBlue = totalBlue / pixelCount;

    const isWarmPage = avgRed > avgBlue + 20;
    // Warm page (red tones) → warm heatmap; cool page (blue tones) → cool heatmap
    const decision: ColorScheme = isWarmPage ? "warm" : "cool";

    console.log(
      `🎨 Detection: R=${avgRed.toFixed(0)} G=${avgGreen.toFixed(0)} B=${avgBlue.toFixed(0)} → ${decision === "cool" ? "❄️ COOL (blue)" : "🔥 WARM (red)"}`
    );

    return decision;
  } catch (err) {
    console.warn("Error detecting colors:", err);
    return "warm";
  }
}

const GRADIENT_COOL: Array<{ stop: number; color: string }> = [
  { stop: 0.0, color: "rgba(0, 255, 200, 0)" },
  { stop: 0.22, color: "rgba(0, 220, 245, 0.28)" },
  { stop: 0.45, color: "rgba(0, 190, 255, 0.5)" },
  { stop: 0.68, color: "rgba(0, 140, 255, 0.68)" },
  { stop: 0.88, color: "rgba(60, 100, 255, 0.35)" },
  { stop: 1.0, color: "rgba(80, 80, 255, 0)" },
];

/**
 * Warm: só laranja / âmbar. Mais stops na borda = menos banding antes do blur.
 */
const GRADIENT_WARM: Array<{ stop: number; color: string }> = [
  { stop: 0.0, color: "rgba(210, 65, 0, 0.92)" },
  { stop: 0.18, color: "rgba(232, 78, 0, 0.75)" },
  { stop: 0.34, color: "rgba(255, 108, 0, 0.58)" },
  { stop: 0.5, color: "rgba(255, 138, 35, 0.4)" },
  { stop: 0.64, color: "rgba(255, 162, 70, 0.26)" },
  { stop: 0.78, color: "rgba(255, 185, 105, 0.14)" },
  { stop: 0.9, color: "rgba(255, 200, 130, 0.05)" },
  { stop: 1.0, color: "rgba(255, 210, 145, 0)" },
];

/** Opacidade por índice do stop: centro forte, borda suave; último = 0 (só cor do stop importa). */
function heatmapStopBaseOpacity(stopIndex: number, totalStops: number): number {
  if (totalStops <= 1) return 0.85;
  if (stopIndex >= totalStops - 1) return 0;
  const t = stopIndex / (totalStops - 1);
  return 0.08 + 0.82 * (1 - t);
}

export function getHeatmapGradient(
  scheme: ColorScheme
): Array<{ stop: number; color: string }> {
  return scheme === "cool" ? [...GRADIENT_COOL] : [...GRADIENT_WARM];
}

/** Desenha formas do heatmap sem blur (vetor + gradiente). */
function drawHeatmapBlobShapes(
  target: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  w: number,
  h: number,
  globalIntensity: number,
  gradientColors: Array<{ stop: number; color: string }>,
  nStops: number
): void {
  target.globalCompositeOperation = "source-over";
  target.filter = "none";

  for (const p of points) {
    const x = (p.x / 100) * w;
    const y = (p.y / 100) * h;
    const intensity = Math.max(0.75, clamp01(Number(p.intensity ?? 0.75)));

    const baseRadius = Math.max(1, Math.min(w, h) * 0.16 * intensity);
    const numBlobs = 6;
    const flowDirection = (x * 0.17 + y * 0.17) % (Math.PI * 2);

    for (let i = 0; i < numBlobs; i++) {
      const progress = numBlobs <= 1 ? 0 : i / (numBlobs - 1);
      const spreadAngle = (i / numBlobs) * Math.PI * 2 + flowDirection;
      const spreadRadius =
        baseRadius * (0.4 + progress * 0.6) * (0.7 + Math.sin(i * 0.8) * 0.3);

      const offsetX = Math.cos(spreadAngle) * spreadRadius;
      const offsetY = Math.sin(spreadAngle) * spreadRadius;
      const blobX = x + offsetX;
      const blobY = y + offsetY;

      const sizeVariation =
        0.5 +
        Math.sin(i * 1.5 + x * 0.02) * 0.4 +
        Math.cos(i * 2.0) * 0.4;
      const radius = Math.max(1, baseRadius * sizeVariation);
      const blobIntensity = intensity * (0.95 - progress * 0.25);

      if (radius <= 0) continue;

      target.save();
      const scaleX = 0.75 + Math.sin(i * 0.8) * 0.35;
      const scaleY = 0.75 + Math.cos(i * 0.9) * 0.35;
      target.translate(blobX, blobY);
      target.rotate(spreadAngle + i * 0.25);
      target.scale(scaleX, scaleY);

      const gradient = target.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradientColors.forEach((colorStop, idx) => {
        const baseOpacity = heatmapStopBaseOpacity(idx, nStops);
        const finalOpacity = baseOpacity * blobIntensity * globalIntensity;
        const colorWithOpacity = colorStop.color.replace(
          /[\d.]+\)$/,
          `${finalOpacity})`
        );
        gradient.addColorStop(colorStop.stop, colorWithOpacity);
      });

      target.fillStyle = gradient;
      target.beginPath();
      target.arc(0, 0, radius, 0, Math.PI * 2);
      target.fill();
      target.restore();
    }
  }
}

/**
 * Camada offscreen + um único blur ao compor: evita “grelha”/pixels nas bordas
 * que aparecem quando o blur aplica a cada path em separado.
 */
function drawHeatmapBlobs(
  ctx: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  w: number,
  h: number,
  scheme: ColorScheme,
  globalIntensity: number = 1
): void {
  if (!w || !h || w <= 0 || h <= 0) return;

  const gradientColors = getHeatmapGradient(scheme);
  const nStops = gradientColors.length;

  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));
  const layer = document.createElement("canvas");
  layer.width = iw;
  layer.height = ih;
  const lctx = layer.getContext("2d");
  if (!lctx) return;

  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = "high";

  drawHeatmapBlobShapes(lctx, points, w, h, globalIntensity, gradientColors, nStops);

  const blurPx = Math.max(24, Math.min(50, Math.min(w, h) * 0.038));
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = `blur(${blurPx}px)`;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(layer, 0, 0, w, h);
  ctx.restore();
  ctx.filter = "none";
}

/**
 * Desenha apenas a camada de heatmap (blobs) no canvas.
 * Usado pelo overlay principal e por outros canvas.
 */
export function drawHeat(
  ctx: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  w: number,
  h: number,
  scheme: ColorScheme,
  globalIntensity: number = 1,
  imgNaturalW?: number,
  imgNaturalH?: number
): void {
  if (!w || !h || w <= 0 || h <= 0) {
    console.warn("drawHeat: Invalid dimensions", { w, h });
    return;
  }
  const pts = normalizeHeatmapPointsToPercent(points, imgNaturalW, imgNaturalH);
  drawHeatmapBlobs(ctx, pts, w, h, scheme, globalIntensity);
}

/**
 * Desenha heatmap nos canvas de votação (sem globalIntensity extra).
 */
export function drawHeatOnCanvas(
  ctx: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  w: number,
  h: number,
  scheme: ColorScheme,
  imgNaturalW?: number,
  imgNaturalH?: number
): void {
  if (!w || !h || w <= 0 || h <= 0) {
    console.warn("drawHeatOnCanvas: Invalid dimensions", { w, h });
    return;
  }
  const pts = normalizeHeatmapPointsToPercent(points, imgNaturalW, imgNaturalH);
  drawHeatmapBlobs(ctx, pts, w, h, scheme, 1);
}

/**
 * Desenha bounding boxes com labels.
 * @param imgNaturalW - Largura da imagem em pixels (para coordenadas não normalizadas)
 * @param imgNaturalH - Altura da imagem em pixels (para coordenadas não normalizadas)
 * Se não informados, assume coordenadas normalizadas 0-100.
 */
export function drawBoxes(
  ctx: CanvasRenderingContext2D,
  boxes: BoundingBox[],
  w: number,
  h: number,
  imgNaturalW?: number,
  imgNaturalH?: number
): void {
  const lineW = Math.max(2, Math.round(Math.min(w, h) * 0.003));
  const labelPadX = 8;
  const labelPadY = 5;

  const useNatural = imgNaturalW != null && imgNaturalH != null && imgNaturalW > 0 && imgNaturalH > 0;
  const isNormalized = useNatural
    ? !boxes.some((b) => b.xmax > 100 || b.ymax > 100)
    : true;
  const refW = useNatural && !isNormalized ? imgNaturalW : 100;
  const refH = useNatural && !isNormalized ? imgNaturalH : 100;

  for (const b of boxes) {
    const x1 = isNormalized ? (b.xmin / 100) * w : (b.xmin / refW) * w;
    const y1 = isNormalized ? (b.ymin / 100) * h : (b.ymin / refH) * h;
    const x2 = isNormalized ? (b.xmax / 100) * w : (b.xmax / refW) * w;
    const y2 = isNormalized ? (b.ymax / 100) * h : (b.ymax / refH) * h;
    const boxW = Math.max(1, x2 - x1);
    const boxH = Math.max(1, y2 - y1);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = lineW + 2;
    ctx.strokeRect(x1, y1, boxW, boxH);
    ctx.strokeStyle = "rgba(40, 120, 255, 0.95)";
    ctx.lineWidth = lineW;
    ctx.strokeRect(x1, y1, boxW, boxH);

    const label = b.label || "item";
    const confidence = Math.round((b.confidence || 0) * 100);
    const text = `${label} ${confidence}%`;
    const fontSize = Math.max(14, Math.round(w * 0.014));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const labelH = textHeight + labelPadY * 2;
    const labelX = x1;
    const spaceAbove = y1;
    const spaceBelow = h - y2;
    const drawLabelAbove = spaceAbove >= labelH + 6;
    const labelY = drawLabelAbove
      ? y1 - labelH - 6
      : spaceBelow >= labelH + 6
        ? y2 + 4
        : y1 - labelH - 6;
    const labelW = textWidth + labelPadX * 2;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(labelX, labelY, labelW, labelH);
    ctx.fillStyle = "rgba(40, 120, 255, 0.95)";
    ctx.fillRect(labelX, labelY, labelW, labelH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(text, labelX + labelPadX, labelY + labelPadY);
  }
}

/**
 * Desenha boxes no overlay: compactos, discretos e legíveis.
 */
export function drawBoxesOverlay(
  ctx: CanvasRenderingContext2D,
  boxes: BoundingBox[],
  w: number,
  h: number,
  imgNaturalW: number,
  imgNaturalH: number
): void {
  const isNormalized = !boxes.some((b) => b.xmax > 100 || b.ymax > 100);
  const padX = 6;
  const padY = 3;
  const labelGap = 6;
  const labelStackStep = 4;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const x1 = isNormalized
      ? (b.xmin / 100) * w
      : (b.xmin / imgNaturalW) * w;
    const y1 = isNormalized
      ? (b.ymin / 100) * h
      : (b.ymin / imgNaturalH) * h;
    const x2 = isNormalized
      ? (b.xmax / 100) * w
      : (b.xmax / imgNaturalW) * w;
    const y2 = isNormalized
      ? (b.ymax / 100) * h
      : (b.ymax / imgNaturalH) * h;
    const boxWidth = Math.max(1, x2 - x1);
    const boxHeight = Math.max(1, y2 - y1);

    ctx.strokeStyle = "rgba(59, 130, 246, 0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, boxWidth, boxHeight);

    const label = b.label || "item";
    const confidence = Math.round((b.confidence || 0) * 100);
    const text = `${label} ${confidence}%`;
    const fontSize = Math.max(11, Math.round(w * 0.014));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const labelH = fontSize + padY * 2;
    const labelW = textWidth + padX * 2;
    const spaceAbove = y1;
    const spaceBelow = h - y2;
    const drawLabelAbove = spaceAbove >= labelH + labelGap;
    const stackOffset = i * labelStackStep;
    let labelY = drawLabelAbove
      ? y1 - labelH - labelGap - stackOffset
      : spaceBelow >= labelH + labelGap
        ? y2 + labelGap + stackOffset
        : y1 - labelH - labelGap - stackOffset;
    const labelX = Math.max(0, Math.min(x1, w - labelW));
    labelY = Math.max(0, Math.min(labelY, h - labelH));

    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(labelX, labelY, labelW, labelH);
    ctx.fillStyle = "rgba(59, 130, 246, 0.82)";
    ctx.fillRect(labelX, labelY, labelW, labelH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(text, labelX + padX, labelY + padY);
  }
}
