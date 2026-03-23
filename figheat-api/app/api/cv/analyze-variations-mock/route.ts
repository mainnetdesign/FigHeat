import { NextResponse } from "next/server";

/**
 * MOCK: Endpoint de votação para desenvolvimento
 * Retorna 2 variações diferentes de heatmap (Conservative vs Creative)
 */

// Dados mock - Variação Conservadora (menos pontos, mais focado)
const mockDataConservative = {
  heatmapPoints: [
    // Área do hero/título principal (alta atenção)
    { x: 0.50, y: 0.15, intensity: 0.95 },
    { x: 0.48, y: 0.16, intensity: 0.90 },
    { x: 0.52, y: 0.14, intensity: 0.88 },
    { x: 0.51, y: 0.17, intensity: 0.85 },
    { x: 0.49, y: 0.13, intensity: 0.82 },
    
    // Área CTA principal (alta atenção)
    { x: 0.50, y: 0.35, intensity: 0.92 },
    { x: 0.48, y: 0.36, intensity: 0.88 },
    { x: 0.52, y: 0.34, intensity: 0.85 },
    
    // Imagem/visual principal (média-alta atenção)
    { x: 0.50, y: 0.55, intensity: 0.75 },
    { x: 0.45, y: 0.53, intensity: 0.70 },
    { x: 0.55, y: 0.57, intensity: 0.68 },
    
    // Benefícios/features (média atenção)
    { x: 0.30, y: 0.70, intensity: 0.60 },
    { x: 0.50, y: 0.72, intensity: 0.58 },
    { x: 0.70, y: 0.68, intensity: 0.55 },
    
    // Footer/rodapé (baixa atenção)
    { x: 0.50, y: 0.90, intensity: 0.35 },
  ],
  boundingBoxes: [
    {
      label: "Hero Title",
      x1: 0.25, y1: 0.08,
      x2: 0.75, y2: 0.22,
      confidence: 0.95
    },
    {
      label: "CTA Button",
      x1: 0.40, y1: 0.30,
      x2: 0.60, y2: 0.40,
      confidence: 0.92
    },
    {
      label: "Hero Image",
      x1: 0.30, y1: 0.45,
      x2: 0.70, y2: 0.65,
      confidence: 0.88
    }
  ]
};

// Dados mock - Variação Criativa (mais pontos, mais exploratória)
const mockDataCreative = {
  heatmapPoints: [
    // Área do hero/título (distribuição mais ampla)
    { x: 0.50, y: 0.15, intensity: 0.92 },
    { x: 0.45, y: 0.16, intensity: 0.88 },
    { x: 0.55, y: 0.14, intensity: 0.85 },
    { x: 0.48, y: 0.18, intensity: 0.82 },
    { x: 0.52, y: 0.12, intensity: 0.80 },
    { x: 0.42, y: 0.15, intensity: 0.75 },
    { x: 0.58, y: 0.16, intensity: 0.73 },
    
    // Logo/marca (atenção adicional)
    { x: 0.15, y: 0.08, intensity: 0.70 },
    { x: 0.18, y: 0.09, intensity: 0.65 },
    
    // CTA principal (mais disperso)
    { x: 0.50, y: 0.35, intensity: 0.90 },
    { x: 0.47, y: 0.36, intensity: 0.85 },
    { x: 0.53, y: 0.34, intensity: 0.82 },
    { x: 0.50, y: 0.38, intensity: 0.78 },
    
    // Imagem principal (mais pontos)
    { x: 0.50, y: 0.55, intensity: 0.80 },
    { x: 0.40, y: 0.52, intensity: 0.75 },
    { x: 0.60, y: 0.58, intensity: 0.72 },
    { x: 0.48, y: 0.60, intensity: 0.68 },
    { x: 0.52, y: 0.50, intensity: 0.65 },
    
    // Benefícios (mais distribuído)
    { x: 0.25, y: 0.70, intensity: 0.65 },
    { x: 0.50, y: 0.72, intensity: 0.62 },
    { x: 0.75, y: 0.68, intensity: 0.60 },
    { x: 0.30, y: 0.75, intensity: 0.55 },
    { x: 0.70, y: 0.73, intensity: 0.53 },
    
    // Menu/navegação (atenção secundária)
    { x: 0.80, y: 0.08, intensity: 0.58 },
    { x: 0.85, y: 0.09, intensity: 0.55 },
    
    // Seção social proof
    { x: 0.35, y: 0.82, intensity: 0.50 },
    { x: 0.50, y: 0.84, intensity: 0.48 },
    { x: 0.65, y: 0.80, intensity: 0.45 },
    
    // Footer (baixa mas presente)
    { x: 0.50, y: 0.92, intensity: 0.40 },
    { x: 0.30, y: 0.94, intensity: 0.35 },
    { x: 0.70, y: 0.90, intensity: 0.33 },
  ],
  boundingBoxes: [
    {
      label: "Logo",
      x1: 0.05, y1: 0.03,
      x2: 0.25, y2: 0.13,
      confidence: 0.88
    },
    {
      label: "Hero Title",
      x1: 0.20, y1: 0.08,
      x2: 0.80, y2: 0.22,
      confidence: 0.94
    },
    {
      label: "CTA Button",
      x1: 0.38, y1: 0.28,
      x2: 0.62, y2: 0.42,
      confidence: 0.91
    },
    {
      label: "Hero Image",
      x1: 0.25, y1: 0.45,
      x2: 0.75, y2: 0.65,
      confidence: 0.89
    },
    {
      label: "Features",
      x1: 0.15, y1: 0.68,
      x2: 0.85, y2: 0.78,
      confidence: 0.85
    }
  ]
};

export async function POST(req: Request) {
  try {
    console.log("🎭 MOCK: Generating voting variations...");
    
    // Simula delay de processamento real
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const voteId = `vote_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    console.log(`✅ MOCK: Generated variations (ID: ${voteId})`);
    
    return NextResponse.json({
      success: true,
      voteId,
      optionA: mockDataConservative,
      optionB: mockDataCreative,
      timestamp: Date.now()
    });
    
  } catch (error: any) {
    console.error("❌ MOCK Error:", error);
    return NextResponse.json(
      { error: error.message || "Mock analysis failed" },
      { status: 500 }
    );
  }
}
