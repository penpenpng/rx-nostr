import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    target: "es2022",
    dts: true,
    deps: {
      neverBundle: true,
    },
    platform: "neutral",
    sourcemap: true,
    clean: true,
    outDir: "dist",
    format: ["esm"],
  },
});
