import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // `!` is used deliberately after bounds checks under noUncheckedIndexedAccess.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Flags apostrophes in JSX text only; React escapes text, so it has no
      // security value and would force &apos; noise into prose.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/types/database.generated.ts"],
  },
];

export default eslintConfig;
