import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 500 });
    }

    // Lista todos os modelos disponíveis
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    const data = await response.json();
    
    // Filtra apenas modelos que suportam generateContent
    const generateContentModels = data.models?.filter((model: any) => 
      model.supportedGenerationMethods?.includes('generateContent')
    ) || [];

    return NextResponse.json({
      totalModels: data.models?.length || 0,
      generateContentModels: generateContentModels.map((m: any) => ({
        name: m.name,
        displayName: m.displayName,
        description: m.description,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
