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
      name: "rx-nostr",
      entry: path.resolve(__dirname, "next/index.ts"),
      formats: ["es"],
    },
    sourcemap: true,
  },
  plugins: [dts()],
  test: {
    hookTimeout: 1000,
    include: ["next/**/*.{test,spec}.{ts,mts}", "next/__test__/*.{ts,mts}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
