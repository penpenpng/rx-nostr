import path from "path";

import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    lib: {
      name: "rx-nostr-crypto-wasm",
      fileName: "rx-nostr-crypto-wasm",
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
    },
    sourcemap: true,
  },
  plugins: [dts({ exclude: ["src/__test__/**", "src/**/*.spec.ts", "src/**/*.test.ts"] })],
  test: {
    include: ["src/**/*.{test,spec}.{ts,mts}"],
  },
});
