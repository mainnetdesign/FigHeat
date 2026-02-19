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
import {
  detectDominantColor,
  drawHeat,
  drawBoxesOverlay,
} from "./lib/heatmap";
import {
  loadImage,
  optimizeImage,
  fitWithin,
  canvasToPngBytes,
} from "./lib/imageUtils";
import { Header } from "./components/Header";
import { VotingPanel } from "./components/VotingPanel";
import { InsightsPanel } from "./components/InsightsPanel";

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

function App() {
  const [baseUrl, setBaseUrl] = React.useState("http://localhost:3000");
  const [status, setStatus] = React.useState("Ready");
  const [error, setError] = React.useState<string | null>(null);

  const [abMode, setAbMode] = React.useState(false);
  const [heatmapIntensity] = React.useState(100); // Fixo em 100% (intensidade total)
  const [heatmapColorMode, setHeatmapColorMode] = React.useState<HeatmapColorMode>('auto'); // Laranja / Azul / Auto
  
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
      setError(isFetchError ? `Could not connect to API at ${url}. Is the server running?` : msg);
    }
  }, [baseUrl, fetchViaPlugin]);

  const testConnection = React.useCallback(async () => {
    const url = (baseUrl || "").trim().replace(/\/$/, "");
    if (!url) {
      setError("Preencha a API Base URL.");
      return;
    }
    setError(null);
    setStatus("Testando conexão...");
    try {
      const res = await fetchViaPlugin("GET", `${url}/api/save-vote`);
      if (res.ok) {
        setStatus("✅ Conectado! API OK.");
        setError(null);
        fetchVoteStats();
      } else {
        setError((res.error as string) || `API retornou ${res.status ?? ""}`);
        setStatus("Erro");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao conectar";
      const isFetchError = msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError");
      setError(
        isFetchError
          ? `Não foi possível conectar em ${url}. Confira: (1) Backend rodando? (2) Feche e abra o plugin após alterar o manifest.`
          : msg
      );
      setStatus("Erro");
    }
  }, [baseUrl, fetchViaPlugin, fetchVoteStats]);

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

  // Refs para loading Analyze/A/B: timer em inglês e não sobrescrever com STATUS do main thread
  const analysisInProgressRef = React.useRef(false);
  const analyzeProgressIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzeStartTimeRef = React.useRef(0);
  const analyzeAbModeRef = React.useRef(false);
  const statusContainerRef = React.useRef<HTMLDivElement | null>(null);
  const analyzeWithVotingIgnoreResultRef = React.useRef(false);

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
  }, [A.imageBase64, A.points, A.boxes, heatmapIntensity]);

  React.useEffect(() => {
    drawOverlay("B");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [B.imageBase64, B.points, B.boxes, heatmapIntensity]);

  // Força atualização do canvas quando votingResults muda (após votar)
  React.useEffect(() => {
    if (!votingResults && A.imageBase64) {
      console.log('votingResults mudou para null, forçando atualização do canvas', {
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

    let w = img.clientWidth;
    let h = img.clientHeight;
    if (w <= 0 || h <= 0) {
      w = img.naturalWidth || 0;
      h = img.naturalHeight || 0;
    }
    if (w <= 0 || h <= 0) {
      console.warn(`drawOverlay(${variant}): Dimensões inválidas`);
      return;
    }

    canvas.width = Math.round(w);
    canvas.height = Math.round(h);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scheme = heatmapColorMode === 'auto' ? detectDominantColor(img) : heatmapColorMode;
    const globalIntensity = heatmapIntensity / 100;
    drawHeat(ctx, state.points, canvas.width, canvas.height, scheme, globalIntensity);

    const imgW = img.naturalWidth || canvas.width;
    const imgH = img.naturalHeight || canvas.height;
    drawBoxesOverlay(ctx, state.boxes, canvas.width, canvas.height, imgW, imgH);
  }

  async function pickFile(variant: Variant, file: File | null) {
    if (!file) return;

    try {
      // 🚀 OTIMIZAÇÃO: Usa imagem otimizada no Quick Mode (todos os modos: Analyze, A/B e Training)
      if (quickMode) {
        setStatus(`Otimizando imagem ${variant}...`);
        const optimized = await optimizeImage(file, 1024, 0.85);
        
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

        setStatus(`✅ Imagem ${variant} otimizada (${optimized.width}x${optimized.height})`);
        setError(null);
        return;
      }

      // Modo normal (sem otimização)
      const buf = await file.arrayBuffer();
      const u8 = new Uint8Array(buf);

      const localBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });

      const img = await loadImage(localBase64);

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
  async function analyzeOneInUI(variant: Variant): Promise<void> {
    const state = variant === "A" ? A : B;
    const url = (baseUrl || "").trim().replace(/\/$/, "");
    if (!url || !state.bytes?.length) {
      setError(variant === "A" ? "Upload an image first." : "Upload both images A and B first.");
      setStatus("Error");
      return;
    }
    const endpoint = url.includes("/api/") ? url.replace(/\/api\/.*$/, "/api/cv/analyze") : `${url}/api/cv/analyze`;
    setError(null);
    setStatus(`Sending for analysis (${variant})...`);
    try {
      const res = await fetchViaPlugin("POST", endpoint, state.bytes ?? undefined, {
        "Content-Type": "application/octet-stream",
        "X-Model": selectedModel,
      });
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
      clearAnalyzeProgressInterval();
      analysisInProgressRef.current = false;
      setAnalysisInProgress(false);
      const message =
        err?.message?.includes("fetch") || err?.message?.includes("Failed to fetch")
          ? `Could not connect to API at ${url}. Check that the server is running and the URL is correct.`
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
    const maxS = isAb ? 120 : 90;
    setStatus(`${prefix} 0s (max ${maxS}s)`);
    analyzeProgressIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - analyzeStartTimeRef.current) / 1000);
      setStatus(`${prefix} ${elapsed}s (max ${maxS}s)`);
    }, 1000);
  }

  function analyze() {
    if (abMode) {
      if (!A.bytes || !B.bytes) {
        setError("Upload both images A and B first.");
        setStatus("Error");
        return;
      }
      if (!baseUrl?.trim()) {
        setError("Please fill in the API Base URL.");
        setStatus("Error");
        return;
      }
      setA((prev) => ({ ...prev, points: [], boxes: [] }));
      setB((prev) => ({ ...prev, points: [], boxes: [] }));
      setError(null);
      flushSync(() => {
        setAnalysisInProgress(true);
        setStatus("Analyzing A and B... 0s (max 120s)");
      });
      startAnalyzeProgressTimer(true);
      void analyzeOneInUI("A").then(() => analyzeOneInUI("B"));
      return;
    }

    if (!A.bytes) {
      setError("Upload an image first.");
      setStatus("Error");
      return;
    }
    if (!baseUrl?.trim()) {
      setError("Please fill in the API Base URL.");
      setStatus("Error");
      return;
    }

    setA((prev) => ({ ...prev, points: [], boxes: [] }));
    setError(null);
    flushSync(() => {
      setAnalysisInProgress(true);
      setStatus("Analyzing... 0s (max 90s)");
    });
    startAnalyzeProgressTimer(false);
    void analyzeOneInUI("A");
  }

  async function analyzeWithVoting() {
    if (!A.bytes || !baseUrl) {
      setError("Upload an image first.");
      setStatus("Error");
      return;
    }

    setError(null);
    setVotingResults(null);
    setSelectedInsights(null); // esconde Smart Analysis da análise anterior ao iniciar nova
    setAnalysisInProgress(true);

    // 📊 Indicador de progresso melhorado
    const startTime = Date.now();
    
    // Mostra tamanho da imagem no modo Quick
    const sizeKB = Math.round(A.bytes.length / 1024);
    const modeText = quickMode ? "⚡ Quick" : "🔥 Full";
    
    // 🔥 NOVO: Timeout dinâmico baseado no modelo
    const timeoutMs = selectedModel === 'gemini-3-pro' ? 120000 : 60000; // 2min para 3 Pro, 1min para Flash
    const timeoutSeconds = timeoutMs / 1000;
    const modelEmoji = selectedModel === 'gemini-3-pro' ? '🧠' : '⚡';
    
    setStatus(`${modeText} ${modelEmoji} | Enviando imagem (${sizeKB}KB)...`);

    analyzeWithVotingIgnoreResultRef.current = false;
    const controller = new AbortController();
    setAnalysisController(controller);

    const timeoutId = setTimeout(() => {
      analyzeWithVotingIgnoreResultRef.current = true;
      setError(`⏱️ Timeout: Analysis took more than ${timeoutSeconds}s. ${selectedModel === 'gemini-3-pro' ? 'Gemini 3 Pro is slower.' : 'Try a smaller image or disable Quick Mode.'}`);
      setStatus("Timeout");
      setAnalysisController(null);
      setAnalysisInProgress(false);
    }, timeoutMs);

    const url = baseUrl.includes('/api/') 
      ? baseUrl.replace(/\/api\/.*$/, '/api/cv/analyze-variations')
      : `${baseUrl}/api/cv/analyze-variations`;

    let lastElapsed = -1;
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed !== lastElapsed) {
        lastElapsed = elapsed;
        setStatus(`${modeText} ${modelEmoji} | Analyzing... ${elapsed}s (max ${timeoutSeconds}s)`);
      }
    }, 1000);

    try {
      const response = await fetchViaPlugin("POST", url, A.bytes ?? undefined, {
        "Content-Type": "application/octet-stream",
        "X-Model": selectedModel,
      });
      clearInterval(progressInterval);
      clearTimeout(timeoutId);
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
      clearInterval(progressInterval);
      clearTimeout(timeoutId);
      setAnalysisController(null);
      setAnalysisInProgress(false);
      if (analyzeWithVotingIgnoreResultRef.current) return;
      if (err.name === "AbortError") {
        setError("❌ Analysis cancelled.");
        setStatus("Cancelado");
      } else {
        const urlTrim = (baseUrl || "").trim().replace(/\/$/, "");
        const msg = err?.message ?? "";
        const isFetchError = msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError");
        setError(
          isFetchError
            ? `Could not connect to API at ${urlTrim}. Check that the server is running and the URL is correct.`
            : msg || "Failed to generate variations"
        );
        setStatus("Error");
        setSelectedInsights(null);
      }
    }
  }

  function cancelAnalysis() {
    if (analysisController) {
      analyzeWithVotingIgnoreResultRef.current = true;
      setAnalysisController(null);
      setError("Analysis cancelled by user.");
      setStatus("Cancelled");
      setAnalysisInProgress(false);
      return;
    }
    if (analysisInProgressRef.current) {
      parent.postMessage({ pluginMessage: { type: "CANCEL_ANALYSIS" } }, "*");
    }
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
      setStatus("Gerando snapshot...");

      const makeSingle = async (variant: Variant) => {
        const state = variant === "A" ? A : B;
        if (!state.imageBase64) throw new Error(`No image ${variant}.`);

        const img = await loadImage(state.imageBase64);

        const { w: outW, h: outH } = fitWithin(
          img.naturalWidth,
          img.naturalHeight,
          1920,
          1080
        );

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to create canvas.");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);

        ctx.drawImage(img, 0, 0, outW, outH);

        const scheme = heatmapColorMode === 'auto' ? detectDominantColor(img) : heatmapColorMode;
        console.log(`🎨 [EXPORT ${variant}] Esquema: ${scheme === 'cool' ? '❄️ AZUL' : '🔥 VERMELHO'}`);
        drawHeat(ctx, state.points, outW, outH, scheme);

        return canvas;
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

        const { w: totalW, h: totalH } = fitWithin(totalWRaw, totalHRaw, 1920, 1080);
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
    <div className="wrap">
      <Header />

      <div className="row rowPageType">
        <div className="field fieldPageType">
          <div className="label">Page type</div>
          <select
            className="input selectPageType"
            value={pageType}
            onChange={e => setPageType(e.target.value)}
          >
            <option value="landing">Landing Page</option>
            <option value="ecommerce" disabled>E-commerce — Coming Soon</option>
            <option value="app" disabled>App / SaaS — Coming Soon</option>
            <option value="login" disabled>Login / Sign up — Coming Soon</option>
            <option value="dashboard" disabled>Dashboard — Coming Soon</option>
            <option value="pricing" disabled>Pricing — Coming Soon</option>
            <option value="checkout" disabled>Checkout — Coming Soon</option>
            <option value="blog" disabled>Blog / Editorial — Coming Soon</option>
            <option value="onboarding" disabled>Onboarding — Coming Soon</option>
            <option value="other" disabled>Other — Coming Soon</option>
          </select>
        </div>
      </div>

      <div className="landing-only-badge" role="status">
        Optimized for <strong>{{
          landing: 'Landing Pages',
          ecommerce: 'E-commerce',
          app: 'App / SaaS',
          login: 'Login / Sign up',
          dashboard: 'Dashboard',
          pricing: 'Pricing',
          checkout: 'Checkout',
          blog: 'Blog / Editorial',
          onboarding: 'Onboarding',
          other: 'Other',
        }[pageType] || 'Landing Pages'}</strong> only
      </div>

      {/* Quick Mode e AI Model sempre visíveis (Analyze, A/B e Training) — logo abaixo da API */}
      <div className="row rowQuickModeModel">
        <button
          className={`btnGhost ${quickMode ? 'btnGhostActive' : ''}`}
          onClick={() => {
            setQuickMode(v => !v);
            setStatus("Ready");
          }}
        >
          ⚡ Quick Mode: {quickMode ? "ON (1024px)" : "OFF (original)"}
        </button>
        <div className="modelSelector modelSelectorInline">
          <div className="label">AI Model</div>
          <div className="modelOptions">
            <button
              className={`modelOption ${selectedModel === 'gemini-2.0-flash' ? 'modelOptionActive' : ''}`}
              onClick={() => setSelectedModel('gemini-2.0-flash')}
            >
              <div className="modelName">⚡ Flash</div>
              <div className="modelTime">~15-60s</div>
            </button>
            <button
              className={`modelOption ${selectedModel === 'gemini-3-pro' ? 'modelOptionActive' : ''}`}
              onClick={() => setSelectedModel('gemini-3-pro')}
            >
              <div className="modelName">🧠 Pro</div>
              <div className="modelTime">~60-120s</div>
            </button>
          </div>
        </div>
      </div>

      {/* Controle manual do esquema de cores do heatmap */}
      <div className="field heatmapColorRow">
        <div className="label">Heatmap color</div>
        <div className="modelOptions heatmapColorOptions">
          <button
            type="button"
            className={`modelOption ${heatmapColorMode === 'warm' ? 'modelOptionActive' : ''}`}
            onClick={() => {
              setHeatmapColorMode('warm');
              if (A.imageBase64) setTimeout(() => drawOverlay('A'), 0);
              if (abMode && B.imageBase64) setTimeout(() => drawOverlay('B'), 50);
            }}
          >
            🟠 Laranja
          </button>
          <button
            type="button"
            className={`modelOption ${heatmapColorMode === 'cool' ? 'modelOptionActive' : ''}`}
            onClick={() => {
              setHeatmapColorMode('cool');
              if (A.imageBase64) setTimeout(() => drawOverlay('A'), 0);
              if (abMode && B.imageBase64) setTimeout(() => drawOverlay('B'), 50);
            }}
          >
            🔵 Azul
          </button>
          <button
            type="button"
            className={`modelOption ${heatmapColorMode === 'auto' ? 'modelOptionActive' : ''}`}
            onClick={() => {
              setHeatmapColorMode('auto');
              if (A.imageBase64) setTimeout(() => drawOverlay('A'), 0);
              if (abMode && B.imageBase64) setTimeout(() => drawOverlay('B'), 50);
            }}
          >
            ✨ Auto
          </button>
        </div>
      </div>

      <button
        className="btnGhost"
        onClick={() => {
          // Ao alternar modo, limpa overlays para evitar "reuso" visual de resultados antigos
          clearAnalyzeProgressInterval();
          analysisInProgressRef.current = false;
          setAnalysisInProgress(false);
          setA(prev => ({ ...prev, points: [], boxes: [] }));
          setB(prev => ({ ...prev, points: [], boxes: [] }));
          setVotingResults(null);
          setSelectedInsights(null);
          setAbMode(v => !v);
          setStatus("Ready");
          setError(null);
        }}
      >
        ↔ A/B Mode: {abMode ? "ON" : "OFF"}
      </button>

      {!abMode && (
        <button
          className="btnGhost"
          onClick={() => {
            setTrainingMode(v => !v);
            setVotingResults(null);
            setStatus("Ready");
          }}
        >
          🗳️ Training Mode: {trainingMode ? "ON" : "OFF"}
        </button>
      )}

      {/* Progresso / respostas — dropdown colapsável em todos os modos */}
      <div className="voteStatsCard voteStatsCardDropdown">
        <button
          type="button"
          className="voteStatsCardHeader"
          onClick={() => setProgressSectionOpen((o) => !o)}
          aria-expanded={progressSectionOpen}
        >
          <span className="voteStatsCardTitle">📊 Progress</span>
          {voteStats != null && (
            <span className="voteStatsCardSummary">
              {voteStats.totalVotes} responses
              {voteStats.readyForTraining && " • Ready"}
            </span>
          )}
          <span className={`voteStatsCardChevron ${progressSectionOpen ? "voteStatsCardChevronOpen" : ""}`}>▼</span>
        </button>
        {progressSectionOpen && (
          <div className="voteStatsCardBody">
            {voteStats ? (
              <>
                <div className="voteStatsGrid">
                  <div className="voteStatsStat">
                    <span className="voteStatsStatValue">{voteStats.totalVotes}</span>
                    <span className="voteStatsStatLabel">responses</span>
                  </div>
                  {voteStats.totalVotes > 0 && (
                    <div className="voteStatsSplit">
                      <span className="voteStatsSplitA">A {voteStats.percentageA}%</span>
                      <span className="voteStatsSplitBar">
                        <span className="voteStatsSplitFill" style={{ width: `${voteStats.percentageA}%` }} />
                      </span>
                      <span className="voteStatsSplitB">B {voteStats.percentageB}%</span>
                    </div>
                  )}
                  <div className="voteStatsStatus">
                    {voteStats.readyForTraining ? (
                      <span className="voteStatsBadge voteStatsBadgeSuccess">✓ Ready for training</span>
                    ) : (
                      <span className="voteStatsBadge voteStatsBadgeProgress">{voteStats.message}</span>
                    )}
                  </div>
                </div>
                <div className="voteStatsActions">
                  <button type="button" className="btnGhost btnGhostSmall" onClick={fetchVoteStats} title="Refresh">
                    🔄 Refresh
                  </button>
                  {voteStats.readyForTraining && (
                    <button
                      type="button"
                      className="btn btnSmall voteStatsDownloadBtn"
                      onClick={downloadTrainingDataset}
                      title="Download JSONL for fine-tuning"
                    >
                      📥 Download dataset
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="voteStatsEmpty">
                <p>Load count from API</p>
                <button type="button" className="btn btnSmall" onClick={fetchVoteStats}>
                  Load count
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!abMode ? (
        <div className="drop dropHighlight">
          <input
            key={resetKey}
            ref={fileInputARef}
            className="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e => pickFile("A", e.target.files?.[0] || null)}
          />
          <div className="dropInner">
            <div className="dropTitle">Upload a landing page screenshot</div>
            <div className="dropHint">PNG, JPG, WEBP • Landing pages only</div>
          </div>
        </div>
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

      <button 
        className="btn" 
        onClick={trainingMode && !abMode ? analyzeWithVoting : analyze}
        disabled={!!analysisController || analysisInProgress}
      >
        {abMode ? "Analyze A|B" : trainingMode ? "🗳️ Analyze & Vote" : "Analyze"}
      </button>

      {(analysisController || analysisInProgress) && (
        <button 
          className="btnGhost" 
          onClick={cancelAnalysis}
          style={{ 
            borderColor: '#ef4444', 
            color: '#dc2626',
            fontWeight: 800 
          }}
        >
          ❌ Cancel Analysis
        </button>
      )}

      <button className="btnGhost" onClick={exportSnapshotPng}>
        Export snapshot (PNG)
      </button>

      <button className="btnGhost" onClick={resetAll}>
        New image
      </button>

      <div key={resetKey}>
      <div
        ref={statusContainerRef}
        className={`status ${error ? "statusErr" : ""}`}
      >
        {error ? (
          `Error: ${error}`
        ) : (analysisInProgress || analysisController || status.includes("Enviando") || status.includes("Analyzing")) ? (
          <div className="status-loading">
            <svg className="mainnet-loading-svg" viewBox="0 0 104 103" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M113.223 17.3373V10.3579H116.713C117.053 10.3579 117.393 10.4431 117.734 10.6133C118.081 10.7772 118.368 11.0294 118.595 11.3699C118.828 11.704 118.944 12.1201 118.944 12.6182C118.944 13.1226 118.825 13.5513 118.585 13.9044C118.345 14.2574 118.046 14.5254 117.687 14.7082C117.327 14.891 116.968 14.9825 116.609 14.9825H114.131V13.7814H116.173C116.4 13.7814 116.624 13.6837 116.845 13.4882C117.072 13.2928 117.185 13.0028 117.185 12.6182C117.185 12.2147 117.072 11.9373 116.845 11.786C116.624 11.6347 116.41 11.559 116.202 11.559H114.849V17.3373H113.223ZM117.516 14.0651L119.209 17.3373H117.422L115.795 14.0651H117.516ZM115.899 21.4984C114.853 21.4984 113.872 21.303 112.958 20.9121C112.044 20.5212 111.24 19.979 110.547 19.2855C109.853 18.5919 109.311 17.7881 108.92 16.8739C108.529 15.9597 108.334 14.9793 108.334 13.9327C108.334 12.8861 108.529 11.9058 108.92 10.9916C109.311 10.0774 109.853 9.27353 110.547 8.58001C111.24 7.88649 112.044 7.34428 112.958 6.95338C113.872 6.56249 114.853 6.36704 115.899 6.36704C116.946 6.36704 117.926 6.56249 118.84 6.95338C119.755 7.34428 120.558 7.88649 121.252 8.58001C121.945 9.27353 122.488 10.0774 122.879 10.9916C123.269 11.9058 123.465 12.8861 123.465 13.9327C123.465 14.9793 123.269 15.9597 122.879 16.8739C122.488 17.7881 121.945 18.5919 121.252 19.2855C120.558 19.979 119.755 20.5212 118.84 20.9121C117.926 21.303 116.946 21.4984 115.899 21.4984ZM115.899 19.6259C116.946 19.6259 117.898 19.3706 118.755 18.8599C119.619 18.3429 120.306 17.6557 120.817 16.7982C121.328 15.9345 121.583 14.9793 121.583 13.9327C121.583 12.8861 121.328 11.9341 120.817 11.0767C120.306 10.2129 119.619 9.52572 118.755 9.01503C117.898 8.49804 116.946 8.23955 115.899 8.23955C114.853 8.23955 113.897 8.49804 113.034 9.01503C112.17 9.52572 111.483 10.2129 110.972 11.0767C110.461 11.9341 110.206 12.8861 110.206 13.9327C110.206 14.9793 110.461 15.9345 110.972 16.7982C111.483 17.6557 112.17 18.3429 113.034 18.8599C113.897 19.3706 114.853 19.6259 115.899 19.6259Z" fill="black"/>
              <path className="loading-bar-1" d="M46.0626 10L25.6288 10L-9.55385e-06 75.6483L20.4338 75.6483L46.0626 10Z" fill="black"/>
              <path className="loading-bar-2" d="M103.942 10L83.5087 10L57.8799 75.6483L78.3137 75.6483L103.942 10Z" fill="black"/>
              <path className="loading-bar-3" d="M68.2462 26.3516L47.8124 26.3516L22.1836 91.9998L42.6174 91.9998L68.2462 26.3516Z" fill="black"/>
            </svg>
            <div className="loading-text">{status}</div>
          </div>
        ) : (
          status
        )}
      </div>

      {votingResults && A.imageBase64 && (
        <VotingPanel
          votingResults={votingResults}
          imageBase64A={A.imageBase64}
          imageBase64B={B.imageBase64 || null}
          onVote={submitVote}
          onCancel={() => {
            setVotingResults(null);
            setStatus("Votação cancelada");
          }}
          canvasARef={canvasVoteARef}
          canvasBRef={canvasVoteBRef}
          colorSchemeOverride={heatmapColorMode === 'auto' ? null : heatmapColorMode}
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
              <span className="statLabel">Elementos UI:</span>
              <span className="statValue">{A.boxes.length}</span>
            </div>
          </div>
          {A.boxes.length > 0 && (
            <div className="summaryList">
              <div className="summaryListTitle">TOP ELEMENTS:</div>
              {A.boxes
                .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
                .map((box, originalIndex) => {
                  // Encontra o índice real no array original
                  const realIndex = A.boxes.indexOf(box);
                  const isHovered = hoveredIndex === realIndex;
                  
                  return (
                    <div 
                      key={realIndex} 
                      className={`summaryItem ${isHovered ? 'summaryItemHovered' : ''}`}
                      onMouseEnter={() => setHoveredIndex(realIndex)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      style={{
                        cursor: 'pointer'
                      }}
                    >
                      <div 
                        className={`summaryItemNumber ${isHovered ? 'summaryItemNumberHovered' : ''}`}
                      >
                        {realIndex + 1}
                      </div>
                      <div className="summaryItemContent">
                        <span className="summaryItemLabel">{box.label || "item"}</span>
                        <span className={`summaryItemConf ${isHovered ? 'summaryItemConfHovered' : ''}`}>
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

      {/* Footer com Mainnet Design */}
      <div className="mainnet-footer">
        <div className="footer-brand">
          <svg className="footer-logo-svg" viewBox="0 0 372 103" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M134.364 24.5336H144.018L160.803 65.5184H161.421L178.206 24.5336H187.86V77.2578H180.292V39.1048H179.802L164.253 77.1806H157.971L142.422 39.0791H141.933V77.2578H134.364V24.5336ZM204.516 78.1331C202.01 78.1331 199.745 77.6697 197.72 76.7429C195.694 75.799 194.09 74.4345 192.905 72.6496C191.738 70.8647 191.155 68.6764 191.155 66.0848C191.155 63.8536 191.584 62.0172 192.442 60.5755C193.3 59.1339 194.459 57.9925 195.918 57.1516C197.376 56.3106 199.007 55.6756 200.809 55.2465C202.611 54.8174 204.447 54.4913 206.318 54.2682C208.687 53.9936 210.609 53.7705 212.085 53.5989C213.561 53.4101 214.634 53.1097 215.303 52.6978C215.972 52.2859 216.307 51.6165 216.307 50.6898V50.5095C216.307 48.2612 215.672 46.5192 214.402 45.2835C213.149 44.0477 211.278 43.4299 208.79 43.4299C206.198 43.4299 204.156 44.0048 202.663 45.1547C201.187 46.2875 200.165 47.549 199.599 48.9391L192.365 47.2915C193.223 44.8887 194.476 42.9493 196.124 41.4733C197.788 39.9801 199.702 38.8989 201.864 38.2295C204.027 37.543 206.301 37.1998 208.687 37.1998C210.266 37.1998 211.939 37.3886 213.707 37.7661C215.492 38.1266 217.157 38.7959 218.701 39.7742C220.263 40.7525 221.542 42.1512 222.537 43.9705C223.533 45.7726 224.03 48.1153 224.03 50.9987V77.2578H216.513V71.8515H216.204C215.706 72.847 214.96 73.8252 213.964 74.7864C212.969 75.7475 211.69 76.5456 210.128 77.1806C208.567 77.8156 206.696 78.1331 204.516 78.1331ZM206.19 71.9545C208.318 71.9545 210.137 71.534 211.647 70.693C213.175 69.8521 214.333 68.7536 215.123 67.3978C215.929 66.0247 216.333 64.5573 216.333 62.9955V57.8981C216.058 58.1727 215.526 58.4302 214.737 58.6705C213.964 58.8936 213.08 59.091 212.085 59.2626C211.089 59.417 210.12 59.5629 209.176 59.7002C208.232 59.8204 207.442 59.9234 206.807 60.0092C205.314 60.198 203.95 60.5155 202.714 60.9617C201.495 61.4079 200.517 62.0515 199.779 62.8925C199.058 63.7163 198.698 64.8148 198.698 66.1878C198.698 68.0929 199.402 69.5345 200.809 70.5128C202.216 71.4739 204.01 71.9545 206.19 71.9545ZM228.483 77.2578V37.7146H236.181V77.2578H228.483ZM232.371 31.6133C231.032 31.6133 229.882 31.167 228.921 30.2746C227.977 29.3649 227.505 28.2837 227.505 27.0308C227.505 25.7607 227.977 24.6795 228.921 23.787C229.882 22.8774 231.032 22.4226 232.371 22.4226C233.709 22.4226 234.851 22.8774 235.795 23.787C236.756 24.6795 237.236 25.7607 237.236 27.0308C237.236 28.2837 236.756 29.3649 235.795 30.2746C234.851 31.167 233.709 31.6133 232.371 31.6133ZM248.434 53.7791V77.2578H240.737V37.7146H248.125V44.1507H248.614C249.524 42.0568 250.949 40.3749 252.888 39.1048C254.845 37.8348 257.307 37.1998 260.277 37.1998C262.971 37.1998 265.331 37.7661 267.356 38.8989C269.382 40.0145 270.952 41.6793 272.067 43.8933C273.183 46.1073 273.741 48.8447 273.741 52.1057V77.2578H266.043V53.0325C266.043 50.1663 265.297 47.9265 263.804 46.3132C262.31 44.6828 260.259 43.8675 257.651 43.8675C255.866 43.8675 254.278 44.2537 252.888 45.026C251.515 45.7983 250.425 46.9311 249.619 48.4243C248.829 49.9003 248.434 51.6852 248.434 53.7791ZM285.962 53.7791V77.2578H278.265V37.7146H285.653V44.1507H286.142C287.052 42.0568 288.477 40.3749 290.416 39.1048C292.372 37.8348 294.835 37.1998 297.805 37.1998C300.499 37.1998 302.859 37.7661 304.884 38.8989C306.909 40.0145 308.48 41.6793 309.595 43.8933C310.711 46.1073 311.269 48.8447 311.269 52.1057V77.2578H303.571V53.0325C303.571 50.1663 302.825 47.9265 301.331 46.3132C299.838 44.6828 297.787 43.8675 295.179 43.8675C293.394 43.8675 291.806 44.2537 290.416 45.026C289.043 45.7983 287.953 46.9311 287.146 48.4243C286.357 49.9003 285.962 51.6852 285.962 53.7791ZM332.835 78.0559C328.939 78.0559 325.584 77.2235 322.769 75.5587C319.972 73.8767 317.809 71.5168 316.282 68.479C314.771 65.424 314.016 61.8456 314.016 57.7437C314.016 53.6932 314.771 50.1234 316.282 47.0341C317.809 43.9448 319.937 41.5334 322.666 39.7999C325.412 38.0665 328.622 37.1998 332.295 37.1998C334.526 37.1998 336.688 37.5688 338.782 38.3068C340.876 39.0448 342.755 40.2033 344.42 41.7822C346.085 43.3612 347.398 45.4122 348.359 47.9351C349.32 50.4409 349.801 53.4873 349.801 57.0743V59.8032H318.367V54.0365H342.258C342.258 52.0113 341.846 50.2178 341.022 48.656C340.198 47.077 339.04 45.8327 337.546 44.923C336.07 44.0134 334.337 43.5586 332.346 43.5586C330.184 43.5586 328.296 44.0906 326.682 45.1547C325.086 46.2017 323.85 47.5747 322.975 49.2738C322.117 50.9558 321.688 52.7836 321.688 54.7573V59.2626C321.688 61.9057 322.151 64.154 323.078 66.0076C324.022 67.8612 325.335 69.2771 327.017 70.2554C328.699 71.2165 330.664 71.6971 332.912 71.6971C334.371 71.6971 335.701 71.4911 336.903 71.0792C338.104 70.6501 339.143 70.0151 340.018 69.1741C340.893 68.3331 341.563 67.2948 342.026 66.0591L349.312 67.372C348.728 69.5174 347.681 71.3967 346.171 73.01C344.678 74.6062 342.798 75.8505 340.533 76.7429C338.284 77.6182 335.719 78.0559 332.835 78.0559ZM371 37.7146V43.8933H349.401V37.7146H371ZM355.193 28.2408H362.891V65.6472C362.891 67.1403 363.114 68.2645 363.56 69.0197C364.006 69.7577 364.581 70.264 365.285 70.5386C366.006 70.796 366.787 70.9247 367.628 70.9247C368.246 70.9247 368.786 70.8818 369.25 70.796C369.713 70.7102 370.074 70.6415 370.331 70.5901L371.721 76.9489C371.275 77.1205 370.64 77.2921 369.816 77.4638C368.992 77.6526 367.962 77.7555 366.727 77.7727C364.702 77.807 362.814 77.4466 361.063 76.6914C359.312 75.9363 357.896 74.7692 356.815 73.1902C355.734 71.6112 355.193 69.6289 355.193 67.2433V28.2408Z" fill="white"/>
            <path d="M113.223 17.3373V10.3579H116.713C117.053 10.3579 117.393 10.4431 117.734 10.6133C118.081 10.7772 118.368 11.0294 118.595 11.3699C118.828 11.704 118.944 12.1201 118.944 12.6182C118.944 13.1226 118.825 13.5513 118.585 13.9044C118.345 14.2574 118.046 14.5254 117.687 14.7082C117.327 14.891 116.968 14.9825 116.609 14.9825H114.131V13.7814H116.173C116.4 13.7814 116.624 13.6837 116.845 13.4882C117.072 13.2928 117.185 13.0028 117.185 12.6182C117.185 12.2147 117.072 11.9373 116.845 11.786C116.624 11.6347 116.41 11.559 116.202 11.559H114.849V17.3373H113.223ZM117.516 14.0651L119.209 17.3373H117.422L115.795 14.0651H117.516ZM115.899 21.4984C114.853 21.4984 113.872 21.303 112.958 20.9121C112.044 20.5212 111.24 19.979 110.547 19.2855C109.853 18.5919 109.311 17.7881 108.92 16.8739C108.529 15.9597 108.334 14.9793 108.334 13.9327C108.334 12.8861 108.529 11.9058 108.92 10.9916C109.311 10.0774 109.853 9.27353 110.547 8.58001C111.24 7.88649 112.044 7.34428 112.958 6.95338C113.872 6.56249 114.853 6.36704 115.899 6.36704C116.946 6.36704 117.926 6.56249 118.84 6.95338C119.755 7.34428 120.558 7.88649 121.252 8.58001C121.945 9.27353 122.488 10.0774 122.879 10.9916C123.269 11.9058 123.465 12.8861 123.465 13.9327C123.465 14.9793 123.269 15.9597 122.879 16.8739C122.488 17.7881 121.945 18.5919 121.252 19.2855C120.558 19.979 119.755 20.5212 118.84 20.9121C117.926 21.303 116.946 21.4984 115.899 21.4984ZM115.899 19.6259C116.946 19.6259 117.898 19.3706 118.755 18.8599C119.619 18.3429 120.306 17.6557 120.817 16.7982C121.328 15.9345 121.583 14.9793 121.583 13.9327C121.583 12.8861 121.328 11.9341 120.817 11.0767C120.306 10.2129 119.619 9.52572 118.755 9.01503C117.898 8.49804 116.946 8.23955 115.899 8.23955C114.853 8.23955 113.897 8.49804 113.034 9.01503C112.17 9.52572 111.483 10.2129 110.972 11.0767C110.461 11.9341 110.206 12.8861 110.206 13.9327C110.206 14.9793 110.461 15.9345 110.972 16.7982C111.483 17.6557 112.17 18.3429 113.034 18.8599C113.897 19.3706 114.853 19.6259 115.899 19.6259Z" fill="white"/>
            <path d="M46.0626 10L25.6288 10L-9.55385e-06 75.6483L20.4338 75.6483L46.0626 10Z" fill="white"/>
            <path d="M103.942 10L83.5087 10L57.8799 75.6483L78.3137 75.6483L103.942 10Z" fill="white"/>
            <path d="M68.2462 26.3516L47.8124 26.3516L22.1836 91.9998L42.6174 91.9998L68.2462 26.3516Z" fill="white"/>
          </svg>
        </div>
        <div className="footer-link-wrapper">
          <a 
            href="https://mainnet.design/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="footer-link"
          >
            mainnet.design
          </a>
          <span className="footer-link-cta">Click here</span>
        </div>
        <div className="footer-copyright">© 2026 Mainnet Design</div>
      </div>
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