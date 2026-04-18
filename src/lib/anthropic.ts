import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

let _client: Anthropic | null = null;

export function anthropic() {
  if (_client) return _client;
  const key = env.anthropicApiKey();
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before calling the agent.",
    );
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export const AGENT_MODEL = env.anthropicModel();
