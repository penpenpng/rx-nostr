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
  // Project specific rules.
  {
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  // Import path must have `.ts` extension
  // for a case that TypeScript is executed directly by Node.js, deno, etc.
  {
    rules: {
      "import-x/extensions": ["error", "ignorePackages"],
    },
    settings: {
      "import-x/extensions": [".ts", ".mts"],
    },
  },
  // import-x needs resolver to track import path.
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
