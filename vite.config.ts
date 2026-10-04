import { defineConfig } from "vite-plus";

const ignored = [
  "**/dist/**",
  "**/node_modules/**",
  "packages/docs/**",
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
