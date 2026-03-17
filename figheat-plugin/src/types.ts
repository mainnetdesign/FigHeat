/**
 * FigHeat - Shared types
 * @license MIT
 */

export type HeatmapPoint = { x: number; y: number; intensity: number };

export type BoundingBox = {
  label: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  confidence: number;
};

export type Insight = {
  type: 'success' | 'warning' | 'info' | 'suggestion';
  title: string;
  message: string;
  priority: number;
};

export type AnalysisInsights = {
  score: number;
  insights: Insight[];
};

export type Variant = "A" | "B";

export type ResultState = {
  bytes: Uint8Array | null;
  imageBase64: string | null;
  points: HeatmapPoint[];
  boxes: BoundingBox[];
  w: number;
  h: number;
};

export type CodeToUi =
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

export type UiToCode =
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
    }
  | {
      type: "FETCH_PROXY";
      id: string;
      method: "GET" | "POST";
      url: string;
      body?: string | Uint8Array;
      headers?: Record<string, string>;
    }
  | { type: "RESIZE"; width: number; height: number };

export type ColorScheme = 'warm' | 'cool';

/** Controle do heatmap: Auto = detecção pela imagem; warm = laranja; cool = azul */
export type HeatmapColorMode = 'auto' | 'warm' | 'cool';
