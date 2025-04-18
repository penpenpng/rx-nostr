import path from "path";
import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // https://vitest.dev/guide/in-source.html#production-build
    "import.meta.vitest": "undefined",
  },
  build: {
    lib: {
      name: "rx-nostr-crypto",
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
    },
    sourcemap: true,
  },
  plugins: [dts()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,mts}"],
  },
});
