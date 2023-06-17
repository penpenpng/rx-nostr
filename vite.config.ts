import path from "path";
import { defineConfig } from "vitest/config";

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
