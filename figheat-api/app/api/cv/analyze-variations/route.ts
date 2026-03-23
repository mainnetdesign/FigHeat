/**
 * FigHeat API - Computer Vision Analysis Endpoint
 * 
 * Based on CV Heatmap Explorer (MIT License)
 * Enhanced and transformed by Mainnet Design (2026)
 * 
 * @author Mainnet Design
 * @website https://mainnet.design
 * @license MIT
 */

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import { join } from "path";

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
  ).max(25).describe("Maximum 25 UI elements for speed"),
  heatmapPoints: z.array(
    z.object({
      x: z.number().describe("Normalized X (0-100)"),
      y: z.number().describe("Normalized Y (0-100)"),
      intensity: z.number().describe("Intensity 0-1")
    })
  ).max(60).describe("Maximum 60 heatmap points for quality and speed")
});

// Tipos para Insights
type Insight = {
  type: 'success' | 'warning' | 'info' | 'suggestion';
  title: string;
  message: string;
  priority: number; // 1-5 (5 = mais importante)
};

type AnalysisInsights = {
  score: number; // 0-100
  insights: Insight[];
};

// Tipos para Token Usage Logging
type TokenUsageLog = {
  timestamp: string;
  requestId: string;
  optionA: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    temperature: number;
    model: string;
    promptType: 'conservative';
    estimatedCost: number; // em USD
  };
  optionB: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    temperature: number;
    model: string;
    promptType: 'creative';
    estimatedCost: number;
  };
  totalCost: number;
  imageSize: number; // em bytes
  executionTime: number; // em ms
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Model",
};

// Preços por 1M tokens
const GEMINI_PRICING = {
  "gemini-2.0-flash": {
    input: 0.075,   // $0.075 por 1M tokens
    output: 0.30,   // $0.30 por 1M tokens
  },
  "gemini-3-pro": {
    input: 2.00,    // $2.00 por 1M tokens
    output: 12.00,  // $12.00 por 1M tokens
  }
};

// Função para calcular custo estimado
function calculateCost(promptTokens: number, completionTokens: number, model: string): number {
  const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING] || GEMINI_PRICING["gemini-2.0-flash"];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

// Função para salvar log de tokens
async function saveTokenUsageLog(log: TokenUsageLog) {
  try {
    const logsDir = join(process.cwd(), 'token-usage-logs');
    const logFile = join(logsDir, 'usage.jsonl');
    
    // Cria o diretório se não existir
    const { mkdir } = await import('fs/promises');
    await mkdir(logsDir, { recursive: true });
    
    // Adiciona o log no formato JSONL (uma linha por log)
    const logLine = JSON.stringify(log) + '\n';
    const { appendFile } = await import('fs/promises');
    await appendFile(logFile, logLine);
    
    console.log(`💰 Token usage logged: ${log.totalCost.toFixed(6)} USD`);
  } catch (error) {
    console.error('Failed to save token usage log:', error);
  }
}

// Gera insights acionáveis baseados nos dados do heatmap
function generateInsights(
  heatmapPoints: Array<{ x: number; y: number; intensity: number }>,
  boundingBoxes: Array<{ xmin: number; ymin: number; xmax: number; ymax: number; confidence: number; label: string }>
): AnalysisInsights {
  const insights: Insight[] = [];
  
  // 1. Calcula score geral de atenção visual (0-100)
  const avgIntensity = heatmapPoints.reduce((sum, p) => sum + p.intensity, 0) / heatmapPoints.length;
  const score = Math.round(avgIntensity * 100);
  
  // 2. Analisa distribuição de atenção por regiões
  const topThird = heatmapPoints.filter(p => p.y < 33.33);
  const middleThird = heatmapPoints.filter(p => p.y >= 33.33 && p.y < 66.66);
  const bottomThird = heatmapPoints.filter(p => p.y >= 66.66);
  
  const topIntensity = topThird.reduce((sum, p) => sum + p.intensity, 0) / (topThird.length || 1);
  const middleIntensity = middleThird.reduce((sum, p) => sum + p.intensity, 0) / (middleThird.length || 1);
  const bottomIntensity = bottomThird.reduce((sum, p) => sum + p.intensity, 0) / (bottomThird.length || 1);
  
  // 3. Identifica CTAs e elementos importantes
  const ctaBoxes = boundingBoxes.filter(b => 
    b.label.toLowerCase().includes('button') || 
    b.label.toLowerCase().includes('cta') ||
    b.label.toLowerCase().includes('button')
  );
  
  const headlineBoxes = boundingBoxes.filter(b => 
    b.label.toLowerCase().includes('headline') || 
    b.label.toLowerCase().includes('title') ||
    b.label.toLowerCase().includes('heading') ||
    b.label.toLowerCase().includes('headline')
  );
  
  // 4. Analisa atenção em CTAs
  ctaBoxes.forEach(cta => {
    const ctaPoints = heatmapPoints.filter(p =>
      p.x >= cta.xmin && p.x <= cta.xmax &&
      p.y >= cta.ymin && p.y <= cta.ymax
    );
    
    const ctaAttention = ctaPoints.reduce((sum, p) => sum + p.intensity, 0) / (ctaPoints.length || 1);
    
    if (ctaAttention < 0.6) {
      insights.push({
        type: 'warning',
        title: `CTA with low attention: "${cta.label}"`,
        message: `This button is receiving only ${Math.round(ctaAttention * 100)}% attention. Consider increasing contrast, size, or repositioning to a more visible area.`,
        priority: 5
      });
    } else if (ctaAttention > 0.85) {
      insights.push({
        type: 'success',
        title: `Well-positioned CTA: "${cta.label}"`,
        message: `Excellent! This button is capturing ${Math.round(ctaAttention * 100)}% of visual attention.`,
        priority: 2
      });
    }
  });
  
  // 5. Analisa headlines
  headlineBoxes.forEach(headline => {
    const headlinePoints = heatmapPoints.filter(p =>
      p.x >= headline.xmin && p.x <= headline.xmax &&
      p.y >= headline.ymin && p.y <= headline.ymax
    );
    
    const headlineAttention = headlinePoints.reduce((sum, p) => sum + p.intensity, 0) / (headlinePoints.length || 1);
    
    if (headlineAttention < 0.7) {
      insights.push({
        type: 'warning',
        title: `Headline with low attention: "${headline.label}"`,
        message: `Your headline is receiving only ${Math.round(headlineAttention * 100)}% attention. Consider increasing font size or improving contrast.`,
        priority: 4
      });
    }
  });
  
  // 6. Analisa distribuição vertical de atenção
  if (topIntensity > 0.8 && bottomIntensity < 0.5) {
    insights.push({
      type: 'info',
      title: 'Attention concentrated at top',
      message: `${Math.round(topIntensity * 100)}% of attention is at the top of the page. If you have important content below, consider adding visual indicators or arrows to guide the eye.`,
      priority: 3
    });
  }
  
  if (bottomIntensity > 0.7) {
    insights.push({
      type: 'success',
      title: 'Good vertical distribution',
      message: 'Users are scanning the entire page, including the footer. Take advantage to include secondary CTAs.',
      priority: 2
    });
  }
  
  // 7. Detecta competição por atenção
  const highAttentionBoxes = boundingBoxes.filter(b => b.confidence > 0.8);
  if (highAttentionBoxes.length > 5) {
    // Verifica se há boxes muito próximas competindo
    for (let i = 0; i < highAttentionBoxes.length; i++) {
      for (let j = i + 1; j < highAttentionBoxes.length; j++) {
        const box1 = highAttentionBoxes[i];
        const box2 = highAttentionBoxes[j];
        
        // Calcula distância entre centros
        const centerX1 = (box1.xmin + box1.xmax) / 2;
        const centerY1 = (box1.ymin + box1.ymax) / 2;
        const centerX2 = (box2.xmin + box2.xmax) / 2;
        const centerY2 = (box2.ymin + box2.ymax) / 2;
        
        const distance = Math.sqrt(Math.pow(centerX2 - centerX1, 2) + Math.pow(centerY2 - centerY1, 2));
        
        if (distance < 20) {
          insights.push({
            type: 'suggestion',
            title: 'Elements competing for attention',
            message: `"${box1.label}" and "${box2.label}" are very close and may be competing for user attention. Consider increasing spacing.`,
            priority: 4
          });
          break; // Só reporta um caso para não poluir
        }
      }
    }
  }
  
  // 8. Analisa densidade de pontos (identifica áreas ignoradas)
  const leftHalf = heatmapPoints.filter(p => p.x < 50);
  const rightHalf = heatmapPoints.filter(p => p.x >= 50);
  
  const leftIntensity = leftHalf.reduce((sum, p) => sum + p.intensity, 0) / (leftHalf.length || 1);
  const rightIntensity = rightHalf.reduce((sum, p) => sum + p.intensity, 0) / (rightHalf.length || 1);
  
  if (Math.abs(leftIntensity - rightIntensity) > 0.3) {
    const strongerSide = leftIntensity > rightIntensity ? 'left' : 'right';
    const weakerSide = leftIntensity > rightIntensity ? 'right' : 'left';
    
    insights.push({
      type: 'suggestion',
      title: 'Horizontal attention imbalance',
      message: `The ${strongerSide} side is receiving much more attention than the ${weakerSide}. Consider balancing visual elements.`,
      priority: 3
    });
  }
  
  // 9. Score feedback geral
  if (score >= 80) {
    insights.push({
      type: 'success',
      title: 'Excellent attention design!',
      message: 'Your design is capturing user visual attention very well. Keep it up!',
      priority: 1
    });
  } else if (score < 60) {
    insights.push({
      type: 'warning',
      title: 'Low attention score',
      message: 'Your design may have weak or poorly positioned elements. Review contrast, visual hierarchy, and positioning.',
      priority: 5
    });
  }
  
  // Ordena por prioridade (maior primeiro)
  insights.sort((a, b) => b.priority - a.priority);
  
  return { score, insights };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    let buffer: Buffer;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image") as File;
      if (!file) return new Response("No image", { status: 400, headers: corsHeaders });
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const arrayBuffer = await req.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return new Response("Empty body", { status: 400, headers: corsHeaders });
      }
      buffer = Buffer.from(arrayBuffer);
    }

    const voteId = randomUUID();
    const startTime = Date.now();
    
    // Lê o modelo selecionado do header (default: gemini-2.0-flash)
    const selectedModel = req.headers.get("X-Model") || "gemini-2.0-flash";
    // ✅ CORRIGIDO: Usa o modelo correto do Gemini 3 Pro
    const modelName = selectedModel === "gemini-3-pro" ? "gemini-3-pro-preview" : "gemini-2.0-flash";
    
    console.log(`🤖 Using model: ${selectedModel} (${modelName})`);

    // Prompt conservador (foca em elementos principais) - apenas landing pages
    const promptConservative = `This tool is designed ONLY for LANDING PAGES (conversion-focused single-page or hero sections). Analyze the image as a LANDING PAGE and generate a professional eye-tracking heatmap like Hotjar/Attention Insight. Do not optimize for e-commerce product grids, login screens, dashboards, or other page types.

⚠️ CONSERVATIVE APPROACH - FOCUSED HEATMAP (landing page):
- Generate 25-35 strategic heatmap points (quality over quantity)
- Focus 80% on PRIMARY elements: CTAs, Headlines, Hero Images, Prices
- 20% on SECONDARY elements: Navigation, Icons
- Use realistic eye-tracking patterns with natural clusters
- Intensity range: 0.5-1.0 for good contrast

🎯 CONSERVATIVE APPROACH - HIGH PRECISION on key elements:

🔴 MAXIMUM ATTENTION - PRIMARY FOCUS (50% of points, intensity 0.90-1.0):
✓ PRIMARY CTA buttons: 3-4 points EACH (RED HOT, tightly clustered)
  - Intensity: 0.95-1.0
✓ Hero headline: 3-4 points (main message)
  - Intensity: 0.88-0.95
✓ Hero Image/Product: 4-5 points (focal point)
  - Intensity: 0.85-0.92
✓ PRICING numbers: 2-3 points EACH
  - Intensity: 0.90-0.98

🟠 HIGH ATTENTION - SECONDARY (30% of points, intensity 0.55-0.75):
✓ Secondary buttons: 2-3 points EACH
✓ Navigation items: 1-2 points total (not each!)
✓ Secondary headlines: 2-3 points
✓ Key features: 1-2 points each

🟡 LOW ATTENTION - TERTIARY (20% of points, intensity 0.25-0.45):
✓ Body text: 1-2 points TOTAL (cold)
✓ Footer: 1 point MAX (very cold)
✓ Background elements: NO POINTS

⚠️ REMEMBER: LESS IS MORE!
- Most of the image should be COLD (no points)
- Tight clusters ONLY on important elements
- Allow natural gaps and cold zones

🔬 CLUSTERING RULES:
- EACH button = ONE tight cluster (points within 3-4% of button bounds)
- EACH price = ONE focused cluster (points on/around number)
- NO scattered points in empty space
- NO overlapping clusters from different elements
- Points must be ON the element, not nearby

📐 QUALITY GUIDELINES:
- Focus 80% of points on PRIMARY elements (CTAs/Headlines/Hero)
- CTAs should have high intensity (0.9-1.0) for RED HOT effect
- Body/Footer can have lower intensity (0.3-0.5) for COLD areas
- Keep large cold areas for professional look
- Cluster points tightly on key elements

BOUNDING BOXES: Identify main UI elements with confidence >= 0.80.
PRIORITY: Buttons, prices, headlines, logo, navigation.

Return normalized coordinates 0-100.`;

    // Prompt criativo (explora mais o design) - apenas landing pages
    const promptCreative = `This tool is designed ONLY for LANDING PAGES (conversion-focused single-page or hero sections). Analyze the image as a LANDING PAGE and generate a comprehensive eye-tracking heatmap like Hotjar/Attention Insight. Do not optimize for e-commerce product grids, login screens, dashboards, or other page types.

⚠️ CREATIVE APPROACH - COMPREHENSIVE HEATMAP (landing page):
- Generate 40-55 heatmap points for full coverage
- Cover PRIMARY (70%) and SECONDARY (30%) elements
- Include CTAs, Headlines, Hero Images, Prices, Navigation, Features, Badges
- Generate natural, realistic eye-tracking patterns
- Intensity range: 0.4-1.0 for excellent visual contrast

🎨 CREATIVE APPROACH - COMPREHENSIVE coverage:

🔴 MAXIMUM ATTENTION - PRIMARY FOCUS (45% of points, intensity 0.88-1.0):
✓ ALL CTA buttons: 4-5 points EACH (RED HOT)
  - Tight cluster on button
  - Intensity: 0.92-1.0
✓ ALL pricing numbers: 3-4 points EACH
  - Focused on number
  - Intensity: 0.88-0.96
  - Intensity: 0.92-0.98
✓ Hero/main headline: 12-15 points across full headline
  - Points on EACH significant word
  - Intensity: 0.92-0.98
✓ Logo + brand name: 6-8 points
  - Intensity: 0.90-0.95
✓ "Save $X" or discount badges: 5-6 points EACH
  - Intensity: 0.90-0.95

🟠 HIGH ATTENTION - Interactive & key elements (35% of points, intensity 0.75-0.91):
✓ Navigation menu items: 3-4 points EACH visible item
✓ Pricing tier names (FOUNDER, START-UP, GROWTH, 50K): 5-6 points EACH
✓ Toggle switches (Billed monthly/yearly): 5-6 points
✓ Secondary headlines/subheadings: 4-5 points each
✓ Feature checkmarks/icons: 2 points EACH
✓ Social proof (testimonials, logos): 3-4 points each

🟡 MEDIUM ATTENTION - Content areas (15% of points, intensity 0.55-0.74):
✓ Feature list text: 2-3 points EACH feature line
✓ Description paragraphs: 2-3 points per paragraph
✓ Trust badges/certifications: 2-3 points each
✓ Secondary images/icons: 2-3 points each

🟢 LOW ATTENTION (5% of points, intensity 0.45-0.54):
✓ Footer links: 1-2 points per section
✓ Legal text: 1 point
✓ Decorative elements: 1 point each

🔬 CLUSTERING RULES:
- EACH button = ONE dense cluster (10-12 points within button bounds)
- EACH price = ONE focused cluster (8-10 points on/around number)
- Points must be PRECISELY ON the element
- NO random scatter in empty/white space
- Clusters should NOT overlap each other
- Natural slight variation in position (±2-3 units) for organic feel

📐 QUALITY GUIDELINES:
- Cover all important UI elements comprehensively
- Each CTA button should have multiple points (3-5)
- Include points on prices, headlines, navigation, features, badges
- Use clear intensity gradient (0.4-1.0) for visual contrast
- Avoid floating points in empty space
- Natural clustering around elements

BOUNDING BOXES: Identify UI elements with confidence >= 0.75.
INCLUDE: Buttons, prices, headlines, navigation, feature sections, badges.

Return normalized coordinates 0-100.`;

    // Híbrido: modo votação mantém temperatura > 0 para A e B diferentes
    // Executa as duas gerações em paralelo para reduzir a latência total.
    console.log("Generating Option A (Conservative)...");
    console.log("Generating Option B (Creative)...");
    const [resultA, resultB] = await Promise.all([
      generateObject({
        model: google(modelName),
        temperature: 0.3,
        maxOutputTokens: 3072, // ⚡ Balanceado: qualidade + velocidade
        schema,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptConservative },
              { type: "image", image: buffer }
            ]
          }
        ]
      }),
      generateObject({
        model: google(modelName),
        temperature: 0.6, // Reduzido de 0.9 para 0.6 (mais consistente)
        maxOutputTokens: 3072, // ⚡ Balanceado: qualidade + velocidade
        schema,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptCreative },
              { type: "image", image: buffer }
            ]
          }
        ]
      })
    ]);

    // ✨ QUALIDADE MÁXIMA: Usa resultado do Gemini sem modificações
    const optionA = resultA.object;
    console.log(`📊 Opção A: ${optionA.heatmapPoints.length} pontos, ${optionA.boundingBoxes.length} boxes`);

    // ✨ QUALIDADE MÁXIMA: Usa resultado do Gemini sem modificações
    const optionB = resultB.object;
    console.log(`📊 Opção B: ${optionB.heatmapPoints.length} pontos, ${optionB.boundingBoxes.length} boxes`);

    // Gera insights para ambas as opções
    console.log('🧠 Gerando insights...');
    const insightsA = generateInsights(optionA.heatmapPoints, optionA.boundingBoxes);
    const insightsB = generateInsights(optionB.heatmapPoints, optionB.boundingBoxes);
    console.log(`✅ Insights A: Score ${insightsA.score}, ${insightsA.insights.length} insights`);
    console.log(`✅ Insights B: Score ${insightsB.score}, ${insightsB.insights.length} insights`);

    // Captura dados de uso de tokens
    const executionTime = Date.now() - startTime;
    // O tipo do SDK para `usage` nem sempre expõe `promptTokens`, então tratamos com segurança.
    const usageA = (resultA.usage ?? {}) as any;
    const usageB = (resultB.usage ?? {}) as any;

    const promptTokensA =
      usageA.promptTokens ?? Math.max(0, (usageA.totalTokens ?? 0) - (usageA.completionTokens ?? 0));
    const completionTokensA = usageA.completionTokens ?? 0;
    const totalTokensA = usageA.totalTokens ?? promptTokensA + completionTokensA;

    const promptTokensB =
      usageB.promptTokens ?? Math.max(0, (usageB.totalTokens ?? 0) - (usageB.completionTokens ?? 0));
    const completionTokensB = usageB.completionTokens ?? 0;
    const totalTokensB = usageB.totalTokens ?? promptTokensB + completionTokensB;
    
    // Calcula custos com base no modelo selecionado (com validação)
    const costA = calculateCost(
      promptTokensA,
      completionTokensA,
      selectedModel
    );
    const costB = calculateCost(
      promptTokensB,
      completionTokensB,
      selectedModel
    );
    const totalCost = (isNaN(costA) ? 0 : costA) + (isNaN(costB) ? 0 : costB);
    
    // Cria log de uso de tokens (com validação de valores)
    const tokenLog: TokenUsageLog = {
      timestamp: new Date().toISOString(),
      requestId: voteId,
      optionA: {
        promptTokens: promptTokensA,
        completionTokens: completionTokensA,
        totalTokens: totalTokensA,
        temperature: 0.3,
        model: selectedModel,
        promptType: 'conservative',
        estimatedCost: isNaN(costA) ? 0 : costA,
      },
      optionB: {
        promptTokens: promptTokensB,
        completionTokens: completionTokensB,
        totalTokens: totalTokensB,
        temperature: 0.6,
        model: selectedModel,
        promptType: 'creative',
        estimatedCost: isNaN(costB) ? 0 : costB,
      },
      totalCost: isNaN(totalCost) ? 0 : totalCost,
      imageSize: buffer.length,
      executionTime,
    };
    
    // Salva o log (não bloqueia a resposta)
    saveTokenUsageLog(tokenLog).catch(err => 
      console.error('Failed to save token log:', err)
    );
    
    // Log no console para debug (com validação)
    console.log('📊 Token Usage Summary:');
    console.log(`   Model: ${selectedModel}`);
    const costAFormatted = isNaN(costA) ? '0.000000' : costA.toFixed(6);
    const costBFormatted = isNaN(costB) ? '0.000000' : costB.toFixed(6);
    const totalCostFormatted = isNaN(totalCost) ? '0.000000' : totalCost.toFixed(6);
    console.log(`   Option A: ${totalTokensA} tokens (~$${costAFormatted})`);
    console.log(`   Option B: ${totalTokensB} tokens (~$${costBFormatted})`);
    console.log(`   Total: ${totalTokensA + totalTokensB} tokens (~$${totalCostFormatted})`);
    console.log(`   Execution Time: ${executionTime}ms`);
    console.log(`   Image Size: ${(buffer.length / 1024).toFixed(2)} KB`);

    return Response.json({
      voteId,
      optionA: {
        ...optionA,
        insights: insightsA,
        metadata: { type: "conservative", temperature: 0.3 }
      },
      optionB: {
        ...optionB,
        insights: insightsB,
        metadata: { type: "creative", temperature: 0.9 }
      },
      timestamp: Date.now(),
      // Adiciona informações de uso (opcional, para debug)
      debug: {
        totalTokens: usageA.totalTokens + usageB.totalTokens,
        estimatedCost: totalCost,
        executionTime,
      }
    }, {
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Analysis failed:", error);
    let message = error instanceof Error ? error.message : "Analysis failed";
    if (message.includes("did not match schema") || message.includes("No object generated")) {
      message = "Gemini returned an unexpected format. Try again with a smaller or simpler image.";
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// Helper: Densifica heatmap se poucos pontos
function densifyHeatmap(
  points: Array<{ x: number; y: number; intensity: number }>,
  boxes: Array<{ xmin: number; ymin: number; xmax: number; ymax: number; confidence: number; label: string }>
) {
  const densified = [...points];
  
  // Classifica elementos por importância
  const isCTA = (label: string) => /button|cta|get started|sign up|buy|subscribe|start/i.test(label);
  const isPrice = (label: string) => /price|\$|€|£|pricing|cost|plan|tier/i.test(label);
  const isHeadline = (label: string) => /headline|title|hero|heading|h1|main text/i.test(label);
  
  boxes.forEach(box => {
    const pointsInBox = points.filter(p => 
      p.x >= box.xmin && p.x <= box.xmax &&
      p.y >= box.ymin && p.y <= box.ymax
    );
    
    // Define mínimo de pontos - 🔥 VERSÃO PROFISSIONAL (menos pontos)
    let minPoints = 2; // Padrão: poucos pontos
    let baseIntensity = Math.min(0.85, box.confidence);
    
    if (isCTA(box.label)) {
      minPoints = 3; // CTAs: 3-4 pontos apenas
      baseIntensity = 0.95;
    } else if (isPrice(box.label)) {
      minPoints = 2; // Preços: 2-3 pontos
      baseIntensity = 0.90;
    } else if (isHeadline(box.label)) {
      minPoints = 3; // Headlines: 3-4 pontos
      baseIntensity = 0.88;
    }
    
    if (pointsInBox.length < minPoints) {
      const centerX = (box.xmin + box.xmax) / 2;
      const centerY = (box.ymin + box.ymax) / 2;
      const width = box.xmax - box.xmin;
      const height = box.ymax - box.ymin;
      
      // Calcula quantos pontos adicionar
      const pointsToAdd = minPoints - pointsInBox.length;
      
      for (let i = 0; i < pointsToAdd; i++) {
        // Distribui pontos organicamente dentro do elemento
        const angle = (i / pointsToAdd) * Math.PI * 2;
        const radiusX = width * 0.3 * (0.5 + Math.random() * 0.5);
        const radiusY = height * 0.3 * (0.5 + Math.random() * 0.5);
        
        densified.push({
          x: Math.max(box.xmin, Math.min(box.xmax, centerX + Math.cos(angle) * radiusX)),
          y: Math.max(box.ymin, Math.min(box.ymax, centerY + Math.sin(angle) * radiusY)),
          intensity: Math.max(0.6, baseIntensity - (i * 0.03))
        });
      }
      
      console.log(`  + Adicionou ${pointsToAdd} pontos em "${box.label}" (tipo: ${isCTA(box.label) ? 'CTA' : isPrice(box.label) ? 'Price' : 'UI'})`);
    }
  });
  
  return densified;
}

// Helper: Normaliza intensidades - 🔥 VERSÃO PROFISSIONAL
// Range 0.25-1.0 para permitir áreas FRIAS (cold zones)
function normalizeIntensities(points: Array<{ x: number; y: number; intensity: number }>) {
  const intensities = points.map(p => p.intensity || 0.7);
  const minIntensity = Math.min(...intensities);
  const maxIntensity = Math.max(...intensities);
  const range = maxIntensity - minIntensity || 1;
  
  return points.map(p => {
    // Normaliza para 0.25-1.0 - permite CONTRASTE EXTREMO (cold vs hot)
    const normalized = range > 0 
      ? 0.25 + ((p.intensity || 0.7) - minIntensity) / range * 0.75
      : 0.62;
    return {
      ...p,
      intensity: Math.max(0.25, Math.min(1.0, normalized))
    };
  });
}

// Helper: Normaliza intensidades para Creative - 🔥 CONTRASTE MÁXIMO
// Range 0.20-1.0 para permitir áreas MUITO FRIAS
function normalizeIntensitiesCreative(points: Array<{ x: number; y: number; intensity: number }>) {
  const intensities = points.map(p => p.intensity || 0.7);
  const minIntensity = Math.min(...intensities);
  const maxIntensity = Math.max(...intensities);
  const range = maxIntensity - minIntensity || 1;
  
  return points.map(p => {
    // Normaliza para 0.20-1.0 - CONTRASTE EXTREMO profissional
    const normalized = range > 0
      ? 0.20 + ((p.intensity || 0.7) - minIntensity) / range * 0.80
      : 0.60;
    return {
      ...p,
      intensity: Math.max(0.20, Math.min(1.0, normalized))
    };
  });
}
