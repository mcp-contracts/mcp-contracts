import { defineConfig } from "tsdown";

// biome-ignore lint/style/noDefaultExport: tsdown requires default export
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node20",
  fixedExtension: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
