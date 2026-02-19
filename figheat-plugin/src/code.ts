// src/code.ts
/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 720, height: 640 });

// Polyfill global: define AbortController no sandbox do plugin Figma
(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : ({} as any);
  if ((g as any).AbortController != null) return;
  class AbortSignalPolyfill {
    aborted = false;
    onabort: (() => void) | null = null;
  }
  class AbortControllerPolyfill {
    signal: AbortSignalPolyfill = new AbortSignalPolyfill();
    abort() {
      this.signal.aborted = true;
      if (this.signal.onabort) this.signal.onabort();
    }
  }
  (g as any).AbortController = AbortControllerPolyfill;
  (g as any).AbortSignal = AbortSignalPolyfill;
})();

// Polyfill TextEncoder no sandbox do Figma (não disponível no ambiente do plugin)
(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : ({} as any);
  if ((g as any).TextEncoder != null) return;
  class TextEncoderPolyfill {
    encode(s: string): Uint8Array {
      const n = s.length;
      const bytes: number[] = [];
      for (let i = 0; i < n; i++) {
        let c = s.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) {
          bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c < 0xd800 || c >= 0xe000) {
          bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        } else {
          i++;
          const c2 = s.charCodeAt(i);
          const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
          bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
      }
      return new Uint8Array(bytes);
    }
  }
  (g as any).TextEncoder = TextEncoderPolyfill;
})();

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
  | { type: "CANCEL_ANALYSIS" }
  | {
      type: "EXPORT_UI_SNAPSHOT";
      payload: {
        title?: string;
        pngBytes: Uint8Array;
        width: number;
        height: number;
      };
    }
  | {
      type: "FETCH_PROXY";
      id: string;
      method: "GET" | "POST";
      url: string;
      body?: string | Uint8Array;
      headers?: Record<string, string>;
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
  | { type: "ERROR"; message: string }
  | { type: "CANCELLED" }
  | {
      type: "FETCH_PROXY_RESULT";
      id: string;
      ok: boolean;
      status?: number;
      json?: unknown;
      blobBase64?: string;
      error?: string;
    };

function post(msg: CodeToUi) {
  figma.ui.postMessage(msg);
}

function bytesToDataUrl(bytes: Uint8Array, mime = "image/png") {
  const b64 = figma.base64Encode(bytes);
  return `data:${mime};base64,${b64}`;
}

let currentAnalyzeController: AbortController | null = null;

figma.ui.onmessage = async (msg: UiToCode) => {
  try {
    if (msg.type === "CANCEL_ANALYSIS") {
      if (currentAnalyzeController) {
        currentAnalyzeController.abort();
        currentAnalyzeController = null;
      }
      return;
    }

    if (msg.type === "ANALYZE_IMAGE") {
      const baseUrl = (msg.baseUrl || "").trim().replace(/\/$/, "");
      if (!baseUrl) throw new Error("Please fill in the API Base URL.");
      if (!msg.bytes || msg.bytes.length === 0) throw new Error("Upload an image first.");

      post({ type: "STATUS", message: `Sending for analysis (${msg.variant})...` });

      const controller = new AbortController();
      currentAnalyzeController = controller;

      let res: Response;
      try {
        const endpoint = baseUrl.includes('/api/') 
          ? baseUrl 
          : `${baseUrl}/api/cv/analyze`;
          
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: msg.bytes as unknown as BodyInit,
          signal: controller.signal,
        });
      } catch (fetchError: any) {
        currentAnalyzeController = null;
        if (fetchError?.name === "AbortError") {
          post({ type: "CANCELLED" });
          return;
        }
        throw new Error(
          `Could not connect to API at ${baseUrl}. Check that the server is running and the URL is correct.`
        );
      }

      currentAnalyzeController = null;

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let errMsg = text || res.statusText;
        try {
          const j = JSON.parse(text);
          if (typeof j?.error === "string") errMsg = j.error;
        } catch (_) {}
        throw new Error(res.status >= 500 ? errMsg : `Analysis failed (${res.status}): ${errMsg}`);
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
        `Analysis complete (${msg.variant}). Heatmap: ${heatmapPoints.length}, Boxes: ${boundingBoxes.length}`
      );
      return;
    }

    if (msg.type === "EXPORT_UI_SNAPSHOT") {
      const p = msg.payload;

      if (!p?.pngBytes || p.pngBytes.length === 0) throw new Error("Empty snapshot.");
      if (!p.width || !p.height) throw new Error("Invalid size.");

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
      figma.notify("Snapshot exported to canvas.");
      return;
    }

    if (msg.type === "FETCH_PROXY") {
      const { id, method, url, body, headers: customHeaders } = msg;
      const headers: Record<string, string> = { ...customHeaders };
      if (body !== undefined) {
        if (typeof body === "string") headers["Content-Type"] = "application/json";
        else headers["Content-Type"] = "application/octet-stream";
      }
      try {
        const res = await fetch(url, {
          method,
          headers: Object.keys(headers).length ? headers : undefined,
          body: body === undefined ? undefined : (body as BodyInit),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          figma.ui.postMessage({
            type: "FETCH_PROXY_RESULT",
            id,
            ok: false,
            status: res.status,
            error: text || res.statusText,
          });
          return;
        }

        // Lê o body uma vez (evita res.clone() que pode falhar no sandbox do Figma).
        const text = await res.text();
        try {
          const json = JSON.parse(text) as unknown;
          figma.ui.postMessage({ type: "FETCH_PROXY_RESULT", id, ok: true, status: res.status, json });
          return;
        } catch (_) {
          // Não era JSON; envia como blob base64 para download (ex.: training export).
        }
        const bytes = new TextEncoder().encode(text);
        const b64 = figma.base64Encode(new Uint8Array(bytes));
        figma.ui.postMessage({ type: "FETCH_PROXY_RESULT", id, ok: true, status: res.status, blobBase64: b64 });
      } catch (err: any) {
        figma.ui.postMessage({
          type: "FETCH_PROXY_RESULT",
          id,
          ok: false,
          error: err?.message || "Failed to fetch",
        });
      }
      return;
    }
  } catch (err: any) {
    const message = err?.message || "Unknown error";
    post({ type: "ERROR", message });
    figma.notify(`Error: ${message}`, { error: true });
  }
};