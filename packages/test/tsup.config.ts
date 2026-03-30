import { defineConfig } from "tsup";

// biome-ignore lint/style/noDefaultExport: tsup requires default export
export default defineConfig([
  {
    entry: ["src/index.ts", "src/matchers.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node20",
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    target: "node20",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
