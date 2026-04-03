// ============================================================
// POST /api/agent - Main Agent Pipeline (SSE Streaming)
// Receives a task, streams decision events back to the client
// ============================================================

import { NextRequest } from "next/server";
import { executePipeline } from "@/lib/pipeline";
import { PipelineConfig, StreamEvent } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    task,
    budget = 5.0,
    priority = "balanced",
    riskTolerance = "medium",
  } = body as {
    task: string;
    budget?: number;
    priority?: PipelineConfig["priority"];
    riskTolerance?: PipelineConfig["riskTolerance"];
  };

  if (!task || typeof task !== "string") {
    return new Response(JSON.stringify({ error: "Task is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config: PipelineConfig = {
    budget,
    priority,
    riskTolerance,
    maxSteps: 10,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: StreamEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      try {
        await executePipeline(task, config, sendEvent);
      } catch (err) {
        sendEvent({
          type: "error",
          timestamp: new Date().toISOString(),
          data: {
            message:
              err instanceof Error ? err.message : "Pipeline execution failed",
          },
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
