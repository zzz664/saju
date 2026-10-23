import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["../**", "./**"], message: "Use the @/ alias for source modules." }] }],
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/application/**", "@/infrastructure/**", "@/server/**", "../**", "./**"], message: "Domain modules depend only on domain contracts and pure dependencies." }] }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
    "docs/**", // Reference snippets are documentation, not application modules.
  ]),
]);
