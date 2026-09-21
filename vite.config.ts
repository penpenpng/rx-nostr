import { defineConfig } from "vite-plus";

const ignored = [
  "**/dist/**",
  "**/node_modules/**",
  "packages/docs/**",
  "packages/unipls/**",
  "pnpm-lock.yaml",
];

export default defineConfig({
  lint: {
    ignorePatterns: ignored,
  },
  fmt: {
    ignorePatterns: ignored,
  },
});
