import tseslint from "typescript-eslint";

// The demo exists to self-test the platform's patterns, so keep linting to the
// non-type-aware recommended sets; the real per-app config lives in apps/insure.
export default tseslint.config(
  {
    ignores: [".next/**", ".open-next/**", "node_modules/**", "next-env.d.ts"],
  },
  ...tseslint.configs.recommended,
);
