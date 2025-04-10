import js from "@eslint/js";
import * as resolver from "eslint-import-resolver-typescript";
import { flatConfigs as importx } from "eslint-plugin-import-x";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ts.configs.recommended,
  importx.recommended,
  importx.typescript,
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: { globals: globals.browser },
  },
  // import path must have `.ts` extension
  // for a case that TypeScript is executed directly by Node.js, deno, etc.
  {
    rules: {
      "import-x/extensions": ["error", "ignorePackages"],
    },
    settings: {
      "import-x/extensions": [".ts", ".mts"],
    },
  },
  {
    settings: {
      "import-x/resolver": {
        name: "tsResolver",
        resolver,
      },
    },
  },
  // eslint ignore
  {
    ignores: ["eslint.config.mjs", "dist/**", "node_modules/**"],
  },
]);
