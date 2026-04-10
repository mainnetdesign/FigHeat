/**
 * FigHeat - Computer Vision Heatmap Analysis for Figma
 * 
 * Based on CV Heatmap Explorer (MIT License)
 * Enhanced and transformed by Mainnet Design (2026)
 * 
 * @author Mainnet Design
 * @website https://mainnet.design
 * @license MIT
 */

// src/ui.tsx
import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "./tailwind.css";
import "./ui.css";
import type {
  HeatmapPoint,
  BoundingBox,
  AnalysisInsights,
  Variant,
  CodeToUi,
  UiToCode,
  ResultState,
  HeatmapColorMode,
} from "./types";
import { drawHeat, drawBoxesOverlay } from "./lib/heatmap";
import {
  loadImage,
  optimizeImage,
  fitWithin,
  canvasToPngBytes,
  composeExportSnapshotCanvas,
  EXPORT_SNAPSHOT_MAX_W,
  EXPORT_SNAPSHOT_MAX_H,
} from "./lib/imageUtils";
import { VotingPanel } from "./components/VotingPanel";
import mainnetLogo from "./assets/Logo_Mainnet.png";
import vectorLogo from "./assets/Vector.png";
import { InsightsPanel } from "./components/InsightsPanel";
import {
  Dropdown,
  ModelCard,
  UploadArea,
  PrimaryButton,
  Footer,
  VerticalRuler,
  LightningIcon,
  BrainIcon,
} from "./components/ui";

// Polyfill global: define AbortController no escopo global para o iframe do plugin Figma
(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : ({} as any));
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

// Map de requisições pendentes em escopo de módulo (nunca undefined no iframe do Figma)
type FetchProxyResult = { ok: boolean; status?: number; json?: unknown; blobBase64?: string; error?: string };
const pendingFetchMap = new Map<string, { resolve: (r: FetchProxyResult) => void; reject: (e: Error) => void }>();

type PluginErrorBoundaryProps = { children: React.ReactNode };
type PluginErrorBoundaryState = { errorMessage: string | null };

const MIN_PLUGIN_W = 400;
const MIN_PLUGIN_H = 400;
const MAX_PLUGIN_W = 1200;
const MAX_PLUGIN_H = 900;

function ResizeHandle() {
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = window.innerWidth;
    const startH = window.innerHeight;

    const onMove = (ev: MouseEvent) => {
      const dw = ev.clientX - startX;
      const dh = ev.clientY - startY;
      const newW = Math.round(Math.max(MIN_PLUGIN_W, Math.min(MAX_PLUGIN_W, startW + dw)));
      const newH = Math.round(Math.max(MIN_PLUGIN_H, Math.min(MAX_PLUGIN_H, startH + dh)));
      parent.postMessage({ pluginMessage: { type: "RESIZE", width: newW, height: newH } } as { pluginMessage: { type: "RESIZE"; width: number; height: number } }, "*");
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div
      className="figheat-resize-handle"
      onMouseDown={handleMouseDown}
      title="Drag to resize"
      role="button"
      aria-label="Resize window"
    />
  );
}

class PluginErrorBoundary extends React.Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = { errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): PluginErrorBoundaryState {
    const msg = error instanceof Error ? error.message : "Unknown UI error";
    return { errorMessage: msg };
  }

  componentDidCatch(error: unknown) {
    // Ajuda a diagnosticar crashes que antes viravam tela branca sem contexto.
    console.error("Plugin UI crashed:", error);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div style={{ padding: 16, fontFamily: "Inter, sans-serif" }}>
          <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 8 }}>
            Error: {this.state.errorMessage}
          </div>
          <div style={{ color: "#64748b", fontSize: 12 }}>
            A UI runtime error happened. Please share this message so we can fix it quickly.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_BASE_URL = "http://localhost:3000";

/** Maior lado da imagem enviada à API — Flash: mais leve; Pro: mais detalhe */
const OPTIMIZE_MAX_FLASH = 1024;
const OPTIMIZE_MAX_PRO = 1600;

function optimizeMaxForModel(model: "gemini-2.0-flash" | "gemini-3-pro"): number {
  return model === "gemini-3-pro" ? OPTIMIZE_MAX_PRO : OPTIMIZE_MAX_FLASH;
}

const FLASH_RECOVERY_HINT_EN =
  "If you're using Flash, try a simpler image or switch to Pro for more detail.";

/** Uma linha só no Flash para formato inesperado — evita segundo parágrafo redundante. */
const FLASH_FORMAT_SINGLE_EN =
  "Gemini returned an unexpected format. Try a simpler layout, a smaller image, or switch to Pro if the problem persists.";

function formatApiConnectionError(url: string, err: unknown): string {
  const base = `Could not connect to API at ${url}. Check that the server is running and the URL is correct.`;
  const raw = err instanceof Error ? err.message : String(err);
  if (!raw || raw === "Failed to fetch" || raw === "Aborted") return base;
  return `${base}\n\nDetails: ${raw}`;
}

/** Ajusta texto de erro para o utilizador (Flash: timeout com dica extra; formato: mensagem única). */
function formatAnalysisErrorForDisplay(
  message: string,
  model: "gemini-2.0-flash" | "gemini-3-pro"
): string {
  if (model !== "gemini-2.0-flash") return message;

  const isFormat =
    /unexpected format/i.test(message) ||
    /could not parse/i.test(message) ||
    /No object generated/i.test(message);
  if (isFormat) {
    return FLASH_FORMAT_SINGLE_EN;
  }

  if (message.includes(FLASH_RECOVERY_HINT_EN)) return message;
  const isTimeout =
    /\btimeout\b/i.test(message) ||
    message.includes("took more than") ||
    message.includes("⏱️");
  if (!isTimeout) return message;
  return `${message}\n\n${FLASH_RECOVERY_HINT_EN}`;
}

function App() {
  const [baseUrl, setBaseUrl] = React.useState(DEFAULT_BASE_URL);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [status, setStatus] = React.useState("Ready");
  const [error, setError] = React.useState<string | null>(null);

  const [abMode, setAbMode] = React.useState(false);
  const [heatmapIntensity] = React.useState(100); // Fixo em 100% (intensidade total)
  const [heatmapColorMode] = React.useState<HeatmapColorMode>('warm');
  
  // Seletor de modelo
  const [selectedModel, setSelectedModel] = React.useState<'gemini-2.0-flash' | 'gemini-3-pro'>('gemini-2.0-flash');
  
  // Training Mode (Votação)
  const [trainingMode, setTrainingMode] = React.useState(false);
  const [progressSectionOpen, setProgressSectionOpen] = React.useState(true);
  const [quickMode, setQuickMode] = React.useState(true); // Modo rápido ativado por padrão
  const [pageType, setPageType] = React.useState<string>('landing');
  const [analysisController, setAnalysisController] = React.useState<AbortController | null>(null);
  // Loading com logo: true enquanto qualquer análise estiver rodando (votação, A/B ou Analyze simples)
  const [analysisInProgress, setAnalysisInProgress] = React.useState(false);
  const [votingResults, setVotingResults] = React.useState<{
    voteId: string;
    optionA: { heatmapPoints: HeatmapPoint[]; boundingBoxes: BoundingBox[]; insights?: AnalysisInsights };
    optionB: { heatmapPoints: HeatmapPoint[]; boundingBoxes: BoundingBox[]; insights?: AnalysisInsights };
    timestamp: number;
  } | null>(null);
  
  // Estado para exibir insights da opção selecionada (lógica interna / useEffects)
  const [selectedInsights, setSelectedInsights] = React.useState<AnalysisInsights | null>(null);
  // Única fonte de verdade para "mostrar painel Smart Analysis" — só setado ao votar, limpo em New image / Fechar
  const [insightsToShow, setInsightsToShow] = React.useState<AnalysisInsights | null>(null);
  
  // Estado para hover bidirecional
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  // Collapsible para não ocupar espaço demais no "Analysis Summary"
  const [topElementsExpanded, setTopElementsExpanded] = React.useState(false);

  // Estatísticas de votos (Training) — GET /api/save-vote
  type VoteStats = {
    totalVotes: number;
    optionAWins: number;
    optionBWins: number;
    percentageA: string;
    percentageB: string;
    readyForTraining: boolean;
    message: string;
  };
  const [voteStats, setVoteStats] = React.useState<VoteStats | null>(null);

  // Proxy de fetch via main thread (evita "Failed to fetch" no iframe / mixed content)
  const fetchViaPlugin = React.useCallback(
    (method: "GET" | "POST", url: string, body?: string | Uint8Array, headers?: Record<string, string>): Promise<FetchProxyResult> =>
      new Promise((resolve, reject) => {
        const id = `fetch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        pendingFetchMap.set(id, { resolve, reject });
        parent.postMessage(
          { pluginMessage: { type: "FETCH_PROXY", id, method, url, body, headers } },
          "*"
        );
      }),
    []
  );

  const fetchVoteStats = React.useCallback(async () => {
    const url = (baseUrl || "").trim().replace(/\/$/, "");
    if (!url) return;
    try {
      const res = await fetchViaPlugin("GET", `${url}/api/save-vote`);
      if (!res.ok || !res.json) return;
      const data = res.json as Record<string, unknown>;
      setVoteStats({
        totalVotes: (data.totalVotes as number) ?? 0,
        optionAWins: (data.optionAWins as number) ?? 0,
        optionBWins: (data.optionBWins as number) ?? 0,
        percentageA: (data.percentageA as string) ?? "0",
        percentageB: (data.percentageB as string) ?? "0",
        readyForTraining: !!(data.readyForTraining as boolean),
        message: (data.message as string) ?? "",
      });
    } catch {
      setVoteStats(null);
    }
  }, [baseUrl, fetchViaPlugin]);

  const downloadTrainingDataset = React.useCallback(async () => {
    const url = (baseUrl || "").trim().replace(/\/$/, "");
    if (!url) {
      setStatus("Set API Base URL first");
      return;
    }
    try {
      setStatus("Preparing dataset...");
      const res = await fetchViaPlugin("GET", `${url}/api/training/export`);
      if (!res.blobBase64) {
        setStatus("Export failed: no data");
        return;
      }
      const binary = Uint8Array.from(atob(res.blobBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([binary], { type: "application/x-ndjson" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "figheat-training.jsonl";
      a.click();
      URL.revokeObjectURL(href);
      setStatus("Dataset downloaded: figheat-training.jsonl");
    } catch (e: unknown) {
      setStatus("Download failed");
      const msg = e instanceof Error ? e.message : "Export failed";
      const isFetchError = msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError");
      setError(isFetchError ? formatApiConnectionError(url, e) : msg);
    }
  }, [baseUrl, fetchViaPlugin]);

  const testConnection = React.useCallback(async () => {
    const url = (baseUrl || "").trim().replace(/\/$/, "");
    if (!url) {
      setError("Please fill in the API Base URL.");
      return;
    }
    setError(null);
    setStatus("Testing connection...");
    try {
      const res = await fetchViaPlugin("GET", `${url}/api/save-vote`);
      if (res.ok) {
        setStatus("✅ Connected! API OK.");
        setError(null);
        fetchVoteStats();
      } else {
        setError((res.error as string) || `API returned ${res.status ?? ""}`);
        setStatus("Error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      const isFetchError = msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError");
      setError(
        isFetchError
          ? `${formatApiConnectionError(url, e)}\n\nTip: If you edited manifest.json (network domains), close and reopen the plugin.`
          : msg
      );
      setStatus("Error");
    }
  }, [baseUrl, fetchViaPlugin, fetchVoteStats]);

  // Load stored API Base URL on mount
  React.useEffect(() => {
    parent.postMessage({ pluginMessage: { type: "GET_BASE_URL" } }, "*");
  }, []);

  // Buscar votos ao montar quando há API (todos os modos: Analyze, A/B e Training)
  React.useEffect(() => {
    if (baseUrl?.trim()) fetchVoteStats();
  }, [baseUrl, fetchVoteStats]);

  // Key para forçar remount da área de análise ao clicar em "New image" (evita análise antiga persistir)
  const [resetKey, setResetKey] = React.useState(0);

  const [A, setA] = React.useState<ResultState>({
    bytes: null,
    imageBase64: null,
    points: [],
    boxes: [],
    w: 0,
    h: 0,
  });

  const [B, setB] = React.useState<ResultState>({
    bytes: null,
    imageBase64: null,
    points: [],
    boxes: [],
    w: 0,
    h: 0,
  });

  const imgARef = React.useRef<HTMLImageElement | null>(null);
  const canvasARef = React.useRef<HTMLCanvasElement | null>(null);

  const imgBRef = React.useRef<HTMLImageElement | null>(null);
  const canvasBRef = React.useRef<HTMLCanvasElement | null>(null);

  // Refs para votação
  const canvasVoteARef = React.useRef<HTMLCanvasElement | null>(null);
  const canvasVoteBRef = React.useRef<HTMLCanvasElement | null>(null);

  // Refs para inputs de arquivo (limpar valor no reset para permitir novo upload)
  const fileInputARef = React.useRef<HTMLInputElement | null>(null);
  const fileInputBRef = React.useRef<HTMLInputElement | null>(null);
  const singleImageInputARef = React.useRef<HTMLInputElement | null>(null);

  // Refs para loading Analyze/A/B: timer em inglês e não sobrescrever com STATUS do main thread
  const analysisInProgressRef = React.useRef(false);
  const analyzeProgressIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzeStartTimeRef = React.useRef(0);
  const analyzeAbModeRef = React.useRef(false);
  const statusContainerRef = React.useRef<HTMLDivElement | null>(null);
  const analyzeWithVotingIgnoreResultRef = React.useRef(false);
  const analyzeWithVotingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeWithVotingProgressIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzeOneInUITimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeOneInUIIgnoreResultRef = React.useRef(false);
  const lastAutoExportSignatureRef = React.useRef<string | null>(null);

  const headerBarRef = React.useRef<HTMLDivElement | null>(null);
  const footerWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [rulerBandHeights, setRulerBandHeights] = React.useState({ top: 92, bottom: 130 });

  const measureRulerBands = React.useCallback(() => {
    const t = headerBarRef.current?.offsetHeight;
    const b = footerWrapRef.current?.offsetHeight;
    setRulerBandHeights({
      top: typeof t === "number" && t > 0 ? Math.round(t) : 92,
      bottom: typeof b === "number" && b > 0 ? Math.round(b) : 130,
    });
  }, []);

  React.useLayoutEffect(() => {
    measureRulerBands();
    const ro = new ResizeObserver(() => measureRulerBands());
    const hEl = headerBarRef.current;
    const fEl = footerWrapRef.current;
    if (hEl) ro.observe(hEl);
    if (fEl) ro.observe(fEl);
    window.addEventListener("resize", measureRulerBands);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureRulerBands);
    };
  }, [measureRulerBands, settingsOpen]);

  React.useEffect(() => {
    analysisInProgressRef.current = analysisInProgress;
  }, [analysisInProgress]);

  function clearAnalyzeProgressInterval() {
    if (analyzeProgressIntervalRef.current) {
      clearInterval(analyzeProgressIntervalRef.current);
      analyzeProgressIntervalRef.current = null;
    }
  }

  React.useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as CodeToUi;
      if (!msg) return;

      if (msg.type === "FETCH_PROXY_RESULT") {
        const pending = pendingFetchMap.get(msg.id);
        if (pending) {
          pendingFetchMap.delete(msg.id);
          if (msg.ok) pending.resolve({ ok: true, status: msg.status, json: msg.json, blobBase64: msg.blobBase64 });
          else pending.reject(new Error(msg.error || `Request failed (${msg.status ?? ""})`));
        }
        return;
      }

      if (msg.type === "BASE_URL_LOADED") {
        setBaseUrl(msg.baseUrl || DEFAULT_BASE_URL);
        return;
      }

      if (msg.type === "STATUS") {
        if (analysisInProgressRef.current) return;
        setStatus(msg.message);
        setError(null);
        return;
      }

      if (msg.type === "ERROR") {
        clearAnalyzeProgressInterval();
        analysisInProgressRef.current = false;
        setAnalysisInProgress(false);
        setError(msg.message);
        setStatus("Error");
        return;
      }

      if (msg.type === "CANCELLED") {
        clearAnalyzeProgressInterval();
        analysisInProgressRef.current = false;
        setAnalysisInProgress(false);
        setError(null);
        setStatus("Cancelled");
        return;
      }

      if (msg.type === "DONE") {
        if (msg.variant === "B" || !abMode) {
          clearAnalyzeProgressInterval();
          analysisInProgressRef.current = false;
          setAnalysisInProgress(false);
        }
        setError(null);
        setStatus(`Done (${msg.variant})`);
        const payload = {
          imageBase64: msg.result.imageBase64,
          points: msg.result.heatmapPoints,
          boxes: msg.result.boundingBoxes,
          w: msg.result.imageWidth || 0,
          h: msg.result.imageHeight || 0,
        };

        if (msg.variant === "A") setA(prev => ({ ...prev, ...payload }));
        else setB(prev => ({ ...prev, ...payload }));
      }
    };
  }, [abMode]);

  React.useEffect(() => {
    drawOverlay("A");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [A.imageBase64, A.points, A.boxes, heatmapIntensity, heatmapColorMode]);

  React.useEffect(() => {
    drawOverlay("B");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [B.imageBase64, B.points, B.boxes, heatmapIntensity, heatmapColorMode]);

  // Auto-export para Figma: quando a análise terminar (single-image),
  // gera um PNG com heatmap/boxes e envia via pluginMessage.
  React.useEffect(() => {
    if (abMode) return; // só quando não for A/B
    if (analysisInProgress) return;
    if (error) return;
    if (!A.imageBase64) return;
    if (A.points.length === 0 && A.boxes.length === 0) return;

    const signature = `${resetKey}|${A.imageBase64.substring(0, 40)}|${A.points.length}|${A.boxes.length}|${heatmapColorMode}`;
    if (lastAutoExportSignatureRef.current === signature) return;
    lastAutoExportSignatureRef.current = signature;

    const t = window.setTimeout(() => {
      if (abMode) return;
      if (analysisInProgress) return;
      if (error) return;
      void exportSnapshotPng();
    }, 250);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abMode, analysisInProgress, error, A.imageBase64, A.points.length, A.boxes.length, heatmapColorMode, resetKey]);

  // Força atualização do canvas quando votingResults muda (após votar)
  React.useEffect(() => {
    if (!votingResults && A.imageBase64) {
      console.log('votingResults changed to null, forcing canvas update', {
        hasImage: !!A.imageBase64,
        pointsCount: A.points.length,
        boxesCount: A.boxes.length
      });
      // Pequeno delay para garantir que o DOM foi atualizado
      setTimeout(() => {
        drawOverlay("A");
      }, 100);
      // Força novamente após mais tempo para garantir
      setTimeout(() => {
        drawOverlay("A");
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votingResults]);
  
  // Força atualização do canvas quando pontos mudam após votar
  React.useEffect(() => {
    if (!votingResults && !selectedInsights && trainingMode && A.imageBase64 && A.points.length > 0) {
      setTimeout(() => drawOverlay("A"), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [A.points, votingResults, selectedInsights, trainingMode]);

  // Força redraw quando insights são exibidos (garante boxes na foto analisada)
  React.useEffect(() => {
    if (selectedInsights && A.imageBase64 && (A.points.length > 0 || A.boxes.length > 0)) {
      const t1 = setTimeout(() => drawOverlay("A"), 100);
      const t2 = setTimeout(() => drawOverlay("A"), 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInsights, A.imageBase64, A.points.length, A.boxes.length]);

  function drawOverlay(variant: Variant) {
    const img = variant === "A" ? imgARef.current : imgBRef.current;
    const canvas = variant === "A" ? canvasARef.current : canvasBRef.current;
    const state = variant === "A" ? A : B;

    if (!img || !canvas) {
      console.log(`drawOverlay(${variant}): Missing img or canvas`, { 
        hasImg: !!img, 
        hasCanvas: !!canvas 
      });
      return;
    }
    if (!state.imageBase64) {
      console.log(`drawOverlay(${variant}): Missing imageBase64`);
      return;
    }
    
    console.log(`drawOverlay(${variant}): Drawing`, {
      pointsCount: state.points.length,
      boxesCount: state.boxes.length,
      hasImage: !!state.imageBase64
    });

    // O canvas é absolute/inset:0 dentro de `.preview`.
    // Para evitar qualquer diferença de cálculo do `object-fit` (contain/letterbox/auto),
    // vamos medir o retângulo REAL onde a imagem está renderizada.
    const canvasRect = canvas.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const containerW = Math.max(1, canvasRect.width);
    const containerH = Math.max(1, canvasRect.height);

    const dispW = Math.max(1, imgRect.width);
    const dispH = Math.max(1, imgRect.height);
    const offsetX = imgRect.left - canvasRect.left;
    const offsetY = imgRect.top - canvasRect.top;

    const imgNaturalW = img.naturalWidth || 0;
    const imgNaturalH = img.naturalHeight || 0;

    if (containerW <= 0 || containerH <= 0 || dispW <= 0 || dispH <= 0 || imgNaturalW <= 0 || imgNaturalH <= 0) {
      console.warn(`drawOverlay(${variant}): Invalid dimensions`, {
        containerW,
        containerH,
        dispW,
        dispH,
        offsetX,
        offsetY,
        imgNaturalW,
        imgNaturalH,
      });
      return;
    }

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(containerW * dpr));
    canvas.height = Math.max(1, Math.round(containerH * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Desenha em coordenadas CSS px (1 unidade = 1px CSS) para casar com getBoundingClientRect().
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, containerW, containerH);

    const scheme = heatmapColorMode;
    const globalIntensity = heatmapIntensity / 100;

    // Desenha heatmap/boxes apenas na área efetivamente ocupada pela imagem
    // (contain), respeitando offsetX/offsetY.
    ctx.save();
    ctx.translate(offsetX, offsetY);
    drawHeat(ctx, state.points, dispW, dispH, scheme, globalIntensity, imgNaturalW, imgNaturalH);
    drawBoxesOverlay(ctx, state.boxes, dispW, dispH, imgNaturalW, imgNaturalH);
    ctx.restore();
  }

  type CapturedImage = { bytes: Uint8Array; base64: string; width: number; height: number };

  function captureSelection(variant: Variant): Promise<CapturedImage> {
    return new Promise((resolve, reject) => {
      setError(null);
      const captureMsg: UiToCode = { type: "CAPTURE_SELECTION", variant };

      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("Timeout ao capturar seleção do Figma."));
      }, 8000);

      function handler(event: MessageEvent) {
        const m = event.data.pluginMessage as CodeToUi;
        if (!m) return;
        if (m.type === "SELECTION_CAPTURED" && m.variant === variant) {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          // Atualiza o estado React também (para exibição da preview)
          const payload = { bytes: m.bytes, imageBase64: m.base64, points: [] as HeatmapPoint[], boxes: [] as BoundingBox[], w: m.width, h: m.height };
          if (variant === "A") setA(prev => ({ ...prev, ...payload }));
          else setB(prev => ({ ...prev, ...payload }));
          resolve({ bytes: m.bytes, base64: m.base64, width: m.width, height: m.height });
        } else if (m.type === "ERROR") {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          reject(new Error(m.message));
        }
      }

      window.addEventListener("message", handler);
      parent.postMessage({ pluginMessage: captureMsg }, "*");
    });
  }

  async function pickFile(variant: Variant, file: File | null) {
    if (!file) return;

    try {
      // Trocou imagem: limpa resultados e insights atuais
      // (evita o usuário trocar a foto e ficar com UI/overlays de análise anterior).
      if (analysisController || analysisInProgressRef.current) {
        cancelAnalysis();
      }
      setVotingResults(null);
      setSelectedInsights(null);
      setInsightsToShow(null);
      setTopElementsExpanded(false);
      setError(null);

      // 🚀 OTIMIZAÇÃO: Usa imagem otimizada no Quick Mode (todos os modos: Analyze, A/B e Training)
      if (quickMode) {
        setStatus(`Optimizing image ${variant}...`);
        const optimized = await optimizeImage(file, optimizeMaxForModel(selectedModel), 0.85);
        
        const next: Partial<ResultState> = {
          bytes: optimized.bytes,
          imageBase64: optimized.base64,
          points: [],
          boxes: [],
          w: optimized.width,
          h: optimized.height,
        };

        if (variant === "A") setA(prev => ({ ...prev, ...next }));
        else setB(prev => ({ ...prev, ...next }));

        setStatus(`✅ Image ${variant} optimized (${optimized.width}x${optimized.height})`);
        setError(null);
        return;
      }

      // Modo normal: se imagem for grande, otimiza para caber no timeout de 60s
      const localBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });

      const img = await loadImage(localBase64);
      const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
      const cap = optimizeMaxForModel(selectedModel);
      const isLarge = maxDim > Math.max(1500, cap) || file.size > 1024 * 1024;

      if (isLarge) {
        setStatus(`Optimizing large image ${variant}...`);
        const optimized = await optimizeImage(file, cap, 0.85);
        const next: Partial<ResultState> = {
          bytes: optimized.bytes,
          imageBase64: optimized.base64,
          points: [],
          boxes: [],
          w: optimized.width,
          h: optimized.height,
        };
        if (variant === "A") setA(prev => ({ ...prev, ...next }));
        else setB(prev => ({ ...prev, ...next }));
        setStatus(`✅ Image ${variant} optimized (${optimized.width}x${optimized.height})`);
      } else {
        const buf = await file.arrayBuffer();
        const u8 = new Uint8Array(buf);
        const next: Partial<ResultState> = {
          bytes: u8,
          imageBase64: localBase64,
          points: [],
          boxes: [],
          w: img.naturalWidth || 0,
          h: img.naturalHeight || 0,
        };
        if (variant === "A") setA(prev => ({ ...prev, ...next }));
        else setB(prev => ({ ...prev, ...next }));
        setStatus(`Image ${variant} loaded`);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to process image");
      setStatus("Error");
    }
  }

  function analyzeOne(variant: Variant) {
    const state = variant === "A" ? A : B;

    if (!state.bytes) {
      setError(`Upload image ${variant} first.`);
      setStatus("Error");
      return;
    }

    const msg: UiToCode = {
      type: "ANALYZE_IMAGE",
      variant,
      baseUrl,
      bytes: state.bytes,
      imageWidth: state.w || 0,
      imageHeight: state.h || 0,
    };

    parent.postMessage({ pluginMessage: msg }, "*");
  }

  // Faz o fetch na UI (iframe) para localhost funcionar; o sandbox do Figma às vezes não alcança localhost
  async function analyzeOneInUI(variant: Variant, overrideBytes?: Uint8Array): Promise<void> {
    const state = variant === "A" ? A : B;
    const bytes = overrideBytes ?? state.bytes ?? null;
    const url = (baseUrl || "").trim().replace(/\/$/, "");
    if (!url || !bytes?.length) {
      setError(variant === "A" ? "Upload an image first." : "Upload both images A and B first.");
      setStatus("Error");
      return;
    }
    const endpoint = url.includes("/api/") ? url.replace(/\/api\/.*$/, "/api/cv/analyze") : `${url}/api/cv/analyze`;
    setError(null);
    setStatus(`Sending for analysis (${variant})...`);
    analyzeOneInUIIgnoreResultRef.current = false;
    const maxMs = selectedModel === "gemini-3-pro" ? 120000 : 60000; // Flash 60s, Pro 120s
    const maxSec = maxMs / 1000;
    if (analyzeOneInUITimeoutRef.current) clearTimeout(analyzeOneInUITimeoutRef.current);
    analyzeOneInUITimeoutRef.current = setTimeout(() => {
      analyzeOneInUITimeoutRef.current = null;
      analyzeOneInUIIgnoreResultRef.current = true;
      clearAnalyzeProgressInterval();
      analysisInProgressRef.current = false;
      setAnalysisInProgress(false);
      setError(`⏱️ Timeout: analysis took more than ${maxSec}s (${selectedModel === "gemini-3-pro" ? "Pro" : "Flash"}). Try a smaller image or check the API.`);
      setStatus("Timeout");
    }, maxMs);
    try {
      const res = await fetchViaPlugin("POST", endpoint, bytes ?? undefined, {
        "Content-Type": "application/octet-stream",
        "X-Model": selectedModel,
      });
      if (analyzeOneInUIIgnoreResultRef.current) return;
      if (analyzeOneInUITimeoutRef.current) {
        clearTimeout(analyzeOneInUITimeoutRef.current);
        analyzeOneInUITimeoutRef.current = null;
      }
      const data = (res.json ?? {}) as { heatmapPoints?: HeatmapPoint[]; boundingBoxes?: BoundingBox[] };
      const heatmapPoints = Array.isArray(data.heatmapPoints) ? data.heatmapPoints : [];
      const boundingBoxes = Array.isArray(data.boundingBoxes) ? data.boundingBoxes : [];
      if (variant === "B" || !abMode) {
        clearAnalyzeProgressInterval();
        analysisInProgressRef.current = false;
        setAnalysisInProgress(false);
      }
      setError(null);
      setStatus(`Done (${variant})`);
      const payload = {
        imageBase64: state.imageBase64 || "",
        points: heatmapPoints,
        boxes: boundingBoxes,
        w: state.w || 0,
        h: state.h || 0,
      };
      if (variant === "A") setA((prev) => ({ ...prev, ...payload }));
      else setB((prev) => ({ ...prev, ...payload }));
    } catch (err: any) {
      if (analyzeOneInUITimeoutRef.current) {
        clearTimeout(analyzeOneInUITimeoutRef.current);
        analyzeOneInUITimeoutRef.current = null;
      }
      if (analyzeOneInUIIgnoreResultRef.current) return;
      clearAnalyzeProgressInterval();
      analysisInProgressRef.current = false;
      setAnalysisInProgress(false);
      if (err?.name === "AbortError" || err?.message === "Aborted") {
        setError(null);
        setStatus("Cancelled");
        return;
      }
      const message =
        err?.message?.includes("fetch") || err?.message?.includes("Failed to fetch")
          ? formatApiConnectionError(url, err)
          : err?.message || "Analysis failed.";
      setError(message);
      setStatus("Error");
    }
  }

  function startAnalyzeProgressTimer(isAb: boolean) {
    clearAnalyzeProgressInterval();
    analysisInProgressRef.current = true;
    analyzeStartTimeRef.current = Date.now();
    analyzeAbModeRef.current = isAb;
    const prefix = isAb ? "Analyzing A and B..." : "Analyzing...";
    // Flash: 15–60s | Pro: 60–120s. Exibe máximo esperado por modelo no modo single-image.
    const maxS = isAb ? 120 : (selectedModel === "gemini-3-pro" ? 120 : 60);
    setStatus(`${prefix} 0s (max ${maxS}s)`);
    analyzeProgressIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - analyzeStartTimeRef.current) / 1000);
      setStatus(`${prefix} ${elapsed}s (max ${maxS}s)`);
    }, 1000);
  }

  async function analyze() {
    if (!baseUrl?.trim()) {
      setError("Please fill in the API Base URL.");
      setStatus("Error");
      return;
    }

    if (abMode) {
      let bytesA = A.bytes;
      let bytesB = B.bytes;

      if (!bytesA) {
        try {
          setStatus("📸 Capturando seleção para A...");
          const captured = await captureSelection("A");
          bytesA = captured.bytes;
        } catch (err: any) {
          setError(err.message || "Selecione algo no Figma ou faça upload de A.");
          setStatus("Error");
          return;
        }
      }

      if (!bytesB) {
        try {
          setStatus("📸 Capturando seleção para B...");
          const captured = await captureSelection("B");
          bytesB = captured.bytes;
        } catch (err: any) {
          setError(err.message || "Selecione algo no Figma ou faça upload de B.");
          setStatus("Error");
          return;
        }
      }

      setA((prev) => ({ ...prev, points: [], boxes: [] }));
      setB((prev) => ({ ...prev, points: [], boxes: [] }));
      setError(null);
      flushSync(() => {
        setAnalysisInProgress(true);
        setStatus("Analyzing A and B... 0s (max 120s)");
      });
      startAnalyzeProgressTimer(true);
      void analyzeOneInUI("A", bytesA).then(() => analyzeOneInUI("B", bytesB!));
      return;
    }

    // Modo single: captura se não tiver imagem
    let bytesA = A.bytes;
    if (!bytesA) {
      try {
        setStatus("📸 Capturando seleção do Figma...");
        const captured = await captureSelection("A");
        bytesA = captured.bytes;
      } catch (err: any) {
        setError(err.message || "Selecione algo no Figma ou faça upload de uma imagem.");
        setStatus("Error");
        return;
      }
    }

    setA((prev) => ({ ...prev, points: [], boxes: [] }));
    setError(null);
    const maxSingle = selectedModel === "gemini-3-pro" ? 120 : 60;
    flushSync(() => {
      setAnalysisInProgress(true);
      setStatus(`Analyzing... 0s (max ${maxSingle}s)`);
    });
    startAnalyzeProgressTimer(false);
    void analyzeOneInUI("A", bytesA);
  }

  async function analyzeWithVoting() {
    if (!baseUrl) {
      setError("Please fill in the API Base URL.");
      setStatus("Error");
      return;
    }

    // Captura automaticamente se não tiver imagem
    let bytesForVoting = A.bytes;
    if (!bytesForVoting) {
      try {
        setStatus("📸 Capturando seleção do Figma...");
        const captured = await captureSelection("A");
        bytesForVoting = captured.bytes;
      } catch (err: any) {
        setError(err.message || "Selecione algo no Figma ou faça upload de uma imagem.");
        setStatus("Error");
        return;
      }
    }

    setError(null);
    setVotingResults(null);
    setSelectedInsights(null); // esconde Smart Analysis da análise anterior ao iniciar nova
    setAnalysisInProgress(true);

    // 📊 Indicador de progresso melhorado
    const startTime = Date.now();
    
    // Mostra tamanho da imagem no modo Quick
    const sizeKB = A.bytes ? Math.round(A.bytes.length / 1024) : 0;
    const modeText = quickMode ? "⚡ Quick" : "🔥 Full";
    
    // 🔥 NOVO: Timeout dinâmico baseado no modelo
    const timeoutMs = selectedModel === 'gemini-3-pro' ? 120000 : 60000; // 2min para 3 Pro, 1min para Flash
    const timeoutSeconds = timeoutMs / 1000;
    const modelEmoji = selectedModel === 'gemini-3-pro' ? '🧠' : '⚡';
    
    setStatus(`${modeText} ${modelEmoji} | Enviando imagem (${sizeKB}KB)...`);

    analyzeWithVotingIgnoreResultRef.current = false;
    const controller = new AbortController();
    setAnalysisController(controller);

    if (analyzeWithVotingTimeoutRef.current) clearTimeout(analyzeWithVotingTimeoutRef.current);
    if (analyzeWithVotingProgressIntervalRef.current) clearInterval(analyzeWithVotingProgressIntervalRef.current);

    analyzeWithVotingTimeoutRef.current = setTimeout(() => {
      analyzeWithVotingTimeoutRef.current = null;
      analyzeWithVotingIgnoreResultRef.current = true;
      setError(`⏱️ Timeout: Analysis took more than ${timeoutSeconds}s. ${selectedModel === 'gemini-3-pro' ? 'Gemini 3 Pro is slower.' : 'Try a smaller image or disable Quick Mode.'}`);
      setStatus("Timeout");
      setAnalysisController(null);
      setAnalysisInProgress(false);
      parent.postMessage({ pluginMessage: { type: "CANCEL_ANALYSIS" } }, "*");
    }, timeoutMs);

    const url = baseUrl.includes('/api/') 
      ? baseUrl.replace(/\/api\/.*$/, '/api/cv/analyze-variations')
      : `${baseUrl}/api/cv/analyze-variations`;

    let lastElapsed = -1;
    analyzeWithVotingProgressIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed !== lastElapsed) {
        lastElapsed = elapsed;
        setStatus(`${modeText} ${modelEmoji} | Analyzing... ${elapsed}s (max ${timeoutSeconds}s)`);
      }
    }, 1000);

    try {
      const response = await fetchViaPlugin("POST", url, bytesForVoting ?? undefined, {
        "Content-Type": "application/octet-stream",
        "X-Model": selectedModel,
      });
      if (analyzeWithVotingProgressIntervalRef.current) {
        clearInterval(analyzeWithVotingProgressIntervalRef.current);
        analyzeWithVotingProgressIntervalRef.current = null;
      }
      if (analyzeWithVotingTimeoutRef.current) {
        clearTimeout(analyzeWithVotingTimeoutRef.current);
        analyzeWithVotingTimeoutRef.current = null;
      }
      setAnalysisController(null);

      if (analyzeWithVotingIgnoreResultRef.current) return;

      if (!response.ok) {
        let message = (response.error as string) || "";
        if (response.status === 500 && (message.includes("JSON") || message.toLowerCase().includes("too large")))
          message = "Gemini generated too large response. Try again.";
        throw new Error(message || `Analysis failed (${response.status ?? ""})`);
      }

      setStatus(`${modeText} | Processando resultados...`);
      const result = (response.json ?? {}) as {
        optionA?: { heatmapPoints?: HeatmapPoint[]; boundingBoxes?: BoundingBox[] };
        optionB?: { heatmapPoints?: HeatmapPoint[]; boundingBoxes?: BoundingBox[] };
        voteId?: string;
        timestamp?: number;
      };
      const totalTime = Math.round((Date.now() - startTime) / 1000);

      setA(prev => ({
        ...prev,
        points: result.optionA?.heatmapPoints || [],
        boxes: result.optionA?.boundingBoxes || [],
      }));
      setVotingResults(result as Parameters<typeof setVotingResults>[0]);
      setAnalysisInProgress(false);
      setStatus(`✅ Ready in ${totalTime}s! Vote for the best option.`);
    } catch (err: any) {
      if (analyzeWithVotingProgressIntervalRef.current) {
        clearInterval(analyzeWithVotingProgressIntervalRef.current);
        analyzeWithVotingProgressIntervalRef.current = null;
      }
      if (analyzeWithVotingTimeoutRef.current) {
        clearTimeout(analyzeWithVotingTimeoutRef.current);
        analyzeWithVotingTimeoutRef.current = null;
      }
      setAnalysisController(null);
      setAnalysisInProgress(false);
      if (analyzeWithVotingIgnoreResultRef.current) return;
      if (err.name === "AbortError" || err?.message === "Aborted") {
        setError(null);
        setStatus("Cancelled");
      } else {
        const urlTrim = (baseUrl || "").trim().replace(/\/$/, "");
        const msg = err?.message ?? "";
        const isFetchError = msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError");
        setError(
          isFetchError ? formatApiConnectionError(urlTrim, err) : msg || "Failed to generate variations"
        );
        setStatus("Error");
        setSelectedInsights(null);
      }
    }
  }

  function cancelAnalysis() {
    analyzeWithVotingIgnoreResultRef.current = true;
    analyzeOneInUIIgnoreResultRef.current = true;

    if (analyzeOneInUITimeoutRef.current) {
      clearTimeout(analyzeOneInUITimeoutRef.current);
      analyzeOneInUITimeoutRef.current = null;
    }
    if (analyzeWithVotingTimeoutRef.current) {
      clearTimeout(analyzeWithVotingTimeoutRef.current);
      analyzeWithVotingTimeoutRef.current = null;
    }
    if (analyzeWithVotingProgressIntervalRef.current) {
      clearInterval(analyzeWithVotingProgressIntervalRef.current);
      analyzeWithVotingProgressIntervalRef.current = null;
    }

    clearAnalyzeProgressInterval();

    const pendingList = [...pendingFetchMap.values()];
    pendingFetchMap.clear();
    for (const pending of pendingList) {
      try {
        pending.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      } catch {
        /* ignore */
      }
    }

    parent.postMessage({ pluginMessage: { type: "CANCEL_ANALYSIS" } }, "*");

    setAnalysisController(null);
    analysisInProgressRef.current = false;
    setAnalysisInProgress(false);
    setError(null);
    setStatus("Cancelled");
  }

  async function submitVote(chosenOption: 'A' | 'B') {
    if (!votingResults) return;

    // IMPORTANTE: Salva referências ANTES de atualizar estado
    // Isso garante que sempre tenhamos acesso aos dados mesmo após setVotingResults(null)
    const currentVotingResults = votingResults;
    const winner = chosenOption === 'A' 
      ? currentVotingResults.optionA 
      : currentVotingResults.optionB;

    console.log('Votando em:', chosenOption, {
      pointsCount: winner?.heatmapPoints?.length || 0,
      boxesCount: winner?.boundingBoxes?.length || 0,
      hasInsights: !!winner?.insights,
      hasImage: !!A.imageBase64,
      currentImageBase64: A.imageBase64 ? 'exists' : 'missing'
    });

    // Atualiza o estado A com os dados da opção escolhida IMEDIATAMENTE
    // IMPORTANTE: Usa função de atualização para garantir que não perca dados anteriores
    setA(prevA => {
      const newState = {
        ...prevA,
        points: winner?.heatmapPoints ?? [],
        boxes: winner?.boundingBoxes ?? [],
        // Garante que a imagem não seja perdida - usa prevA se existir
        imageBase64: prevA.imageBase64 || A.imageBase64,
      };
      console.log('Atualizando estado A:', {
        hadImage: !!prevA.imageBase64,
        hasImage: !!newState.imageBase64,
        pointsCount: newState.points.length,
        boxesCount: newState.boxes.length
      });
      return newState;
    });

    // Salva os insights da opção escolhida (se existirem)
    if (winner?.insights) {
      setSelectedInsights(winner.insights);
      setInsightsToShow(winner.insights); // único lugar que mostra o painel Smart Analysis
    } else {
      setSelectedInsights(null);
      setInsightsToShow(null);
    }

    // Remove o painel de votação ANTES de tentar salvar
    // Isso garante que sempre mostre o resultado, mesmo se houver erro
    setVotingResults(null);
    
    // Força atualização do canvas (heatmap + boxes) após a tela atualizar
    setTimeout(() => drawOverlay("A"), 50);
    setTimeout(() => drawOverlay("A"), 250);

    try {
      setStatus("Salvando voto...");

      // Hash simples da imagem (timestamp + tamanho)
      const imageHash = `img_${Date.now()}_${A.bytes?.length || 0}`;

      const voteData = {
        voteId: currentVotingResults.voteId,
        imageHash,
        imageDimensions: { w: A.w, h: A.h },
        optionA: currentVotingResults.optionA,
        optionB: currentVotingResults.optionB,
        chosenOption,
        userFeedback: {
          timestamp: Date.now(),
        },
      };

      const url = baseUrl.includes('/api/') 
        ? baseUrl.replace(/\/api\/.*$/, '/api/save-vote')
        : `${baseUrl}/api/save-vote`;

      const response = await fetchViaPlugin("POST", url, JSON.stringify(voteData), {
        "Content-Type": "application/json",
      });

      if (!response.ok) {
        console.error('Error saving vote:', response.status, response.error);
        setStatus(`⚠️ Vote selected (save error: ${response.status ?? ""})`);
        setError(null);
        return;
      }

      const result = (response.json ?? {}) as { voteCount?: number };
      console.log('Resposta do servidor:', result);
      
      setStatus(`✅ Vote registered! Total: ${result.voteCount}`);
      setError(null); // Limpa qualquer erro anterior
      fetchVoteStats(); // Atualiza painel de votos/progresso
      
      console.log('Estado após votar:', {
        hasImage: !!A.imageBase64,
        pointsCount: (winner?.heatmapPoints ?? []).length,
        boxesCount: (winner?.boundingBoxes ?? []).length,
        abMode,
        hasSelectedInsights: !!winner?.insights
      });
    } catch (err: any) {
      console.error("Error saving vote:", err);
      // Não mostra erro ao usuário - o estado já foi atualizado
      // Apenas avisa no status que houve problema ao salvar
      setStatus(`⚠️ Vote selected (save error)`);
      setError(null); // Não mostra erro ao usuário
    }
  }

  function resetAll() {
    // Cancela análise em andamento
    if (analysisController) {
      analysisController.abort();
      setAnalysisController(null);
    }
    // Força aplicação imediata do estado limpo (evita análise antiga persistir no iframe do Figma)
    flushSync(() => {
      setA({ bytes: null, imageBase64: null, points: [], boxes: [], w: 0, h: 0 });
      setB({ bytes: null, imageBase64: null, points: [], boxes: [], w: 0, h: 0 });
      setVotingResults(null);
      setSelectedInsights(null);
      setInsightsToShow(null); // único controle do painel Smart Analysis — limpo aqui
      setStatus("Ready");
      setError(null);
      setResetKey(k => k + 1);
    });
    // Limpa o valor dos inputs de arquivo para permitir novo upload
    if (fileInputARef.current) fileInputARef.current.value = "";
    if (fileInputBRef.current) fileInputBRef.current.value = "";
  }

  async function exportSnapshotPng() {
    try {
      setError(null);
      setStatus("Generating snapshot...");

      const makeSingle = async (variant: Variant) => {
        const state = variant === "A" ? A : B;
        if (!state.imageBase64) throw new Error(`No image ${variant}.`);

        const img = await loadImage(state.imageBase64);

        const scheme = heatmapColorMode;
        console.log(`🎨 [EXPORT ${variant}] Scheme: ${scheme === "cool" ? "❄️ COOL (blue)" : "🔥 WARM (red)"}`);

        // Resolução até 4K + supersampling 2× (ver composeExportSnapshotCanvas) para gradientes mais suaves
        return composeExportSnapshotCanvas(img, (ctx, w, h) => {
          drawHeat(
            ctx,
            state.points,
            w,
            h,
            scheme,
            heatmapIntensity / 100,
            img.naturalWidth,
            img.naturalHeight
          );
        });
      };

      let pngBytes: Uint8Array;
      let width = 0;
      let height = 0;

      if (!abMode) {
        if (!A.imageBase64) throw new Error("Load an image first.");
        const c = await makeSingle("A");
        pngBytes = await canvasToPngBytes(c);
        width = c.width;
        height = c.height;
      } else {
        if (!A.imageBase64 || !B.imageBase64) throw new Error("Load A and B first.");

        const cA = await makeSingle("A");
        const cB = await makeSingle("B");

        const gap = 24;

        const totalWRaw = cA.width + gap + cB.width;
        const totalHRaw = Math.max(cA.height, cB.height);

        const { w: totalW, h: totalH } = fitWithin(
          totalWRaw,
          totalHRaw,
          EXPORT_SNAPSHOT_MAX_W,
          EXPORT_SNAPSHOT_MAX_H
        );
        const scale = Math.min(1, totalW / totalWRaw, totalH / totalHRaw);

        const wA = Math.round(cA.width * scale);
        const hA = Math.round(cA.height * scale);
        const wB = Math.round(cB.width * scale);
        const hB = Math.round(cB.height * scale);
        const g = Math.round(gap * scale);

        const out = document.createElement("canvas");
        out.width = Math.max(1, Math.round(totalWRaw * scale));
        out.height = Math.max(1, Math.round(totalHRaw * scale), hA, hB);

        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("Failed to create canvas.");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);

        ctx.drawImage(cA, 0, 0, wA, hA);
        ctx.drawImage(cB, wA + g, 0, wB, hB);

        pngBytes = await canvasToPngBytes(out);
        width = out.width;
        height = out.height;
      }

      const msg: UiToCode = {
        type: "EXPORT_UI_SNAPSHOT",
        payload: {
          title: abMode ? "FigHeat UI Snapshot A B" : "FigHeat UI Snapshot",
          pngBytes,
          width,
          height,
        },
      };

      parent.postMessage({ pluginMessage: msg }, "*");
      setStatus("Snapshot sent to export.");
    } catch (e: any) {
      setError(e?.message || "Failed to export snapshot.");
      setStatus("Error");
    }
  }

  return (
    <div className="figheat-app">
      <div className="flex flex-row flex-1 min-h-0 w-full overflow-hidden">
        <VerticalRuler topBandPx={rulerBandHeights.top} bottomBandPx={rulerBandHeights.bottom} />
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
      <div ref={headerBarRef} className="figheat-top-bar">
        <div className="figheat-top-bar-cell figheat-top-bar-cell-left figheat-header-brand flex-[0_0_48%] min-w-[240px] max-w-[320px] border-r border-[var(--stroke)] py-5 flex items-center justify-between pr-2">
          <div className="flex items-center gap-2">
            <img src={vectorLogo} alt="" className="figheat-logo-flame figheat-logo-img" />
            <span className="figheat-header-title">FigHeat</span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-colors"
            title="Settings"
            aria-label="Open settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <div className="figheat-top-bar-cell figheat-top-bar-cell-right flex-1 min-w-0 flex items-center justify-center py-5">
            {(analysisInProgress || analysisController) ? (
              <div className="status-loading">
                <svg
                  className="mainnet-loading-svg"
                  viewBox="0 0 104 103"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M113.223 17.3373V10.3579H116.713C117.053 10.3579 117.393 10.4431 117.734 10.6133C118.081 10.7772 118.368 11.0294 118.595 11.3699C118.828 11.704 118.944 12.1201 118.944 12.6182C118.944 13.1226 118.825 13.5513 118.585 13.9044C118.345 14.2574 118.046 14.5254 117.687 14.7082C117.327 14.891 116.968 14.9825 116.609 14.9825H114.131V13.7814H116.173C116.4 13.7814 116.624 13.6837 116.845 13.4882C117.072 13.2928 117.185 13.0028 117.185 12.6182C117.185 12.2147 117.072 11.9373 116.845 11.786C116.624 11.6347 116.41 11.559 116.202 11.559H114.849V17.3373H113.223ZM117.516 14.0651L119.209 17.3373H117.422L115.795 14.0651H117.516ZM115.899 21.4984C114.853 21.4984 113.872 21.303 112.958 20.9121C112.044 20.5212 111.24 19.979 110.547 19.2855C109.853 18.5919 109.311 17.7881 108.92 16.8739C108.529 15.9597 108.334 14.9793 108.334 13.9327C108.334 12.8861 108.529 11.9058 108.92 10.9916C109.311 10.0774 109.853 9.27353 110.547 8.58001C111.24 7.88649 112.044 7.34428 112.958 6.95338C113.872 6.56249 114.853 6.36704 115.899 6.36704C116.946 6.36704 117.926 6.56249 118.84 6.95338C119.755 7.34428 120.558 7.88649 121.252 8.58001C121.945 9.27353 122.488 10.0774 122.879 10.9916C123.269 11.9058 123.465 12.8861 123.465 13.9327C123.465 14.9793 123.269 15.9597 122.879 16.8739C122.488 17.7881 121.945 18.5919 121.252 19.2855C120.558 19.979 119.755 20.5212 118.84 20.9121C117.926 21.303 116.946 21.4984 115.899 21.4984ZM115.899 19.6259C116.946 19.6259 117.898 19.3706 118.755 18.8599C119.619 18.3429 120.306 17.6557 120.817 16.7982C121.328 15.9345 121.583 14.9793 121.583 13.9327C121.583 12.8861 121.328 11.9341 120.817 11.0767C120.306 10.2129 119.619 9.52572 118.755 9.01503C117.898 8.49804 116.946 8.23955 115.899 8.23955C114.853 8.23955 113.897 8.49804 113.034 9.01503C112.17 9.52572 111.483 10.2129 110.972 11.0767C110.461 11.9341 110.206 12.8861 110.206 13.9327C110.206 14.9793 110.461 15.9345 110.972 16.7982C111.483 17.6557 112.17 18.3429 113.034 18.8599C113.897 19.3706 114.853 19.6259 115.899 19.6259Z"
                    fill="black"
                  />
                  <path
                    className="loading-bar-1"
                    d="M46.0626 10L25.6288 10L-9.55385e-06 75.6483L20.4338 75.6483L46.0626 10Z"
                    fill="black"
                  />
                  <path
                    className="loading-bar-2"
                    d="M103.942 10L83.5087 10L57.8799 75.6483L78.3137 75.6483L103.942 10Z"
                    fill="black"
                  />
                  <path
                    className="loading-bar-3"
                    d="M68.2462 26.3516L47.8124 26.3516L22.1836 91.9998L42.6174 91.9998L68.2462 26.3516Z"
                    fill="black"
                  />
                </svg>
                <div className="loading-text">{status}</div>
              </div>
            ) : (
              <div className="figheat-upload-header-top text-center">
                Select an image on canvas or upload
              </div>
            )}
        </div>
      </div>

      {settingsOpen && (
        <div className="figheat-settings-panel border-b border-neutral-200 p-4 bg-neutral-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-neutral-900">Settings</span>
            <button
              type="button"
              onClick={() => {
                const url = (baseUrl || "").trim().replace(/\/$/, "") || DEFAULT_BASE_URL;
                setBaseUrl(url);
                parent.postMessage({ pluginMessage: { type: "SET_BASE_URL", baseUrl: url } }, "*");
                setSettingsOpen(false);
              }}
              className="text-neutral-500 hover:text-neutral-900 text-xs"
            >
              Close
            </button>
          </div>
          <label className="text-xs font-medium text-neutral-700 mb-1.5 block">API Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={() => {
              const url = (baseUrl || "").trim().replace(/\/$/, "") || DEFAULT_BASE_URL;
              setBaseUrl(url);
              parent.postMessage({ pluginMessage: { type: "SET_BASE_URL", baseUrl: url } }, "*");
            }}
            placeholder="http://localhost:3000"
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-neutral-400"
          />
          <button
            type="button"
            onClick={testConnection}
            className="w-full py-2 px-3 text-sm font-medium border border-neutral-300 bg-white rounded-lg hover:bg-neutral-50"
          >
            Test Connection
          </button>
        </div>
      )}

      <div className="figheat-two-col">
        <div className="figheat-left-panel">
          <div className="pt-4 pb-4">
            <Dropdown
              label="Page type"
              value={pageType}
              options={[{ value: "landing", label: "Landing Page" }]}
              onChange={setPageType}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-900 mb-2 block">AI Model</label>
            <p className="text-[11px] leading-snug text-neutral-500 mb-2 -mt-1">
              Flash sends up to ~1024 px on the long side; Pro up to ~1600 px.
            </p>
            <div className="flex flex-col gap-2">
              <ModelCard
                icon={<LightningIcon />}
                title="Flash"
                description="~15–60s"
                selected={selectedModel === "gemini-2.0-flash"}
                onClick={() => setSelectedModel("gemini-2.0-flash")}
              />
              <ModelCard
                icon={<BrainIcon />}
                title="Pro"
                description="~60–120s"
                selected={selectedModel === "gemini-3-pro"}
                onClick={() => setSelectedModel("gemini-3-pro")}
              />
            </div>
          </div>
          {(analysisController || analysisInProgress) && (
            <button
              type="button"
              className="w-full py-2.5 px-3.5 text-sm font-bold border border-red-500 text-red-600 bg-white rounded-[10px] cursor-pointer"
              onClick={cancelAnalysis}
            >
              ❌ Cancel
            </button>
          )}
          <div className="figheat-left-primary-slot">
            <PrimaryButton
              onClick={trainingMode && !abMode ? analyzeWithVoting : analyze}
              disabled={!!analysisController || analysisInProgress}
            >
              Analyze
            </PrimaryButton>
          </div>
        </div>

        <div className="figheat-right-panel">
          <div className="figheat-content min-h-0 flex flex-col overflow-auto" key={resetKey}>
            {!abMode ? (
              !A.imageBase64 ? (
                <div key={resetKey} className="relative flex-1 min-h-[160px] flex flex-col">
                  <UploadArea
                    onFileSelect={(file) => pickFile("A", file)}
                    accept="image/png,image/jpeg,image/webp"
                  />
                </div>
              ) : null
            ) : (
              <div className="row2">
                <div className="drop">
                  <input
                    key={`${resetKey}-A`}
                    ref={fileInputARef}
                    className="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={e => pickFile("A", e.target.files?.[0] || null)}
                  />
                  <div className="dropInner">
                    <div className="dropTitle">Upload A (landing page)</div>
                    <div className="dropHint">PNG, JPG, WEBP</div>
                  </div>
                </div>
                <div className="drop">
                  <input
                    key={`${resetKey}-B`}
                    ref={fileInputBRef}
                    className="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={e => pickFile("B", e.target.files?.[0] || null)}
                  />
                  <div className="dropInner">
                    <div className="dropTitle">Upload B (landing page)</div>
                    <div className="dropHint">PNG, JPG, WEBP</div>
                  </div>
                </div>
              </div>
            )}
      {error && (
        <div
          ref={statusContainerRef}
          className="status statusErr figheat-error-banner whitespace-pre-line"
        >
          {`Error: ${formatAnalysisErrorForDisplay(error, selectedModel)}`}
        </div>
      )}

      {votingResults && A.imageBase64 && (
        <VotingPanel
          votingResults={votingResults}
          imageBase64A={A.imageBase64}
          imageBase64B={B.imageBase64 || null}
          onVote={submitVote}
          onCancel={() => {
            setVotingResults(null);
            setStatus("Vote cancelled");
          }}
          canvasARef={canvasVoteARef}
          canvasBRef={canvasVoteBRef}
          colorSchemeOverride={heatmapColorMode}
        />
      )}

      {insightsToShow && !votingResults && (
        <InsightsPanel
          insights={insightsToShow}
          onClose={() => {
            setSelectedInsights(null);
            setInsightsToShow(null);
          }}
        />
      )}

      {/* Fallback: Sempre mostra resultado após votar (mesmo sem insights) — só quando já existe análise em A */}
      {!votingResults && !insightsToShow && trainingMode && A.imageBase64 && !error && (A.points.length > 0 || A.boxes.length > 0) && (
        <div className="summary" style={{ marginTop: '20px', border: '2px solid #4CAF50', padding: '15px' }}>
          <div className="summaryTitle" style={{ color: '#4CAF50' }}>✅ Vote Registered!</div>
          <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            {A.points.length > 0 || A.boxes.length > 0 ? (
              <>
                The selected analysis is displayed above.
                <div className="summaryStats" style={{ marginTop: '10px' }}>
                  <div className="stat">
                    <span className="statLabel">Heatmap Points:</span>
                    <span className="statValue">{A.points.length}</span>
                  </div>
                  <div className="stat">
                    <span className="statLabel">UI Elements:</span>
                    <span className="statValue">{A.boxes.length}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#ff9800' }}>
                ⚠️ Waiting for analysis rendering...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Painel de Resumo */}
      {!abMode && A.imageBase64 && (A.points.length > 0 || A.boxes.length > 0) && (
        <div className="summary">
          <div className="summaryTitle">Analysis Summary</div>
          <div className="summaryStats">
            <div className="stat">
              <span className="statLabel">Heatmap Points:</span>
              <span className="statValue">{A.points.length}</span>
            </div>
            <div className="stat">
              <span className="statLabel">UI Elements:</span>
              <span className="statValue">{A.boxes.length}</span>
            </div>
          </div>
          {A.boxes.length > 0 && (
            <div className="summaryList">
              <button
                type="button"
                className="summaryListTitle"
                onClick={() => setTopElementsExpanded(v => !v)}
                style={{
                  cursor: "pointer",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  userSelect: "none",
                }}
                aria-expanded={topElementsExpanded}
              >
                <span>TOP ELEMENTS</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: "11px", fontWeight: 500 }}>
                  {topElementsExpanded ? "See Less" : "See More"}
                  <span>{topElementsExpanded ? "▲" : "▼"}</span>
                </span>
              </button>

              {topElementsExpanded && (
                <div>
                  {A.boxes
                    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
                    .map((box) => {
                      const realIndex = A.boxes.indexOf(box);
                      const isHovered = hoveredIndex === realIndex;

                      return (
                        <div
                          key={realIndex}
                          className={`summaryItem ${isHovered ? "summaryItemHovered" : ""}`}
                          onMouseEnter={() => setHoveredIndex(realIndex)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          style={{ cursor: "pointer" }}
                        >
                          <div
                            className={`summaryItemNumber ${
                              isHovered ? "summaryItemNumberHovered" : ""
                            }`}
                          >
                            {realIndex + 1}
                          </div>
                          <div className="summaryItemContent">
                            <span className="summaryItemLabel">{box.label || "item"}</span>
                            <span className={`summaryItemConf ${isHovered ? "summaryItemConfHovered" : ""}`}>
                              {Math.round((box.confidence || 0) * 100)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {abMode && (A.imageBase64 || B.imageBase64) && (
        <div className="summary">
          <div className="summaryTitle">A/B Analysis Summary</div>
          <div className="abSummary">
            {A.imageBase64 && (A.points.length > 0 || A.boxes.length > 0) && (
              <div className="abSummaryCol">
                <div className="abSummaryHeader">Variante A</div>
                <div className="summaryStats">
                  <div className="stat">
                    <span className="statLabel">Heatmap:</span>
                    <span className="statValue">{A.points.length}</span>
                  </div>
                  <div className="stat">
                    <span className="statLabel">Elements:</span>
                    <span className="statValue">{A.boxes.length}</span>
                  </div>
                </div>
              </div>
            )}
            {B.imageBase64 && (B.points.length > 0 || B.boxes.length > 0) && (
              <div className="abSummaryCol">
                <div className="abSummaryHeader">Variante B</div>
                <div className="summaryStats">
                  <div className="stat">
                    <span className="statLabel">Heatmap:</span>
                    <span className="statValue">{B.points.length}</span>
                  </div>
                  <div className="stat">
                    <span className="statLabel">Elements:</span>
                    <span className="statValue">{B.boxes.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!abMode ? (
        A.imageBase64 ? (
          <div className="preview">
            <input
              ref={singleImageInputARef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                // Permite selecionar a mesma imagem novamente.
                e.currentTarget.value = "";
                pickFile("A", f);
              }}
            />
            <button
              type="button"
              disabled={!!analysisController || analysisInProgress}
              onClick={() => singleImageInputARef.current?.click()}
              className="
                absolute top-2 right-2 z-10
                px-3 py-1.5 text-xs font-semibold
                text-neutral-900 bg-white/90
                border border-neutral-200 rounded-none
                shadow-sm backdrop-blur disabled:opacity-50 disabled:cursor-not-allowed
              "
              title="Change image"
            >
              Change image
            </button>
            <img ref={imgARef} src={A.imageBase64} alt="Preview" onLoad={() => drawOverlay("A")} />
            <canvas ref={canvasARef} />
          </div>
        ) : null
      ) : (
        <div className="abPreview">
          <div className="preview">
            {A.imageBase64 ? (
              <>
                <img ref={imgARef} src={A.imageBase64} alt="A" onLoad={() => drawOverlay("A")} />
                <canvas ref={canvasARef} />
              </>
            ) : (
              <div className="empty">A</div>
            )}
          </div>

          <div className="preview">
            {B.imageBase64 ? (
              <>
                <img ref={imgBRef} src={B.imageBase64} alt="B" onLoad={() => drawOverlay("B")} />
                <canvas ref={canvasBRef} />
              </>
            ) : (
              <div className="empty">B</div>
            )}
          </div>
        </div>
      )}

        </div>
      </div>
      </div>

      <div ref={footerWrapRef} className="figheat-footer-slot shrink-0">
        <Footer mainnetLogoSrc={mainnetLogo} />
      </div>
        </div>
      </div>
      <ResizeHandle />
    </div>
  );
}

const mountEl = document.getElementById("react-page");
if (!mountEl) {
  throw new Error("Missing #react-page mount element");
}

try {
  createRoot(mountEl).render(
    <PluginErrorBoundary>
      <App />
    </PluginErrorBoundary>
  );
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown render error";
  mountEl.innerHTML = `<div style="padding:16px;font-family:Inter,sans-serif;color:#b91c1c;font-weight:700">Error: ${message}</div>`;
}