import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, AGENT_MODEL } from "@/lib/anthropic";
import { SYSTEM_PROMPT } from "@/lib/agent/system";
import { TOOLS, runTool, type UiEvent } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ChatMessage = {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlockParam[];
};

type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "text_done" }
  | { type: "tool_use"; id: string; name: string; input: unknown; purpose?: string }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "ui"; event: UiEvent }
  | { type: "error"; message: string }
  | { type: "done" };

function sseWrite(
  controller: ReadableStreamDefaultController<Uint8Array>,
  enc: TextEncoder,
  event: AgentEvent,
) {
  controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function summarize(result: unknown): string {
  try {
    const s = JSON.stringify(result);
    return s.length > 400 ? s.slice(0, 397) + "..." : s;
  } catch {
    return String(result);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "messages[] required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incoming: ChatMessage[] = body.messages;
  const extraSystem =
    typeof body.contextNote === "string" && body.contextNote.length > 0
      ? `\n\nIncident context (from the engineer's open workspace):\n${body.contextNote}`
      : "";

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => sseWrite(controller, enc, e);

      let client: ReturnType<typeof anthropic>;
      try {
        client = anthropic();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emit({ type: "error", message: msg });
        emit({ type: "done" });
        controller.close();
        return;
      }

      // Working transcript that we extend as the tool loop runs.
      const working: Anthropic.MessageParam[] = incoming.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const systemBlocks: Anthropic.TextBlockParam[] = [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ];
      if (extraSystem) {
        systemBlocks.push({ type: "text", text: extraSystem });
      }

      try {
        // Hard cap on tool-use iterations. 16 gives auto-draft enough rope
        // to visit every section without risking a runaway loop.
        for (let turn = 0; turn < 16; turn++) {
          const resp = await client.messages.create({
            model: AGENT_MODEL,
            max_tokens: 4096,
            system: systemBlocks,
            tools: TOOLS,
            messages: working,
            stream: true,
          });

          const toolUses: Anthropic.ToolUseBlock[] = [];
          const assistantBlocks: Anthropic.ContentBlock[] = [];
          const textBuffers = new Map<number, string>();
          const toolInputBuffers = new Map<number, string>();
          const blockIndex = new Map<number, { type: "text" | "tool_use" }>();
          let stopReason: string | null = null;

          for await (const chunk of resp) {
            if (chunk.type === "content_block_start") {
              const b = chunk.content_block;
              if (b.type === "text") {
                blockIndex.set(chunk.index, { type: "text" });
                textBuffers.set(chunk.index, "");
              } else if (b.type === "tool_use") {
                blockIndex.set(chunk.index, { type: "tool_use" });
                toolInputBuffers.set(chunk.index, "");
                assistantBlocks[chunk.index] = b as Anthropic.ContentBlock;
              }
            } else if (chunk.type === "content_block_delta") {
              const d = chunk.delta;
              if (d.type === "text_delta") {
                textBuffers.set(
                  chunk.index,
                  (textBuffers.get(chunk.index) ?? "") + d.text,
                );
                emit({ type: "text_delta", text: d.text });
              } else if (d.type === "input_json_delta") {
                toolInputBuffers.set(
                  chunk.index,
                  (toolInputBuffers.get(chunk.index) ?? "") + d.partial_json,
                );
              }
            } else if (chunk.type === "content_block_stop") {
              const kind = blockIndex.get(chunk.index);
              if (kind?.type === "text") {
                const text = textBuffers.get(chunk.index) ?? "";
                assistantBlocks[chunk.index] = {
                  type: "text",
                  text,
                  citations: null,
                } as Anthropic.ContentBlock;
                emit({ type: "text_done" });
              } else if (kind?.type === "tool_use") {
                const raw = toolInputBuffers.get(chunk.index) ?? "";
                let parsed: unknown = {};
                try {
                  parsed = raw ? JSON.parse(raw) : {};
                } catch {
                  parsed = { __raw: raw };
                }
                const skeleton = assistantBlocks[chunk.index] as
                  | Anthropic.ToolUseBlock
                  | undefined;
                if (skeleton) {
                  skeleton.input = parsed as Record<string, unknown>;
                  toolUses.push(skeleton);
                }
              }
            } else if (chunk.type === "message_delta") {
              if (chunk.delta.stop_reason) stopReason = chunk.delta.stop_reason;
            }
          }

          // Compact the assistant blocks array (drop any holes).
          const assistantContent = assistantBlocks.filter(
            Boolean,
          ) as Anthropic.ContentBlock[];
          working.push({ role: "assistant", content: assistantContent });

          if (stopReason !== "tool_use" || toolUses.length === 0) {
            break;
          }

          // Execute every tool call the model requested and send the results back.
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const input = (tu.input ?? {}) as Record<string, unknown>;
            const purpose =
              typeof input.purpose === "string" ? input.purpose : undefined;
            emit({
              type: "tool_use",
              id: tu.id,
              name: tu.name,
              input,
              purpose,
            });

            const result = await runTool(tu.name, input);

            if (result.ok && result.ui_event) {
              emit({ type: "ui", event: result.ui_event });
            }

            emit({
              type: "tool_result",
              id: tu.id,
              ok: result.ok,
              summary: result.ok
                ? summarize(result.data)
                : `error: ${result.error}`,
            });

            const payload = result.ok
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error });
            const capped =
              payload.length > 60_000
                ? payload.slice(0, 60_000) + '..."__truncated":true}'
                : payload;

            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: capped,
              is_error: !result.ok,
            });
          }

          working.push({ role: "user", content: toolResults });
        }

        emit({ type: "done" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emit({ type: "error", message: msg });
        emit({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
