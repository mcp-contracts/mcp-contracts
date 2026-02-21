import { defineConfig } from "tsup";

// biome-ignore lint/style/noDefaultExport: tsup requires default export
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node20",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
