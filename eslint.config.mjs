// path: eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * English-only product artifact guard. The authoritative scanner is
 * scripts/check-english-only.sh; this rule provides in-editor feedback.
 * Selectors match the raw source text, so safe ASCII escapes such as
 * \u00A9 are allowed while literal non-ASCII characters are rejected.
 */
const englishOnlyRules = [
  {
    selector: "Literal[raw=/[^\\x00-\\x7F]/]",
    message: "Only English ASCII text is allowed in product source files (use \\u escapes).",
  },
  {
    selector: "JSXText[raw=/[^\\x00-\\x7F]/]",
    message: "Only English ASCII text is allowed in product source files (use \\u escapes).",
  },
  {
    selector: "TemplateElement[value.raw=/[^\\x00-\\x7F]/]",
    message: "Only English ASCII text is allowed in product source files (use \\u escapes).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      "no-restricted-syntax": ["error", ...englishOnlyRules],
    },
  },
  {
    files: ["**/*.mjs", "scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "next-env.d.ts",
    "package-lock.json",
    "public/fonts/**",
    "public/design-tokens.json",
  ]),
]);

export default eslintConfig;
