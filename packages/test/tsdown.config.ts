import { defineConfig } from "tsdown";

// biome-ignore lint/style/noDefaultExport: tsdown requires default export
export default defineConfig([
  {
    entry: ["src/index.ts", "src/matchers.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node20",
    fixedExtension: false,
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    target: "node20",
    fixedExtension: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
