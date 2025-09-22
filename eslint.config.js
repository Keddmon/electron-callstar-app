import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/*", "release/*", "node_modules/*"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
];
