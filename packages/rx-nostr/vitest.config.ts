import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
          include: ["src/__test__/specs/**/*.spec.{ts,mts}"],
          name: "contract",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.{ts,mts}"],
          name: "unit",
        },
      },
    ],
  },
});
