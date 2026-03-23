import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const schema = z.object({
  boundingBoxes: z.array(
    z.object({
      label: z.string(),
      ymin: z.number().describe("Normalized Y (0-100) top"),
      xmin: z.number().describe("Normalized X (0-100) left"),
      ymax: z.number().describe("Normalized Y (0-100) bottom"),
      xmax: z.number().describe("Normalized X (0-100) right"),
      confidence: z.number().describe("Confidence 0-1")
    })
  ),
  heatmapPoints: z.array(
    z.object({
      x: z.number().describe("Normalized X (0-100)"),
      y: z.number().describe("Normalized Y (0-100)"),
      intensity: z.number().describe("Intensity 0-1")
    })
  )
});
// Headers CORS para permitir requisições do Figma Plugin
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Model",
};

const ANALYZE_TIMEOUT_MS = 90_000; // Tempo mais alinhado ao Flash
// Usa mesma temperatura do modo votação (opção A conservative) para consistência
const ANALYZE_TEMPERATURE: number | undefined = 0.3;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Analysis timeout: Gemini took too long to respond.")), ms)
  );
  return Promise.race([promise, timeout]);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing GOOGLE_GENERATIVE_AI_API_KEY. Set it in .env.local." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let buffer: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return new Response("No file provided", { status: 400 });
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const arrayBuffer = await req.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return new Response("Empty body", { status: 400 });
      }
      buffer = Buffer.from(arrayBuffer);
    }

    if (buffer.length < 1024) {
      return new Response(
        JSON.stringify({ error: "Invalid image payload. Send a real image file, not a tiny or empty buffer." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modelo selecionado no plugin (Quick Mode / A/B / Analyze)
    const selectedModel = req.headers.get("X-Model") || "gemini-2.0-flash";
    const modelName = selectedModel === "gemini-3-pro" ? "gemini-3-pro-preview" : "gemini-2.0-flash";

    const result = await withTimeout(
      generateObject({
        model: google(modelName),
        ...(ANALYZE_TEMPERATURE !== undefined && { temperature: ANALYZE_TEMPERATURE }),
        maxOutputTokens: 1024,
        schema,
        messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this landing page only. Return a compact, high-quality eye-tracking heatmap.

Rules:
- 25-35 heatmap points
- Focus on CTA, headline, hero image, price, logo
- Use tight clusters and natural gaps
- Keep intensity between 0.5 and 1.0
- Identify key UI elements with confidence >= 0.80
- Return normalized coordinates 0-100`
            },
            { type: "image", image: buffer }
          ]
        }
      ]
      }),
      ANALYZE_TIMEOUT_MS
    );

    // 🧠 SISTEMA INTELIGENTE DE VALIDAÇÃO E CORREÇÃO
    let { heatmapPoints, boundingBoxes } = result.object;
    
    console.log(`📊 IA gerou ${heatmapPoints.length} pontos, ${boundingBoxes.length} boxes`);
    
    // 1. Validação de quantidade
    const errors = [];
    if (heatmapPoints.length < 50) errors.push(`Poucos pontos (${heatmapPoints.length})`);
    if (heatmapPoints.length > 100) errors.push(`Muitos pontos (${heatmapPoints.length})`);
    if (boundingBoxes.length < 5) errors.push(`Poucas boxes (${boundingBoxes.length})`);
    
    // 2. Validação de intensidades
    const invalidIntensities = heatmapPoints.filter(p => p.intensity < 0.5 || p.intensity > 1.0);
    if (invalidIntensities.length > 0) {
      errors.push(`${invalidIntensities.length} pontos com intensidade inválida`);
    }
    
    // 3. Validação de coordenadas
    const outOfBounds = heatmapPoints.filter(p => 
      p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100
    );
    if (outOfBounds.length > 0) {
      errors.push(`${outOfBounds.length} pontos fora dos limites`);
    }
    
    // 4. Detecção de pontos isolados foi movida para o modo de refinamento.
    // Mantemos a rota principal leve para respeitar o tempo do Flash.
    const isolatedPoints: number[] = [];
    
    // 5. Validação de distribuição de intensidade
    const highIntensity = heatmapPoints.filter(p => p.intensity >= 0.85).length;
    const mediumIntensity = heatmapPoints.filter(p => p.intensity >= 0.65 && p.intensity < 0.85).length;
    const lowIntensity = heatmapPoints.filter(p => p.intensity < 0.65).length;
    
    const total = heatmapPoints.length;
    const highPercent = (highIntensity / total) * 100;
    const mediumPercent = (mediumIntensity / total) * 100;
    
    if (highPercent < 30 || highPercent > 55) {
      errors.push(`Distribuição de hotspots anormal: ${highPercent.toFixed(0)}%`);
    }
    
    console.log(`📈 Distribuição: Alta=${highIntensity} (${highPercent.toFixed(0)}%), Média=${mediumIntensity} (${mediumPercent.toFixed(0)}%), Baixa=${lowIntensity}`);
    
    // 6. Validação de bounding boxes
    const invalidBoxes = boundingBoxes.filter(b => 
      b.xmin >= b.xmax || b.ymin >= b.ymax || b.confidence < 0.5
    );
    if (invalidBoxes.length > 0) {
      errors.push(`${invalidBoxes.length} boxes inválidas`);
    }
    
    // 🔧 CORREÇÕES AUTOMÁTICAS
    if (errors.length > 0) {
      console.warn('⚠️ Erros detectados:', errors.join(', '));
      console.log('🔧 Aplicando correções automáticas...');
      
      // Corrigir intensidades
      heatmapPoints = normalizeIntensities(heatmapPoints);
      
      // Corrigir coordenadas fora dos limites
      heatmapPoints = heatmapPoints.map(p => ({
        x: Math.max(0, Math.min(100, p.x)),
        y: Math.max(0, Math.min(100, p.y)),
        intensity: p.intensity
      }));
      
      // Densificar se necessário
      if (heatmapPoints.length < 50) {
        console.log('🔧 Densificando pontos...');
        heatmapPoints = densifyHeatmap(heatmapPoints, boundingBoxes);
      }
      
      // Filtrar boxes inválidas
      boundingBoxes = boundingBoxes.filter(b => 
        b.xmin < b.xmax && b.ymin < b.ymax && b.confidence >= 0.5
      );
      
      console.log(`✅ Correções aplicadas: ${heatmapPoints.length} pontos, ${boundingBoxes.length} boxes`);
    } else {
      console.log('✅ Validação passou! Dados corretos.');
    }
    
    console.log(`✅ Final: ${heatmapPoints.length} pontos, ${boundingBoxes.length} boxes`);

    return Response.json(
      { 
        heatmapPoints, 
        boundingBoxes,
        metadata: {
          totalPoints: heatmapPoints.length,
          totalBoxes: boundingBoxes.length,
          errors: errors.length > 0 ? errors : undefined,
          distribution: {
            high: highIntensity,
            medium: mediumIntensity,
            low: lowIntensity
          }
        }
      },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    let message = error instanceof Error ? error.message : "Analysis failed";
    if (message.includes("could not parse") || message.includes("No object generated")) {
      message = "Gemini returned an unexpected format. Try another image or a smaller size.";
    }
    const isTimeout = message.includes("timeout");
    console.error("Analysis failed:", error);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// Helper: Densifica heatmap se poucos pontos
function densifyHeatmap(
  points: Array<{ x: number; y: number; intensity: number }>,
  boxes: Array<{ xmin: number; ymin: number; xmax: number; ymax: number; confidence: number; label: string }>
) {
  const densified = [...points];
  
  // Para cada bounding box, garante cluster mínimo
  boxes.forEach(box => {
    // Verifica quantos pontos existem nesta área
    const pointsInBox = points.filter(p => 
      p.x >= box.xmin && p.x <= box.xmax &&
      p.y >= box.ymin && p.y <= box.ymax
    );
    
    if (pointsInBox.length < 5) {
      // Adiciona pontos extras no centro da box
      const centerX = (box.xmin + box.xmax) / 2;
      const centerY = (box.ymin + box.ymax) / 2;
      const baseIntensity = Math.min(0.95, box.confidence + 0.1);
      
      // Cluster gaussiano de 5-8 pontos
      const pointsToAdd = 7 - pointsInBox.length;
      for (let i = 0; i < pointsToAdd; i++) {
        densified.push({
          x: centerX + (Math.random() - 0.5) * 8,
          y: centerY + (Math.random() - 0.5) * 8,
          intensity: Math.max(0.5, baseIntensity - (i * 0.05))
        });
      }
      
      console.log(`  + Adicionou ${pointsToAdd} pontos em "${box.label}"`);
    }
  });
  
  return densified;
}

// Helper: Normaliza intensidades (mínimo 0.5, máximo 1.0)
function normalizeIntensities(points: Array<{ x: number; y: number; intensity: number }>) {
  return points.map(p => ({
    ...p,
    intensity: Math.max(0.5, Math.min(1.0, p.intensity || 0.7))
  }));
}

