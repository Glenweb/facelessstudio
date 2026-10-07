import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite + pg ship native/wasm assets that must not be bundled by Turbopack/webpack.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // instrumentation.ts is picked up automatically in Next 16; the render
  // worker boots from there in the Node.js runtime.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
