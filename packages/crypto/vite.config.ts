import path from "path";
import { defineConfig, type PluginOption } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  define: {
    // https://vitest.dev/guide/in-source.html#production-build
    "import.meta.vitest": "undefined",
  },
  build: {
    lib: {
      name: "rx-nostr-crypto",
      entry: path.resolve(__dirname, "next/index.ts"),
      formats: ["es"],
    },
    sourcemap: true,
  },
  plugins: [dts() as PluginOption],
});
