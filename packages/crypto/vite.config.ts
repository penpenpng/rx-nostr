import path from "path";
import { defineConfig, type PluginOption } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      name: "rx-nostr-crypto",
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es", "cjs", "umd"],
    },
    sourcemap: true,
  },
  plugins: [dts() as PluginOption],
});
