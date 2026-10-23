import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    plugins: { local: { rules: { "client-boundary": {
      create(context) {
        let client = false;
        return {
          Program(node) { client = node.body.some(statement => statement.type === "ExpressionStatement" && statement.directive === "use client"); },
          ImportDeclaration(node) {
            if (!client || node.importKind === "type") return;
            const source = String(node.source.value);
            if (/^@\/(server|infrastructure)\//.test(source) || /^@\/domain\//.test(source) && !/^@\/domain\/input(?:\/|$)/.test(source) && !source.endsWith("/schemas"))
              context.report({ node, message: "Client components use structural contracts, never server engines or transports." });
          },
        };
      },
    } } } },
    rules: { "local/client-boundary": "error" },
  },
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
