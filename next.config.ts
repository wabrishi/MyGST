import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything in this app is per-user and dynamic, so Cache Components is intentionally off.
  serverExternalPackages: ["@react-pdf/renderer", "mariadb"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }, // logo upload
  },
  // Tailwind runs through PostCSS (postcss.config.mjs). Production builds use webpack (`next build --webpack`)
  // because Turbopack spawns separate Node worker processes for CSS loaders, which shared-hosting build
  // servers (Hostinger) can kill. Dev still uses Turbopack.
};

export default nextConfig;
