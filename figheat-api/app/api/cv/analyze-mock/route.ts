// Rota mock para desenvolvimento (sem depender da API do Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    // Simula processamento
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Dados mockados realistas para heatmap de UX
    const mockData = {
      heatmapPoints: [
        // Header/Logo área (topo esquerdo)
        { x: 15, y: 8, intensity: 0.85 },
        { x: 18, y: 10, intensity: 0.75 },
        { x: 12, y: 12, intensity: 0.70 },
        
        // Navigation menu (topo centro)
        { x: 45, y: 10, intensity: 0.65 },
        { x: 55, y: 10, intensity: 0.60 },
        { x: 65, y: 10, intensity: 0.62 },
        
        // CTA principal (topo direito)
        { x: 85, y: 10, intensity: 0.95 },
        { x: 88, y: 12, intensity: 0.90 },
        { x: 82, y: 8, intensity: 0.85 },
        
        // Hero headline (centro-esquerdo)
        { x: 25, y: 35, intensity: 0.95 },
        { x: 30, y: 37, intensity: 0.90 },
        { x: 35, y: 39, intensity: 0.85 },
        { x: 28, y: 42, intensity: 0.80 },
        { x: 32, y: 44, intensity: 0.75 },
        
        // Secondary CTA (centro)
        { x: 60, y: 35, intensity: 0.88 },
        { x: 62, y: 37, intensity: 0.82 },
        
        // Produto/Imagem principal (centro)
        { x: 50, y: 55, intensity: 0.92 },
        { x: 45, y: 58, intensity: 0.88 },
        { x: 55, y: 60, intensity: 0.85 },
        { x: 48, y: 62, intensity: 0.80 },
        { x: 52, y: 65, intensity: 0.78 },
        
        // Imagem Before (esquerda inferior)
        { x: 30, y: 75, intensity: 0.85 },
        { x: 28, y: 78, intensity: 0.80 },
        { x: 32, y: 80, intensity: 0.82 },
        { x: 30, y: 82, intensity: 0.78 },
        
        // Imagem After (direita inferior)
        { x: 70, y: 75, intensity: 0.90 },
        { x: 68, y: 78, intensity: 0.88 },
        { x: 72, y: 80, intensity: 0.85 },
        { x: 70, y: 82, intensity: 0.83 },
        
        // CTA secundário (meio)
        { x: 40, y: 50, intensity: 0.70 },
        { x: 45, y: 52, intensity: 0.68 },
        
        // Área de texto (disperso)
        { x: 20, y: 60, intensity: 0.45 },
        { x: 35, y: 68, intensity: 0.50 },
        { x: 55, y: 45, intensity: 0.48 },
        { x: 65, y: 70, intensity: 0.42 },
        
        // Footer elements (baixo)
        { x: 25, y: 92, intensity: 0.35 },
        { x: 50, y: 94, intensity: 0.30 },
        { x: 75, y: 93, intensity: 0.32 },
      ],
      boundingBoxes: [
        { label: "Logo", xmin: 10, ymin: 5, xmax: 20, ymax: 15, confidence: 0.95 },
        { label: "Navigation", xmin: 40, ymin: 8, xmax: 70, ymax: 12, confidence: 0.88 },
        { label: "Primary CTA", xmin: 80, ymin: 7, xmax: 92, ymax: 13, confidence: 0.92 },
        { label: "Hero Title", xmin: 20, ymin: 30, xmax: 45, ymax: 48, confidence: 0.94 },
        { label: "Hero Image", xmin: 40, ymin: 50, xmax: 60, ymax: 70, confidence: 0.90 },
        { label: "Phone Before", xmin: 23, ymin: 72, xmax: 37, ymax: 88, confidence: 0.87 },
        { label: "Phone After", xmin: 63, ymin: 72, xmax: 77, ymax: 88, confidence: 0.89 },
        { label: "Secondary CTA", xmin: 55, ymin: 33, xmax: 68, ymax: 39, confidence: 0.85 },
      ]
    };

    return Response.json(mockData, { headers: corsHeaders });
  } catch (error: any) {
    console.error("Mock analysis failed:", error);
    return new Response("Mock analysis failed", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
