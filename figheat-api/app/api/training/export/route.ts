import { readFileSync, existsSync } from "fs";
import { join } from "path";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * GET /api/training/export
 * Exporta votes.jsonl no formato pronto para fine-tuning (input/output).
 * Retorna JSONL para download: figheat-training.jsonl
 */
export async function GET() {
  try {
    const trainingDir = join(process.cwd(), "training-data");
    const votesFile = join(trainingDir, "votes.jsonl");

    if (!existsSync(votesFile)) {
      return Response.json(
        { error: "No votes file found. Collect votes first." },
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = readFileSync(votesFile, "utf8");
    const lines = content.trim().split("\n").filter((line: string) => line);
    const votes = lines.map((line: string) => JSON.parse(line));

    const trainingData: Array<{ input: { imageHash: string; dimensions: { w: number; h: number } }; output: unknown }> = [];
    for (const vote of votes) {
      const chosen = vote.result?.chosen;
      if (!chosen || !vote.options?.[chosen]) continue;
      const winner = vote.options[chosen];
      trainingData.push({
        input: {
          imageHash: vote.image?.hash ?? "",
          dimensions: vote.image?.dimensions ?? { w: 0, h: 0 },
        },
        output: winner,
      });
    }

    const jsonl = trainingData.map((item) => JSON.stringify(item)).join("\n");

    return new Response(jsonl, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": 'attachment; filename="figheat-training.jsonl"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Export failed";
    return Response.json(
      { error: message },
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
