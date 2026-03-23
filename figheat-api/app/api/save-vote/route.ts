import { existsSync } from "fs";
import { mkdir, appendFile, readFile } from "fs/promises";
import { join } from "path";

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
    const vote = await req.json();

    // Cria pasta training-data se não existir
    const trainingDir = join(process.cwd(), "training-data");
    if (!existsSync(trainingDir)) {
      await mkdir(trainingDir, { recursive: true });
    }

    // Arquivo de votos
    const votesFile = join(trainingDir, "votes.jsonl");

    // Estrutura do voto
    const voteEntry = {
      id: vote.voteId,
      timestamp: Date.now(),
      image: {
        hash: vote.imageHash,
        dimensions: vote.imageDimensions,
      },
      options: {
        A: vote.optionA,
        B: vote.optionB,
      },
      result: {
        chosen: vote.chosenOption,
        rejected: vote.chosenOption === "A" ? "B" : "A",
      },
      metadata: vote.userFeedback || {},
    };

    // Append ao arquivo JSONL sem bloquear o event loop
    await appendFile(votesFile, JSON.stringify(voteEntry) + "\n");

    // Conta total de votos sem travar a rota
    const content = await readFile(votesFile, "utf8");
    const voteCount = content.trim() ? content.trim().split("\n").length : 0;

    console.log(`✅ Vote saved! Total votes: ${voteCount}`);

    return Response.json({
      success: true,
      voteCount,
      message: `Vote registered successfully! Total: ${voteCount}`,
    }, {
      headers: corsHeaders,
    });
  } catch (error: any) {
    console.error("Failed to save vote:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// Endpoint para ver estatísticas
export async function GET() {
  try {
    const trainingDir = join(process.cwd(), "training-data");
    const votesFile = join(trainingDir, "votes.jsonl");

    if (!existsSync(votesFile)) {
      return Response.json({
        totalVotes: 0,
        optionAWins: 0,
        optionBWins: 0,
        readyForTraining: false,
      }, { headers: corsHeaders });
    }

    const content = await readFile(votesFile, "utf8");
    const votes = content
      .trim()
      .split("\n")
      .filter((line: string) => line)
      .map((line: string) => JSON.parse(line));

    const optionAWins = votes.filter((v: any) => v.result.chosen === "A").length;
    const optionBWins = votes.filter((v: any) => v.result.chosen === "B").length;

    return Response.json({
      totalVotes: votes.length,
      optionAWins,
      optionBWins,
      percentageA: ((optionAWins / votes.length) * 100).toFixed(1),
      percentageB: ((optionBWins / votes.length) * 100).toFixed(1),
      readyForTraining: votes.length >= 50,
      message: votes.length >= 50 
        ? "✅ Ready for fine-tuning!" 
        : `${50 - votes.length} more votes needed`,
    }, { headers: corsHeaders });
  } catch (error: any) {
    return Response.json({ error: error.message }, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
