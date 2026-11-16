// Scaffolds a code plugin:  npm run plugin:new -- my-plugin "My plugin"
// Creates src/plugins/<id>/index.ts, README.md and a unit test, then refreshes the registry.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [id, ...nameParts] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]{1,40}[a-z0-9]$/.test(id)) {
  console.error('Usage: npm run plugin:new -- <id> "Display name"\n  <id>: 3–42 lowercase letters, digits and dashes, starting with a letter (e.g. sms-alerts)');
  process.exit(1);
}
const name = nameParts.join(" ") || id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "src", "plugins", id);
if (existsSync(dir)) {
  console.error(`src/plugins/${id} already exists`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

writeFileSync(
  join(dir, "index.ts"),
  `import { definePlugin } from "@/lib/plugins/sdk";

/**
 * ${name}: describe what this plugin does in one sentence.
 * Guide: docs/plugins/README.md
 */
export default definePlugin({
  manifest: {
    id: "${id}",
    name: "${name.replace(/"/g, '\\"')}",
    version: "0.1.0",
    description: "",
    author: "",
    // Ask only for what you use; owners see this list when they turn the plugin on.
    permissions: ["documents:read"],
    events: ["invoice.issued"],
    settings: [{ key: "greeting", label: "Greeting", type: "text", default: "Hello" }],
  },
  setup(api) {
    api.on("invoice.issued", async (event, ctx) => {
      ctx.log.info(\`\${ctx.settings.greeting}! Invoice \${String(event.data.number)} was issued.\`);
    });
  },
});
`,
);

writeFileSync(
  join(dir, "README.md"),
  `# ${name}

What it does, who it's for, and how to configure it.

## Settings
- **Greeting**: …

## Permissions
- \`documents:read\`: why it needs it.
`,
);

const testDir = join(root, "tests", "unit", "plugins");
mkdirSync(testDir, { recursive: true });
writeFileSync(
  join(testDir, `${id}.test.ts`),
  `import { describe, expect, it } from "vitest";
import plugin from "@/plugins/${id}";
import { createPluginTestContext, loadForTest } from "@/lib/plugins/testing";

describe("${id} plugin", () => {
  it("has a valid manifest and registers its hooks", () => {
    const p = loadForTest(plugin);
    expect(p.manifest.id).toBe("${id}");
    expect(p.actions.get("invoice.issued")?.length).toBe(1);
  });

  it("logs issued invoices", async () => {
    const p = loadForTest(plugin);
    const ctx = createPluginTestContext({ manifest: p.manifest, settings: { greeting: "Hi" } });
    await p.emit("invoice.issued", { number: "INV/26-27/0001" }, ctx);
    expect(ctx.logs).toContainEqual({ level: "info", message: "Hi! Invoice INV/26-27/0001 was issued." });
  });
});
`,
);

execFileSync(process.execPath, [join(root, "scripts", "plugins-sync.mjs")], { stdio: "inherit" });
console.log(`\nCreated src/plugins/${id}/ and tests/unit/plugins/${id}.test.ts
Next:
  1. Edit src/plugins/${id}/index.ts
  2. npx vitest run tests/unit/plugins/${id}.test.ts
  3. npm run dev, then Admin → Plugins → ${name} → Install`);
