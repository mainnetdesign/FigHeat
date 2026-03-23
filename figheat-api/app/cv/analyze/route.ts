import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const schema = z.object({
  boundingBoxes: z.array(
    z.object({
      label: z.string(),
      ymin: z.number(),
      xmin: z.number(),
      ymax: z.number(),
      xmax: z.number(),
      confidence: z.number(),
    })
  ),
  heatmapPoints: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      intensity: z.number(),
    })
  ),
});

export async function GET() {
  return new Response("ok");
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return new Response("Missing GOOGLE_GENERATIVE_AI_API_KEY", { status: 500 });
    }

    const googleAI = createGoogleGenerativeAI({ apiKey });

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

    const result = await generateObject({
      model: googleAI("gemini-2.0-flash"),
      schema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this UI/landing page image and generate a professional UX attention heatmap.

HEATMAP GENERATION (CRITICAL - Follow exactly):
Generate 35-50 heatmap points with DENSE CLUSTERS in important areas.

IMPORTANT: Create TIGHT CLUSTERS (4-8 points very close together) for each important element:

1. HIGH attention areas (intensity 0.8-1.0):
   - Hero text/headline: Generate 5-7 points in cluster (x±5, y±5 variation)
   - Primary CTA button: Generate 4-6 points in tight cluster (x±3, y±3)
   - Main product/image: Generate 6-10 points clustered densely (x±8, y±8)
   - Logo: Generate 3-4 points clustered (x±3, y±3)

2. MEDIUM attention (intensity 0.6-0.75):
   - Secondary CTAs: 3-5 points per button (x±4, y±4)
   - Subheadings: 3-4 points per text block (x±5, y±5)
   - Navigation items: 2-3 points per item (x±3, y±3)

3. LOW attention (intensity 0.3-0.5):
   - Secondary elements: 1-2 points sparse
   - Footer: 1-2 points very sparse

CLUSTERING RULES (MUST FOLLOW):
- Each important element = 1 dense cluster of multiple points
- Points in same cluster must be VERY CLOSE (within 5-10 units)
- Higher intensity points = tighter clusters
- Example cluster: [{x:50,y:30,i:0.9}, {x:52,y:31,i:0.88}, {x:48,y:32,i:0.85}, {x:51,y:28,i:0.82}]

BOUNDING BOXES:
Identify 5-12 main UI elements (buttons, images, text blocks, CTAs).

Return normalized coordinates 0-100.`,
            },
            { type: "image", image: buffer },
          ],
        },
      ],
    });

    return Response.json(result.object);
  } catch (error) {
    console.error("Analysis failed:", error);
    return new Response("Analysis failed", { status: 500 });
  }
}
