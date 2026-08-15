import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next 16 refuses dev-only chunks to any origin it was not started on. served on
  // 127.0.0.1 the client bundle is blocked, react never hydrates, and every control on
  // the page renders correctly while doing nothing.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
