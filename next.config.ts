import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // kuzu-wasm pulls in tiny-worker / threads which expect Node semantics at
  // runtime — bundling them breaks the server build. Keep them as runtime
  // externals so they resolve from node_modules/ at request time.
  serverExternalPackages: ["kuzu-wasm", "tiny-worker", "threads"],
};

export default nextConfig;
