import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      name: "rx-nostr",
      fileName: (format) => `index.${format}.js`,
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es", "cjs", "umd"],
    },
  },
});
