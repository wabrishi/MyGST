import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Note (Windows): run from PowerShell/cmd. Git Bash's lowercase drive letter (/c/...) makes Vite load
// two copies of the test runner ("Cannot read properties of undefined (reading 'config')").
export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      // Next.js-only marker module; a no-op outside the Next bundler.
      "server-only": r("./tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
