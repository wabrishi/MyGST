import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything in this app is per-user and dynamic, so Cache Components is intentionally off.
  serverExternalPackages: ["@react-pdf/renderer", "mariadb"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }, // logo upload
  },
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
