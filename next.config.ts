import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: all real-time math runs in the browser, so there is no server to fail during judging.
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
