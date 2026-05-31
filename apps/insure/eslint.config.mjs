import tseslint from "typescript-eslint";
import { eslintPlugin as specTest } from "@platform/spec-test";

export default [
  {
    ignores: [".next/**", ".open-next/**", "node_modules/**"],
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "spec-test": specTest,
    },
    rules: {
      "spec-test/require-expect-in-spec-test": "error",
    },
  },
];
