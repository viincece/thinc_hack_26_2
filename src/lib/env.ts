function required(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) {
    throw new Error(`Missing env var ${name}`);
  }
  return v;
}

export const env = {
  manexApiUrl: () => required("MANEX_API_URL"),
  manexApiKey: () => required("MANEX_API_KEY"),
  manexImageBase: () => required("MANEX_IMAGE_BASE"),
  manexPgUrl: () => process.env.MANEX_PG_URL,
  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY,
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
};
