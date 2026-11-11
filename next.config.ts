import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything in this app is per-user and dynamic, so Cache Components is intentionally off.
  serverExternalPackages: ["@react-pdf/renderer", "mariadb"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }, // logo upload
    // By default Next.js starts (CPU cores − 1) build workers — 56 on Hostinger's build machines, far beyond
    // the plan's process/memory limits (the build dies with SIGABRT). One worker is plenty for this app;
    // raise with BUILD_CPUS on a bigger server.
    cpus: Math.max(1, Number(process.env.BUILD_CPUS) || 1),
  },
  // Tailwind runs through PostCSS (postcss.config.mjs). Production builds use webpack (`next build --webpack`)
  // because Turbopack spawns separate Node worker processes for CSS loaders, which shared-hosting build
  // servers (Hostinger) can kill. Dev still uses Turbopack.
};

export default nextConfig;
