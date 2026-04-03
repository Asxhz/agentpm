// ============================================================
// POST /api/multiagent - Multi-Agent Economy Simulation (SSE)
// ============================================================

import { NextRequest } from "next/server";
import { runMultiAgentEconomy } from "@/lib/multiagent";
import { StreamEvent } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { scenario = "launch-campaign" } = body as { scenario?: string };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await runMultiAgentEconomy(scenario, sendEvent);
      } catch (err) {
        sendEvent({
          type: "error",
          timestamp: new Date().toISOString(),
          data: { message: err instanceof Error ? err.message : "Simulation failed" },
        });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
