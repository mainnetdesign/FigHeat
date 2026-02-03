// src/code.ts
/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 720, height: 640 });

type HeatmapPoint = { x: number; y: number; intensity: number };

type BoundingBox = {
  label: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  confidence: number;
};

type AnalyzeResponse = {
  heatmapPoints?: HeatmapPoint[];
  boundingBoxes?: BoundingBox[];
};

type Variant = "A" | "B";

type UiToCode =
  | {
      type: "ANALYZE_IMAGE";
      variant: Variant;
      baseUrl: string;
      bytes: Uint8Array;
      filename?: string;
      imageWidth: number;
      imageHeight: number;
    }
  | {
      type: "EXPORT_UI_SNAPSHOT";
      payload: {
        title?: string;
        pngBytes: Uint8Array;
        width: number;
        height: number;
      };
    };

type CodeToUi =
  | { type: "STATUS"; message: string }
  | {
      type: "DONE";
      variant: Variant;
      result: {
        imageBase64: string;
        heatmapPoints: HeatmapPoint[];
        boundingBoxes: BoundingBox[];
        imageWidth: number;
        imageHeight: number;
      };
    }
  | { type: "ERROR"; message: string };

function post(msg: CodeToUi) {
  figma.ui.postMessage(msg);
}

function bytesToDataUrl(bytes: Uint8Array, mime = "image/png") {
  const b64 = figma.base64Encode(bytes);
  return `data:${mime};base64,${b64}`;
}

figma.ui.onmessage = async (msg: UiToCode) => {
  try {
    if (msg.type === "ANALYZE_IMAGE") {
      const baseUrl = (msg.baseUrl || "").trim().replace(/\/$/, "");
      if (!baseUrl) throw new Error("Preencha a API Base URL.");
      if (!msg.bytes || msg.bytes.length === 0) throw new Error("Envie uma imagem antes.");

      post({ type: "STATUS", message: `Enviando para análise (${msg.variant})...` });

      let res: Response;
      try {
        // Se baseUrl já contém um path completo, usa ele direto
        // Senão, adiciona /api/cv/analyze
        const endpoint = baseUrl.includes('/api/') 
          ? baseUrl 
          : `${baseUrl}/api/cv/analyze`;
          
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: msg.bytes as unknown as BodyInit,
        });
      } catch (fetchError: any) {
        throw new Error(
          `Não foi possível conectar à API em ${baseUrl}. Verifique se o servidor está rodando e a URL está correta.`
        );
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Falha na análise (${res.status}): ${text || res.statusText}`);
      }

      const data = (await res.json()) as AnalyzeResponse;

      const heatmapPoints = Array.isArray(data.heatmapPoints) ? data.heatmapPoints : [];
      const boundingBoxes = Array.isArray(data.boundingBoxes) ? data.boundingBoxes : [];

      post({
        type: "DONE",
        variant: msg.variant,
        result: {
          imageBase64: bytesToDataUrl(msg.bytes),
          heatmapPoints,
          boundingBoxes,
          imageWidth: msg.imageWidth || 0,
          imageHeight: msg.imageHeight || 0,
        },
      });

      figma.notify(
        `Análise concluída (${msg.variant}). Heatmap: ${heatmapPoints.length}, Boxes: ${boundingBoxes.length}`
      );
      return;
    }

    if (msg.type === "EXPORT_UI_SNAPSHOT") {
      const p = msg.payload;

      if (!p?.pngBytes || p.pngBytes.length === 0) throw new Error("Snapshot vazio.");
      if (!p.width || !p.height) throw new Error("Tamanho inválido.");

      const frame = figma.createFrame();
      frame.name = p.title || "FigHeat Snapshot";
      frame.resize(p.width, p.height);
      frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

      const img = figma.createImage(p.pngBytes);

      const r = figma.createRectangle();
      r.name = "Snapshot";
      r.resize(p.width, p.height);
      r.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" }];

      frame.appendChild(r);
      figma.currentPage.appendChild(frame);

      frame.x = figma.viewport.center.x - p.width / 2;
      frame.y = figma.viewport.center.y - p.height / 2;

      figma.viewport.scrollAndZoomIntoView([frame]);
      figma.notify("Snapshot exportado no canvas.");
      return;
    }
  } catch (err: any) {
    const message = err?.message || "Erro desconhecido";
    post({ type: "ERROR", message });
    figma.notify(`Erro: ${message}`, { error: true });
  }
};