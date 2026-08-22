import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Lean, self-contained server build for the Docker/Fly.io image.
  output: "standalone",
};

export default nextConfig;
