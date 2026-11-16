import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Plugins talk to MyGST only through the SDK (ctx.data, ctx.storage …), never the database directly.
  {
    files: ["src/plugins/**/*.{ts,tsx}"],
    ignores: ["src/plugins/registry.generated.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/*", "!@/lib/plugins", "@/lib/plugins/*", "!@/lib/plugins/sdk", "@/generated/*", "@/app/*"], message: "Plugins may only import @/lib/plugins/sdk from MyGST (see docs/plugins/README.md)." },
            { group: ["../*"], message: "Plugins must not import outside their own folder." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
