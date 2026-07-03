import tseslint from "typescript-eslint";
import { eslintPlugin as specTest } from "@platform/spec-test";
import base from "../../eslint.config.base.mjs";

export default tseslint.config(
  {
    ignores: [".next/**", ".open-next/**", "node_modules/**", "next-env.d.ts"],
  },
  ...base,
  // Config files and the PDF fixture generator are plain JS outside the TS
  // project, so type-aware rules cannot run on them. The fixture generator is
  // a Node CLI script, so give it its globals and let it print.
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    plugins: {
      "spec-test": specTest,
    },
    rules: {
      "spec-test/require-expect-in-spec-test": "error",
    },
  },
);
