import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // kuzu-wasm pulls in tiny-worker / threads which expect Node semantics at
  // runtime — bundling them breaks the server build. Keep them as runtime
  // externals so they resolve from node_modules/ at request time.
  serverExternalPackages: ["kuzu-wasm", "tiny-worker", "threads"],

  // Vercel's serverless bundler only packages files it statically traces
  // from the route's imports. kuzu-wasm spawns a worker via
  // `require(...kuzu_wasm_worker.js)` at runtime, which the tracer can't
  // see — so the deployed function crashes with "Cannot find module".
  // We explicitly whitelist the packages that matter, plus the JSONL
  // event log the KG client replays on cold start.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/kuzu-wasm/**/*",
      "./node_modules/tiny-worker/**/*",
      "./node_modules/threads/**/*",
      "./wiki/**/*",
    ],
  },
};

export default nextConfig;
