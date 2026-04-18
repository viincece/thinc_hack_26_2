import OpenAI from "openai";
import { env } from "@/lib/env";

let _client: OpenAI | null = null;
function client() {
  if (_client) return _client;
  const key = env.openaiApiKey();
  if (!key) return null;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

/**
 * Embed a list of short strings. Returns an array of vectors, or an array of
 * nulls when no OpenAI key is configured. Callers must handle the null case —
 * the knowledge graph degrades to FTS + structural search without vectors.
 */
export async function embedMany(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const c = client();
  if (!c) return texts.map(() => null);
  const res = await c.embeddings.create({
    model: env.openaiEmbedModel(),
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

export async function embed(text: string): Promise<number[] | null> {
  const [v] = await embedMany([text]);
  return v ?? null;
}

export function cosine(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}
