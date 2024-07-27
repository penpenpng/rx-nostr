import path from "path";
import { type PluginOption } from "vite";
import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.vitest": "undefined",
  },
  build: {
    lib: {
      name: "rx-nostr",
      fileName: (format) => `index.${format}.js`,
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es", "cjs", "umd"],
    },
    sourcemap: true,
  },
  plugins: [dts() as PluginOption],
  test: {
    hookTimeout: 1000,
  },
});
