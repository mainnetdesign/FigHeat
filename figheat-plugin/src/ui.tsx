// src/ui.tsx
import * as React from "react";
import { createRoot } from "react-dom/client";
import "./ui.css";

type HeatmapPoint = { x: number; y: number; intensity: number };
type BoundingBox = {
  label: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  confidence: number;
};

type Insight = {
  type: 'success' | 'warning' | 'info' | 'suggestion';
  title: string;
  message: string;
  priority: number;
};

type AnalysisInsights = {
  score: number;
  insights: Insight[];
};

type Variant = "A" | "B";

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

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

// 🎨 Detecta cores predominantes da imagem para escolher esquema de heatmap
function detectDominantColor(imageElement: HTMLImageElement): 'warm' | 'cool' {
  try {
    // Cria canvas temporário para análise
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'warm'; // Padrão se falhar
    
    // Reduz tamanho para análise rápida (100x100)
    const sampleSize = 100;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    
    // Desenha imagem reduzida
    ctx.drawImage(imageElement, 0, 0, sampleSize, sampleSize);
    
    // Pega dados de pixels
    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;
    
    let totalRed = 0, totalGreen = 0, totalBlue = 0;
    let pixelCount = 0;
    
    // Amostra a cada 4 pixels para velocidade
    for (let i = 0; i < pixels.length; i += 16) { // 4 pixels * 4 canais = 16
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      
      // Ignora pixels transparentes
      if (a < 50) continue;
      
      totalRed += r;
      totalGreen += g;
      totalBlue += b;
      pixelCount++;
    }
    
    if (pixelCount === 0) return 'warm';
    
    const avgRed = totalRed / pixelCount;
    const avgGreen = totalGreen / pixelCount;
    const avgBlue = totalBlue / pixelCount;
    
    // Se a página tem muito vermelho/laranja/amarelo, usa esquema frio
    // Se tem muito azul/verde/roxo, usa esquema quente (padrão)
    const warmScore = avgRed + (avgRed - avgBlue) * 0.5; // Pontuação de cores quentes
    const coolScore = avgBlue + (avgBlue - avgRed) * 0.5; // Pontuação de cores frias
    
    // Decisão mais simples: se tem mais vermelho que azul, usa esquema frio
    const isWarmPage = avgRed > avgBlue + 20; // Se vermelho é 20+ maior que azul
    const decision = isWarmPage ? 'cool' : 'warm';
    
    console.log(`🎨 Detecção: R=${avgRed.toFixed(0)} G=${avgGreen.toFixed(0)} B=${avgBlue.toFixed(0)} → ${decision === 'cool' ? '❄️ AZUL' : '🔥 VERMELHO'}`);
    
    // Se página tem cores quentes (vermelho/laranja), usa esquema frio (azul)
    return decision;
    
  } catch (err) {
    console.warn('Erro ao detectar cores:', err);
    return 'warm'; // Padrão se houver erro
  }
}

// 🎨 Retorna gradiente de cores baseado no esquema
function getHeatmapGradient(scheme: 'warm' | 'cool'): Array<{stop: number, color: string}> {
  if (scheme === 'cool') {
    // 🎨 Esquema FRIO para páginas laranja/vermelhas
    // Segue a mesma estrutura de progressão do Hotjar, mas com cores frias
    return [
      { stop: 0.0, color: 'rgba(0, 255, 200, 0)' },      // Verde-água transparente (equivale ao amarelo)
      { stop: 0.3, color: 'rgba(0, 200, 255, 0.4)' },    // Ciano claro (equivale ao laranja claro)
      { stop: 0.6, color: 'rgba(0, 120, 255, 0.7)' },    // Azul médio (equivale ao laranja)
      { stop: 1.0, color: 'rgba(80, 80, 255, 0.95)' }    // Azul-roxo intenso (equivale ao vermelho)
    ];
  } else {
    // 🔥 Esquema QUENTE (padrão Hotjar) para páginas normais - NÃO MODIFICAR!
    return [
      { stop: 0.0, color: 'rgba(255, 255, 0, 0)' },      // Transparente
      { stop: 0.3, color: 'rgba(255, 200, 0, 0.4)' },    // Amarelo
      { stop: 0.6, color: 'rgba(255, 120, 0, 0.7)' },    // Laranja
      { stop: 1.0, color: 'rgba(255, 0, 0, 0.95)' }      // Vermelho
    ];
  }
}

type ResultState = {
  bytes: Uint8Array | null;
  imageBase64: string | null;
  points: HeatmapPoint[];
  boxes: BoundingBox[];
  w: number;
  h: number;
};

function App() {
  const [baseUrl, setBaseUrl] = React.useState("http://localhost:3000");
  const [status, setStatus] = React.useState("Pronto");
  const [error, setError] = React.useState<string | null>(null);

  const [abMode, setAbMode] = React.useState(false);
  const [heatmapIntensity] = React.useState(100); // Fixo em 100% (intensidade total)
  const [colorScheme, setColorScheme] = React.useState<'warm' | 'cool'>('warm'); // Esquema de cores do heatmap
  
  // Seletor de modelo
  const [selectedModel, setSelectedModel] = React.useState<'gemini-2.0-flash' | 'gemini-3-pro'>('gemini-2.0-flash');
  
  // Training Mode (Votação)
  const [trainingMode, setTrainingMode] = React.useState(false);
  const [quickMode, setQuickMode] = React.useState(true); // Modo rápido ativado por padrão
  const [analysisController, setAnalysisController] = React.useState<AbortController | null>(null);
  const [votingResults, setVotingResults] = React.useState<{
    voteId: string;
    optionA: { heatmapPoints: HeatmapPoint[]; boundingBoxes: BoundingBox[]; insights?: AnalysisInsights };
    optionB: { heatmapPoints: HeatmapPoint[]; boundingBoxes: BoundingBox[]; insights?: AnalysisInsights };
    timestamp: number;
  } | null>(null);
  
  // Estado para exibir insights da opção selecionada
  const [selectedInsights, setSelectedInsights] = React.useState<AnalysisInsights | null>(null);

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

  React.useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as CodeToUi;
      if (!msg) return;

      if (msg.type === "STATUS") {
        setStatus(msg.message);
        setError(null);
        return;
      }

      if (msg.type === "ERROR") {
        setError(msg.message);
        setStatus("Erro");
        return;
      }

      if (msg.type === "DONE") {
        setError(null);
        setStatus(`Concluído (${msg.variant})`);

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
  }, []);

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
      console.log('Pontos atualizados após votar, forçando atualização do canvas');
      setTimeout(() => {
        drawOverlay("A");
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [A.points, votingResults, selectedInsights, trainingMode]);

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

    const w = img.clientWidth;
    const h = img.clientHeight;
    if (w === 0 || h === 0 || w <= 0 || h <= 0) {
      console.warn(`drawOverlay(${variant}): Dimensões inválidas`, { w, h });
      return;
    }

    canvas.width = Math.round(w);
    canvas.height = Math.round(h);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 🎨 DETECÇÃO AUTOMÁTICA DE CORES
    const detectedScheme = detectDominantColor(img);
    setColorScheme(detectedScheme); // Salva no estado para usar em outras funções
    const gradientColors = getHeatmapGradient(detectedScheme);
    
    // 🎨 HEATMAP OTIMIZADO - Sem Artefatos
    
    const globalIntensity = heatmapIntensity / 100;
    
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'blur(28px)'; // Reduzido de 42px para 28px
    
    for (const p of state.points) {
      const x = (p.x / 100) * canvas.width;
      const y = (p.y / 100) * canvas.height;
      // ⚡ Intensidade mínima aumentada para 0.75 (mais visível)
      const intensity = Math.max(0.75, clamp01(Number(p.intensity ?? 0.75)));
      
      const baseRadius = Math.max(1, Math.min(canvas.width, canvas.height) * 0.16 * intensity);
      const numBlobs = 8; // Reduzido de 12 para 8
      const flowDirection = (x * 0.17 + y * 0.17) % (Math.PI * 2);
      
      for (let i = 0; i < numBlobs; i++) {
        const progress = i / (numBlobs - 1);
        
        const spreadAngle = (i / numBlobs) * Math.PI * 2 + flowDirection;
        const spreadRadius = baseRadius * (0.4 + progress * 0.6) * (0.7 + Math.sin(i * 0.8) * 0.3);
        
        const offsetX = Math.cos(spreadAngle) * spreadRadius;
        const offsetY = Math.sin(spreadAngle) * spreadRadius;
        
        const blobX = x + offsetX;
        const blobY = y + offsetY;
        
        const sizeVariation = 0.5 + Math.sin(i * 1.5 + x * 0.02) * 0.4 + Math.cos(i * 2.0) * 0.4;
        const radius = Math.max(1, baseRadius * sizeVariation);
        const blobIntensity = intensity * (0.95 - progress * 0.25);

        if (radius <= 0) continue;
        
        ctx.save();
        
        // Scale mais uniforme para reduzir artefatos
        const scaleX = 0.75 + Math.sin(i * 0.8) * 0.35;
        const scaleY = 0.75 + Math.cos(i * 0.9) * 0.35;
        
        ctx.translate(blobX, blobY);
        ctx.rotate(spreadAngle + i * 0.25);
        ctx.scale(scaleX, scaleY);
        
        // 🎨 Gradiente adaptativo baseado nas cores da página
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        
        // Usa cores detectadas automaticamente
        gradientColors.forEach((colorStop, idx) => {
          // Ajusta opacidade baseado na intensidade do blob
          const baseOpacity = idx === gradientColors.length - 1 ? 0 : 
                             [0.8, 0.65, 0.4][idx] || 0.5;
          const finalOpacity = baseOpacity * blobIntensity * globalIntensity;
          
          // Extrai RGB e aplica opacidade
          const colorWithOpacity = colorStop.color.replace(/[\d.]+\)$/, `${finalOpacity})`);
          gradient.addColorStop(colorStop.stop, colorWithOpacity);
        });

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }
    
    ctx.filter = 'none';

    // Desenha boxes com labels - VISUAL MELHORADO
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(59, 130, 246, 0.85)"; // Azul mais suave

    for (const b of state.boxes) {
      const x1 = (b.xmin / 100) * canvas.width;
      const y1 = (b.ymin / 100) * canvas.height;
      const x2 = (b.xmax / 100) * canvas.width;
      const y2 = (b.ymax / 100) * canvas.height;
      
      // Desenha retângulo com cantos arredondados
      const boxWidth = Math.max(1, x2 - x1);
      const boxHeight = Math.max(1, y2 - y1);
      const cornerRadius = 4;
      
      ctx.beginPath();
      ctx.moveTo(x1 + cornerRadius, y1);
      ctx.lineTo(x2 - cornerRadius, y1);
      ctx.quadraticCurveTo(x2, y1, x2, y1 + cornerRadius);
      ctx.lineTo(x2, y2 - cornerRadius);
      ctx.quadraticCurveTo(x2, y2, x2 - cornerRadius, y2);
      ctx.lineTo(x1 + cornerRadius, y2);
      ctx.quadraticCurveTo(x1, y2, x1, y2 - cornerRadius);
      ctx.lineTo(x1, y1 + cornerRadius);
      ctx.quadraticCurveTo(x1, y1, x1 + cornerRadius, y1);
      ctx.closePath();
      ctx.stroke();

      // Desenha label com confiança - MELHORADO
      const label = b.label || "item";
      const confidence = Math.round((b.confidence || 0) * 100);
      const text = `${label} ${confidence}%`;

      // Configuração do texto - MENOR E MAIS ELEGANTE
      const fontSize = Math.max(10, Math.round(canvas.width * 0.014));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      
      // Mede o texto
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const textHeight = fontSize;
      
      // Padding reduzido
      const padX = 5;
      const padY = 3;
      
      // Posição da caixinha (acima da box)
      const labelX = x1;
      const labelY = y1 - textHeight - padY * 2 - 2;
      
      // Desenha caixinha azul de fundo com cantos arredondados e sombra
      const labelCornerRadius = 3;
      
      // Sombra sutil
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      
      ctx.fillStyle = "rgba(59, 130, 246, 0.92)";
      ctx.beginPath();
      ctx.moveTo(labelX + labelCornerRadius, labelY);
      ctx.lineTo(labelX + textWidth + padX * 2 - labelCornerRadius, labelY);
      ctx.quadraticCurveTo(labelX + textWidth + padX * 2, labelY, labelX + textWidth + padX * 2, labelY + labelCornerRadius);
      ctx.lineTo(labelX + textWidth + padX * 2, labelY + textHeight + padY * 2 - labelCornerRadius);
      ctx.quadraticCurveTo(labelX + textWidth + padX * 2, labelY + textHeight + padY * 2, labelX + textWidth + padX * 2 - labelCornerRadius, labelY + textHeight + padY * 2);
      ctx.lineTo(labelX + labelCornerRadius, labelY + textHeight + padY * 2);
      ctx.quadraticCurveTo(labelX, labelY + textHeight + padY * 2, labelX, labelY + textHeight + padY * 2 - labelCornerRadius);
      ctx.lineTo(labelX, labelY + labelCornerRadius);
      ctx.quadraticCurveTo(labelX, labelY, labelX + labelCornerRadius, labelY);
      ctx.closePath();
      ctx.fill();
      
      // Remove sombra para o texto
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      // Desenha texto branco
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "top";
      ctx.fillText(text, labelX + padX, labelY + padY);
    }
  }

  async function pickFile(variant: Variant, file: File | null) {
    if (!file) return;

    try {
      // 🚀 OTIMIZAÇÃO: Usa imagem otimizada no Quick Mode
      if (quickMode && trainingMode) {
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
        r.onerror = () => reject(new Error("Falha ao ler arquivo"));
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

      setStatus(`Imagem ${variant} carregada`);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Falha ao processar imagem");
      setStatus("Erro");
    }
  }

  function analyzeOne(variant: Variant) {
    const state = variant === "A" ? A : B;

    if (!state.bytes) {
      setError(`Envie a imagem ${variant} antes.`);
      setStatus("Erro");
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

  function analyze() {
    if (abMode) {
      if (!A.bytes || !B.bytes) {
        setError("Envie as duas imagens A e B antes.");
        setStatus("Erro");
        return;
      }
      setError(null);
      setStatus("Analisando A e B...");
      analyzeOne("A");
      analyzeOne("B");
      return;
    }

    if (!A.bytes) {
      setError("Envie uma imagem antes.");
      setStatus("Erro");
      return;
    }

    setError(null);
    setStatus("Analisando...");
    analyzeOne("A");
  }

  async function analyzeWithVoting() {
    if (!A.bytes || !baseUrl) {
      setError("Envie uma imagem antes.");
      setStatus("Erro");
      return;
    }

    setError(null);
    setVotingResults(null);

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

    // 🔥 NOVO: AbortController para cancelar requisição
    const controller = new AbortController();
    setAnalysisController(controller);

    // 🔥 NOVO: Timeout dinâmico
    const timeoutId = setTimeout(() => {
      controller.abort();
      setError(`⏱️ Timeout: Análise demorou mais de ${timeoutSeconds}s. ${selectedModel === 'gemini-3-pro' ? 'Gemini 3 Pro é mais lento.' : 'Tente uma imagem menor ou desative Quick Mode.'}`);
      setStatus("Timeout");
      setAnalysisController(null);
    }, timeoutMs);

    try {
      const url = baseUrl.includes('/api/') 
        ? baseUrl.replace(/\/api\/.*$/, '/api/cv/analyze-variations')
        : `${baseUrl}/api/cv/analyze-variations`;

      // Simula progresso enquanto aguarda
      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setStatus(`${modeText} ${modelEmoji} | Analisando... ${elapsed}s (máx ${timeoutSeconds}s)`);
      }, 1000);

      const response = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/octet-stream",
          "X-Model": selectedModel
        },
        body: A.bytes as unknown as BodyInit,
        signal: controller.signal, // 🔥 NOVO: Permite cancelar
      });

      clearInterval(progressInterval);
      clearTimeout(timeoutId);
      setAnalysisController(null);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Erro desconhecido");
        
        // 🔥 NOVO: Mensagens de erro mais úteis
        if (response.status === 500) {
          throw new Error(`Backend Error: ${errorText.includes("JSON") ? "Gemini gerou resposta muito grande. Backend corrigido, tente novamente!" : errorText}`);
        }
        throw new Error(`Falha na análise (${response.status}): ${errorText}`);
      }

      setStatus(`${modeText} | Processando resultados...`);
      const result = await response.json();
      
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      
      setVotingResults(result);
      setStatus(`✅ Pronto em ${totalTime}s! Vote na melhor opção.`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      setAnalysisController(null);
      
      // 🔥 NOVO: Tratamento melhor de erros
      if (err.name === 'AbortError') {
        setError("❌ Análise cancelada.");
        setStatus("Cancelado");
      } else {
        setError(err.message || "Erro ao gerar variações");
        setStatus("Erro");
      }
    }
  }

  // 🔥 NOVO: Função para cancelar análise
  function cancelAnalysis() {
    if (analysisController) {
      analysisController.abort();
      setAnalysisController(null);
      setError("Análise cancelada pelo usuário.");
      setStatus("Cancelado");
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
      pointsCount: winner.heatmapPoints?.length || 0,
      boxesCount: winner.boundingBoxes?.length || 0,
      hasInsights: !!winner.insights,
      hasImage: !!A.imageBase64,
      currentImageBase64: A.imageBase64 ? 'exists' : 'missing'
    });

    // Atualiza o estado A com os dados da opção escolhida IMEDIATAMENTE
    // IMPORTANTE: Usa função de atualização para garantir que não perca dados anteriores
    setA(prevA => {
      const newState = {
        ...prevA,
        points: winner.heatmapPoints || [],
        boxes: winner.boundingBoxes || [],
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
    if (winner.insights) {
      setSelectedInsights(winner.insights);
    } else {
      // Se não houver insights, limpa para garantir que não fique travado
      setSelectedInsights(null);
    }

    // Remove o painel de votação ANTES de tentar salvar
    // Isso garante que sempre mostre o resultado, mesmo se houver erro
    setVotingResults(null);
    
    // Força atualização do canvas após um pequeno delay
    setTimeout(() => {
      drawOverlay("A");
    }, 50);

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

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voteData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erro ao salvar voto:', response.status, errorText);
        // Não lança erro aqui - apenas loga
        // O estado já foi atualizado, então o usuário vê o resultado mesmo com erro ao salvar
        setStatus(`⚠️ Voto selecionado (erro ao salvar: ${response.status})`);
        setError(null); // Não mostra erro ao usuário, apenas aviso no status
        return;
      }

      const result = await response.json();
      console.log('Resposta do servidor:', result);
      
      setStatus(`✅ Voto registrado! Total: ${result.voteCount}`);
      setError(null); // Limpa qualquer erro anterior
      
      console.log('Estado após votar:', {
        hasImage: !!A.imageBase64,
        pointsCount: (winner.heatmapPoints || []).length,
        boxesCount: (winner.boundingBoxes || []).length,
        abMode,
        hasSelectedInsights: !!winner.insights
      });
    } catch (err: any) {
      console.error("Erro ao salvar voto:", err);
      // Não mostra erro ao usuário - o estado já foi atualizado
      // Apenas avisa no status que houve problema ao salvar
      setStatus(`⚠️ Voto selecionado (erro ao salvar)`);
      setError(null); // Não mostra erro ao usuário
    }
  }

  function resetAll() {
    setA({ bytes: null, imageBase64: null, points: [], boxes: [], w: 0, h: 0 });
    setB({ bytes: null, imageBase64: null, points: [], boxes: [], w: 0, h: 0 });
    setStatus("Pronto");
    setError(null);
  }

  async function exportSnapshotPng() {
    try {
      setError(null);
      setStatus("Gerando snapshot...");

      const makeSingle = async (variant: Variant) => {
        const state = variant === "A" ? A : B;
        if (!state.imageBase64) throw new Error(`Sem imagem ${variant}.`);

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
        if (!ctx) throw new Error("Falha ao criar canvas.");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);

        ctx.drawImage(img, 0, 0, outW, outH);

        // 🎨 DETECÇÃO AUTOMÁTICA DE CORES NA EXPORTAÇÃO
        const detectedScheme = detectDominantColor(img);
        console.log(`🎨 [EXPORT ${variant}] Esquema: ${detectedScheme === 'cool' ? '❄️ AZUL' : '🔥 VERMELHO'}`);
        
        // Apenas heatmap no export (sem boxes) - com esquema detectado
        drawHeat(ctx, state.points, outW, outH, detectedScheme);

        return canvas;
      };

      let pngBytes: Uint8Array;
      let width = 0;
      let height = 0;

      if (!abMode) {
        if (!A.imageBase64) throw new Error("Carregue uma imagem antes.");
        const c = await makeSingle("A");
        pngBytes = await canvasToPngBytes(c);
        width = c.width;
        height = c.height;
      } else {
        if (!A.imageBase64 || !B.imageBase64) throw new Error("Carregue A e B antes.");

        const cA = await makeSingle("A");
        const cB = await makeSingle("B");

        const gap = 24;

        const totalWRaw = cA.width + gap + cB.width;
        const totalHRaw = Math.max(cA.height, cB.height);

        const { w: totalW, h: totalH } = fitWithin(totalWRaw, totalHRaw, 1920, 1080);
        const scale = Math.min(1, totalW / totalWRaw, totalH / totalHRaw);

        const out = document.createElement("canvas");
        out.width = Math.max(1, Math.round(totalWRaw * scale));
        out.height = Math.max(1, Math.round(totalHRaw * scale));

        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("Falha ao criar canvas.");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);

        const wA = Math.round(cA.width * scale);
        const hA = Math.round(cA.height * scale);
        const wB = Math.round(cB.width * scale);
        const hB = Math.round(cB.height * scale);
        const g = Math.round(gap * scale);

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
      setStatus("Snapshot enviado para export.");
    } catch (e: any) {
      setError(e?.message || "Falha ao exportar snapshot.");
      setStatus("Erro");
    }
  }

  function fitWithin(w: number, h: number, maxW: number, maxH: number) {
    if (w <= 0 || h <= 0) return { w: 960, h: 540 };
    const s = Math.min(1, maxW / w, maxH / h);
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Falha ao carregar imagem."));
      img.src = src;
    });
  }

  // 🚀 OTIMIZAÇÃO: Redimensiona e comprime imagem antes de enviar
  async function optimizeImage(file: File, maxSize: number = 1024, quality: number = 0.85): Promise<{ bytes: Uint8Array; base64: string; width: number; height: number }> {
    // Carrega a imagem original
    const originalBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });

    const img = await loadImage(originalBase64);
    
    // Calcula novas dimensões mantendo aspect ratio
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    
    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    // Cria canvas e redimensiona
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Falha ao criar canvas");
    
    // Desenha imagem redimensionada
    ctx.drawImage(img, 0, 0, width, height);
    
    // Converte para JPEG comprimido
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error("Falha ao comprimir")),
        'image/jpeg',
        quality
      );
    });

    // Converte para Uint8Array
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Gera base64 otimizado
    const base64 = canvas.toDataURL('image/jpeg', quality);

    return { bytes, base64, width, height };
  }

  function drawHeat(ctx: CanvasRenderingContext2D, points: HeatmapPoint[], w: number, h: number, scheme?: 'warm' | 'cool') {
    // Validação: w e h devem ser válidos
    if (!w || !h || w <= 0 || h <= 0) {
      console.warn('drawHeat: Dimensões inválidas', { w, h });
      return;
    }
    
    // 🎨 Usa esquema passado como parâmetro ou o do estado
    const gradientColors = getHeatmapGradient(scheme || colorScheme);
    
    // Modo de blending normal
    ctx.globalCompositeOperation = 'source-over';
    
    // 🎨 Blur otimizado (28px)
    ctx.filter = 'blur(28px)';
    
    for (const p of points) {
      const x = (p.x / 100) * w;
      const y = (p.y / 100) * h;
      // ⚡ Intensidade mínima aumentada para 0.75 (mais visível)
      const intensity = Math.max(0.75, clamp01(Number(p.intensity ?? 0.75)));
      
      // 🎨 Raio otimizado (16%)
      const baseRadius = Math.max(1, Math.min(w, h) * 0.16 * intensity);
      
      // 8 blobs otimizado
      const numBlobs = 8;
      
      const flowDirection = (x * 0.17 + y * 0.17) % (Math.PI * 2);
      
      for (let i = 0; i < numBlobs; i++) {
        const progress = i / (numBlobs - 1);
        
        const spreadAngle = (i / numBlobs) * Math.PI * 2 + flowDirection;
        const spreadRadius = baseRadius * (0.4 + progress * 0.6) * (0.7 + Math.sin(i * 0.8) * 0.3);
        
        const offsetX = Math.cos(spreadAngle) * spreadRadius;
        const offsetY = Math.sin(spreadAngle) * spreadRadius;
        
        const blobX = x + offsetX;
        const blobY = y + offsetY;
        
        const sizeVariation = 0.5 + Math.sin(i * 1.5 + x * 0.02) * 0.4 + Math.cos(i * 2.0) * 0.4;
        const radius = Math.max(1, baseRadius * sizeVariation);
        
        const blobIntensity = intensity * (0.95 - progress * 0.25);

        if (radius <= 0) continue;
        
        ctx.save();
        
        // Scale mais uniforme
        const scaleX = 0.75 + Math.sin(i * 0.8) * 0.35;
        const scaleY = 0.75 + Math.cos(i * 0.9) * 0.35;
        
        ctx.translate(blobX, blobY);
        ctx.rotate(spreadAngle + i * 0.25);
        ctx.scale(scaleX, scaleY);
        
        // 🎨 Gradiente adaptativo (usa esquema detectado!)
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        
        gradientColors.forEach((colorStop, idx) => {
          const baseOpacity = idx === gradientColors.length - 1 ? 0 : 
                             [0.8, 0.65, 0.4][idx] || 0.5;
          const finalOpacity = baseOpacity * blobIntensity;
          const colorWithOpacity = colorStop.color.replace(/[\d.]+\)$/, `${finalOpacity})`);
          gradient.addColorStop(colorStop.stop, colorWithOpacity);
        });

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }
    
    // Remove filtro
    ctx.filter = 'none';
  }

  function drawBoxes(ctx: CanvasRenderingContext2D, boxes: BoundingBox[], w: number, h: number) {
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.002));
    ctx.strokeStyle = "rgba(40, 120, 255, 0.95)";

    for (const b of boxes) {
      const x1 = (b.xmin / 100) * w;
      const y1 = (b.ymin / 100) * h;
      const x2 = (b.xmax / 100) * w;
      const y2 = (b.ymax / 100) * h;
      
      // Desenha retângulo
      ctx.strokeRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));

      // Desenha label com confiança
      const label = b.label || "item";
      const confidence = Math.round((b.confidence || 0) * 100);
      const text = `${label} ${confidence}%`;

      // Configuração do texto
      const fontSize = Math.max(14, Math.round(w * 0.014));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      
      // Mede o texto
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const textHeight = fontSize;
      
      // Padding da caixinha
      const padX = 8;
      const padY = 5;
      
      // Posição da caixinha (acima da box)
      const labelX = x1;
      const labelY = y1 - textHeight - padY * 2 - 6;
      
      // Desenha caixinha azul de fundo
      ctx.fillStyle = "rgba(40, 120, 255, 0.95)";
      ctx.fillRect(labelX, labelY, textWidth + padX * 2, textHeight + padY * 2);
      
      // Desenha texto branco
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "top";
      ctx.fillText(text, labelX + padX, labelY + padY);
    }
  }

  function canvasToPngBytes(canvas: HTMLCanvasElement) {
    return new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(async blob => {
        try {
          if (!blob) return reject(new Error("Falha ao gerar PNG."));
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        } catch {
          reject(new Error("Falha ao converter PNG."));
        }
      }, "image/png");
    });
  }

  // Helper para desenhar heatmap nos canvas de votação
  // 🎨 HEATMAP OTIMIZADO - Sem Artefatos
  function drawHeatOnCanvas(ctx: CanvasRenderingContext2D, points: HeatmapPoint[], w: number, h: number, scheme?: 'warm' | 'cool') {
    // Validação: w e h devem ser válidos
    if (!w || !h || w <= 0 || h <= 0) {
      console.warn('drawHeatOnCanvas: Dimensões inválidas', { w, h });
      return;
    }
    
    // 🎨 Usa esquema passado como parâmetro ou o do estado
    const gradientColors = getHeatmapGradient(scheme || colorScheme);
    
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'blur(28px)'; // Otimizado
    
    for (const p of points) {
      const x = (p.x / 100) * w;
      const y = (p.y / 100) * h;
      // ⚡ Intensidade mínima aumentada para 0.75 (mais visível)
      const intensity = Math.max(0.75, clamp01(Number(p.intensity ?? 0.75)));
      
      const baseRadius = Math.max(1, Math.min(w, h) * 0.16 * intensity);
      const numBlobs = 8; // Otimizado
      const flowDirection = (x * 0.17 + y * 0.17) % (Math.PI * 2);
      
      for (let i = 0; i < numBlobs; i++) {
        const progress = i / (numBlobs - 1);
        
        const spreadAngle = (i / numBlobs) * Math.PI * 2 + flowDirection;
        const spreadRadius = baseRadius * (0.4 + progress * 0.6) * (0.7 + Math.sin(i * 0.8) * 0.3);
        
        const offsetX = Math.cos(spreadAngle) * spreadRadius;
        const offsetY = Math.sin(spreadAngle) * spreadRadius;
        
        const blobX = x + offsetX;
        const blobY = y + offsetY;
        
        const sizeVariation = 0.5 + Math.sin(i * 1.5 + x * 0.02) * 0.4 + Math.cos(i * 2.0) * 0.4;
        const radius = Math.max(1, baseRadius * sizeVariation);
        const blobIntensity = intensity * (0.95 - progress * 0.25);

        if (radius <= 0) continue;
        
        ctx.save();
        
        // Scale mais uniforme
        const scaleX = 0.75 + Math.sin(i * 0.8) * 0.35;
        const scaleY = 0.75 + Math.cos(i * 0.9) * 0.35;
        
        ctx.translate(blobX, blobY);
        ctx.rotate(spreadAngle + i * 0.25);
        ctx.scale(scaleX, scaleY);
        
        // 🎨 Gradiente adaptativo
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        
        gradientColors.forEach((colorStop, idx) => {
          const baseOpacity = idx === gradientColors.length - 1 ? 0 : 
                             [0.8, 0.65, 0.4][idx] || 0.5;
          const finalOpacity = baseOpacity * blobIntensity;
          const colorWithOpacity = colorStop.color.replace(/[\d.]+\)$/, `${finalOpacity})`);
          gradient.addColorStop(colorStop.stop, colorWithOpacity);
        });

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }
    
    ctx.filter = 'none';
  }

  return (
    <div className="wrap">
      <div className="top">
        <div>
          <div className="title">FigHeat</div>
          <div className="sub">Computer Vision Analysis</div>
        </div>
        <div className="pill">MVP</div>
      </div>

      <div className="field">
        <div className="label">API Base URL</div>
        <input
          className="input"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="http://localhost:3000"
        />
      </div>

      <button
        className="btnGhost"
        onClick={() => {
          setAbMode(v => !v);
          setStatus("Pronto");
          setError(null);
        }}
      >
        A/B mode: {abMode ? "ON" : "OFF"}
      </button>

      {!abMode && (
        <button
          className="btnGhost"
          onClick={() => {
            setTrainingMode(v => !v);
            setVotingResults(null);
            setStatus("Pronto");
          }}
        >
          🗳️ Training Mode: {trainingMode ? "ON" : "OFF"}
        </button>
      )}

      {!abMode && trainingMode && (
        <button
          className={`btnGhost ${quickMode ? 'btnGhostActive' : ''}`}
          onClick={() => {
            setQuickMode(v => !v);
            setStatus("Pronto");
          }}
        >
          ⚡ Quick Mode: {quickMode ? "ON (1024px)" : "OFF (original)"}
        </button>
      )}

      {/* Seletor de Modelo */}
      <div className="modelSelector">
        <div className="label">Modelo de IA</div>
        <div className="modelOptions">
          <button
            className={`modelOption ${selectedModel === 'gemini-2.0-flash' ? 'modelOptionActive' : ''}`}
            onClick={() => setSelectedModel('gemini-2.0-flash')}
          >
            <div className="modelName">⚡ Gemini 2.0 Flash</div>
            <div className="modelInfo">Rápido • $0.0015/análise</div>
            <div className="modelTime">⏱️ ~15-35s</div>
          </button>
          <button
            className={`modelOption ${selectedModel === 'gemini-3-pro' ? 'modelOptionActive' : ''}`}
            onClick={() => setSelectedModel('gemini-3-pro')}
          >
            <div className="modelName">🧠 Gemini 3 Pro</div>
            <div className="modelInfo">Avançado • $0.05/análise</div>
            <div className="modelTime">⏱️ ~60-90s (mais lento)</div>
          </button>
        </div>
      </div>

      {!abMode ? (
        <div className="drop">
          <input
            className="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e => pickFile("A", e.target.files?.[0] || null)}
          />
          <div className="dropInner">
            <div className="dropTitle">Clique para enviar uma imagem</div>
            <div className="dropHint">PNG, JPG, WEBP</div>
          </div>
        </div>
      ) : (
        <div className="row2">
          <div className="drop">
            <input
              className="file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => pickFile("A", e.target.files?.[0] || null)}
            />
            <div className="dropInner">
              <div className="dropTitle">Upload A</div>
              <div className="dropHint">PNG, JPG, WEBP</div>
            </div>
          </div>

          <div className="drop">
            <input
              className="file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => pickFile("B", e.target.files?.[0] || null)}
            />
            <div className="dropInner">
              <div className="dropTitle">Upload B</div>
              <div className="dropHint">PNG, JPG, WEBP</div>
            </div>
          </div>
        </div>
      )}

      <button 
        className="btn" 
        onClick={trainingMode && !abMode ? analyzeWithVoting : analyze}
        disabled={!!analysisController}
      >
        {abMode ? "Analyze A|B" : trainingMode ? "🗳️ Analyze & Vote" : "Analyze"}
      </button>

      {/* 🔥 NOVO: Botão Cancelar (só aparece durante análise) */}
      {analysisController && (
        <button 
          className="btnGhost" 
          onClick={cancelAnalysis}
          style={{ 
            borderColor: '#ef4444', 
            color: '#dc2626',
            fontWeight: 800 
          }}
        >
          ❌ Cancelar Análise
        </button>
      )}

      <button className="btnGhost" onClick={exportSnapshotPng}>
        Export snapshot (PNG)
      </button>

      <button className="btnGhost" onClick={resetAll}>
        New image
      </button>

      <div className={`status ${error ? "statusErr" : ""}`}>
        {error ? `Erro: ${error}` : status}
      </div>

      {/* Interface de Votação */}
      {votingResults && A.imageBase64 && (
        <div className="voting">
          <div className="votingTitle">🗳️ Vote na melhor análise:</div>
          
          <div className="votingOptions">
            {/* Opção A */}
            <div className="votingOption">
              <div className="votingLabel">
                Opção A
                <span className="votingType">(Conservative)</span>
                {votingResults.optionA.insights && (
                  <span className={`votingScore ${votingResults.optionA.insights.score >= 80 ? 'scoreHigh' : votingResults.optionA.insights.score >= 60 ? 'scoreMedium' : 'scoreLow'}`}>
                    {votingResults.optionA.insights.score}/100
                  </span>
                )}
              </div>
              <div className="votingCanvas">
                <img 
                  src={A.imageBase64} 
                  alt="preview" 
                  style={{width: '100%', height: 'auto'}}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const canvas = canvasVoteARef.current;
                    if (!canvas) return;
                    
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    
                    // 🎨 Detecta cores e desenha heatmap da opção A
                    const schemeA = detectDominantColor(img);
                    const points = votingResults.optionA.heatmapPoints;
                    drawHeatOnCanvas(ctx, points, canvas.width, canvas.height, schemeA);
                  }}
                />
                <canvas ref={canvasVoteARef} style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }} />
              </div>
              <div className="votingStats">
                • {votingResults.optionA.heatmapPoints.length} pontos
                • {votingResults.optionA.boundingBoxes.length} elementos
              </div>
              <button 
                className="btn votingBtn"
                onClick={() => submitVote('A')}
              >
                ✅ Votar em A
              </button>
            </div>

            {/* Opção B */}
            <div className="votingOption">
              <div className="votingLabel">
                Opção B
                <span className="votingType">(Creative)</span>
                {votingResults.optionB.insights && (
                  <span className={`votingScore ${votingResults.optionB.insights.score >= 80 ? 'scoreHigh' : votingResults.optionB.insights.score >= 60 ? 'scoreMedium' : 'scoreLow'}`}>
                    {votingResults.optionB.insights.score}/100
                  </span>
                )}
              </div>
              <div className="votingCanvas">
                <img 
                  src={A.imageBase64} 
                  alt="preview" 
                  style={{width: '100%', height: 'auto'}}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const canvas = canvasVoteBRef.current;
                    if (!canvas) return;
                    
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    
                    // 🎨 Detecta cores e desenha heatmap da opção B
                    const schemeB = detectDominantColor(img);
                    const points = votingResults.optionB.heatmapPoints;
                    drawHeatOnCanvas(ctx, points, canvas.width, canvas.height, schemeB);
                  }}
                />
                <canvas ref={canvasVoteBRef} style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }} />
              </div>
              <div className="votingStats">
                • {votingResults.optionB.heatmapPoints.length} pontos
                • {votingResults.optionB.boundingBoxes.length} elementos
              </div>
              <button 
                className="btn votingBtn"
                onClick={() => submitVote('B')}
              >
                ✅ Votar em B
              </button>
            </div>
          </div>

          <button 
            className="btnGhost"
            onClick={() => {
              setVotingResults(null);
              setStatus("Votação cancelada");
            }}
          >
            ❌ Cancelar (nenhuma é boa)
          </button>
        </div>
      )}

      {/* Painel de Insights */}
      {selectedInsights && !votingResults && (
        <div className="insights">
          <div className="insightsHeader">
            <div className="insightsTitle">🧠 Análise Inteligente</div>
            <div className="insightsScore">
              <div className="scoreLabel">Score de Atenção</div>
              <div className={`scoreValue ${selectedInsights.score >= 80 ? 'scoreHigh' : selectedInsights.score >= 60 ? 'scoreMedium' : 'scoreLow'}`}>
                {selectedInsights.score}/100
              </div>
            </div>
          </div>
          
          <div className="insightsList">
            {selectedInsights.insights.map((insight, idx) => (
              <div key={idx} className={`insightCard insight${insight.type.charAt(0).toUpperCase() + insight.type.slice(1)}`}>
                <div className="insightIcon">
                  {insight.type === 'success' && '✅'}
                  {insight.type === 'warning' && '⚠️'}
                  {insight.type === 'info' && 'ℹ️'}
                  {insight.type === 'suggestion' && '💡'}
                </div>
                <div className="insightContent">
                  <div className="insightTitle">{insight.title}</div>
                  <div className="insightMessage">{insight.message}</div>
                </div>
              </div>
            ))}
          </div>
          
          <button 
            className="btnGhost"
            onClick={() => setSelectedInsights(null)}
          >
            Fechar Insights
          </button>
        </div>
      )}

      {/* Fallback: Sempre mostra resultado após votar (mesmo sem insights) */}
      {!votingResults && !selectedInsights && trainingMode && A.imageBase64 && (
        <div className="summary" style={{ marginTop: '20px', border: '2px solid #4CAF50', padding: '15px' }}>
          <div className="summaryTitle" style={{ color: '#4CAF50' }}>✅ Voto Registrado!</div>
          <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            {A.points.length > 0 || A.boxes.length > 0 ? (
              <>
                A análise selecionada está sendo exibida acima.
                <div className="summaryStats" style={{ marginTop: '10px' }}>
                  <div className="stat">
                    <span className="statLabel">Heatmap Points:</span>
                    <span className="statValue">{A.points.length}</span>
                  </div>
                  <div className="stat">
                    <span className="statLabel">Elementos UI:</span>
                    <span className="statValue">{A.boxes.length}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#ff9800' }}>
                ⚠️ Aguardando renderização da análise...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Painel de Resumo */}
      {!abMode && A.imageBase64 && (A.points.length > 0 || A.boxes.length > 0) && (
        <div className="summary">
          <div className="summaryTitle">Resumo da Análise</div>
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
              <div className="summaryListTitle">Top Elementos:</div>
              {A.boxes
                .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
                .slice(0, 5)
                .map((box, i) => (
                  <div key={i} className="summaryItem">
                    <span className="summaryItemLabel">{box.label || "item"}</span>
                    <span className="summaryItemConf">{Math.round((box.confidence || 0) * 100)}%</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {abMode && (A.imageBase64 || B.imageBase64) && (
        <div className="summary">
          <div className="summaryTitle">Resumo da Análise A/B</div>
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
                    <span className="statLabel">Elementos:</span>
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
                    <span className="statLabel">Elementos:</span>
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
  );
}

createRoot(document.getElementById("react-page")!).render(<App />);