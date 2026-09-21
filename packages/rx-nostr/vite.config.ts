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
      entry: path.resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
    },
    sourcemap: true,
  },
  plugins: [
    dts({
      afterDiagnostic(diagnostics) {
        if (diagnostics.length > 0) {
          throw new Error(
            `Declaration generation failed with ${diagnostics.length} diagnostic(s).`,
          );
        }
      },
      logDiagnostics: true,
      skipDiagnostics: false,
      tsconfigPath: "./tsconfig.json",
    }),
  ],
  resolve: {
    alias: {
      "rx-nostr": path.resolve(import.meta.dirname, "src/index.ts"),
      unipls: path.resolve(import.meta.dirname, "../unipls/src/index.ts"),
    },
  },
  test: {
    hookTimeout: 1000,
    projects: [
      {
        extends: true,
        test: {
          include: ["src/__test__/contract/**/*.spec.{ts,mts}"],
          name: "contract",
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.{ts,mts}"],
          name: "unit",
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
