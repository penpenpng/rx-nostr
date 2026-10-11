import { defineConfig } from "vite-plus";

const ignored = ["**/dist/**", "**/node_modules/**", "packages/docs/**", "pnpm-lock.yaml"];

export default defineConfig({
  lint: {
    ignorePatterns: ignored,
    jsPlugins: ["@stylistic/eslint-plugin"],
    categories: {
      correctness: "error",
      suspicious: "error",
    },
    rules: {
      curly: ["error", "all"],
      "eslint/no-shadow": "off",
      "eslint/no-nested-ternary": "error",
      "unicorn/prefer-add-event-listener": "off",
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
        { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: "*", next: ["if", "for", "switch"] },
        { blankLine: "always", prev: ["if", "for", "switch"], next: "*" },
        { blankLine: "any", prev: "if", next: "if" },
        { blankLine: "any", prev: "for", next: "for" },
        { blankLine: "any", prev: "switch", next: "switch" },
        {
          blankLine: "always",
          prev: "*",
          next: { selector: 'ExpressionStatement[expression.type="AssignmentExpression"]' },
        },
        {
          blankLine: "always",
          prev: { selector: 'ExpressionStatement[expression.type="AssignmentExpression"]' },
          next: "*",
        },
        {
          blankLine: "any",
          prev: { selector: 'ExpressionStatement[expression.type="AssignmentExpression"]' },
          next: { selector: 'ExpressionStatement[expression.type="AssignmentExpression"]' },
        },
      ],
    },
  },
  fmt: {
    ignorePatterns: ignored,
    sortImports: true,
  },
});
