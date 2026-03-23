import { streamText, UIMessage, convertToModelMessages } from "ai";
// Allow streaming responses up to 30 seconds
export const maxDuration = 30;
export async function POST(req: Request) {
  const {
    messages,
    model,
    webSearch,
  }: {
    messages: UIMessage[];
    model: string;
    webSearch: boolean;
  } = await req.json();

  console.log("params: ", { model, webSearch, messages });

  const result = streamText({
    model: webSearch ? "perplexity/sonar" : model,
    messages: convertToModelMessages(messages),
    providerOptions: {
      openai: {
        reasoningSummary: "detailed", // 'auto' for condensed or 'detailed' for comprehensive
      },
    },
    system:
      "You are a helpful assistant that can answer questions and help with tasks",
  });

  console.log("")

  // send sources and reasoning back to the client
  const res = result.toUIMessageStreamResponse({
    sendSources: true,
    sendReasoning: true,
  });

  console.log("result.fullStream", result.fullStream);

  return res;
}
