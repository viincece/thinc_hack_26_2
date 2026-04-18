import type { AgentEvent } from "./types";

/**
 * Parse a fetch Response streaming `text/event-stream` into AgentEvents.
 * Expects every event to be a `data: {json}\n\n` line.
 */
export async function* readSse(
  response: Response,
): AsyncGenerator<AgentEvent, void, unknown> {
  if (!response.body) throw new Error("No response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trimStart();
          if (!payload) continue;
          try {
            yield JSON.parse(payload) as AgentEvent;
          } catch {
            // ignore malformed line
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
