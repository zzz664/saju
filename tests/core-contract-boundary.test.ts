import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as judgment from "@/domain/judgment";
import { calculateDeveloperAnalysis } from "@/application/developer-analysis";
import { DeveloperAnalysisResponseSchema } from "@/domain/developer-analysis/schemas";
import { validateCoreExport, serializeCoreExport, buildManualPrompt } from "@/domain/core-export";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";

it("does not rerun engines in response schemas or for already verified immutable documents", () => {
  const evaluate = vi.spyOn(judgment, "evaluateBaseJudgments");
  try {
    const result = calculateDeveloperAnalysis(
      fingerprintInput,
      fingerprintDependencies,
      nodeSha256Adapter,
    );
    expect(evaluate.mock.calls.length).toBeLessThanOrEqual(2);
    evaluate.mockClear();
    DeveloperAnalysisResponseSchema.parse(JSON.parse(JSON.stringify(result)));
    validateCoreExport(result.analysis.document);
    serializeCoreExport(result.analysis.document);
    fingerprintCoreExport(result.analysis.document, nodeSha256Adapter);
    buildManualPrompt(result.analysis.document);
    expect(evaluate).not.toHaveBeenCalled();
    validateCoreExport(JSON.parse(JSON.stringify(result.analysis.document)));
    expect(evaluate).toHaveBeenCalledTimes(1);
    const copy = structuredClone(result.analysis.document);
    const damaged = { ...copy, evaluation: { ...copy.evaluation, findings: [] } };
    expect(() => validateCoreExport(damaged)).toThrow();
  } finally {
    evaluate.mockRestore();
  }
});

it.each(["src/app/dev/validation/validation-form.tsx", "src/app/dev/api-test/test-form.tsx"])(
  "keeps runtime engines/transports outside the client import graph: %s",
  (entry) => {
    const seen = new Set<string>();
    function walk(file: string) {
      if (seen.has(file)) return;
      seen.add(file);
      expect(file.replaceAll("\\", "/")).not.toMatch(
        /src\/(server|infrastructure)\/|domain\/judgment\/(catalog|index|arbitration)\.ts|domain\/(core-export|core-fingerprint|natal-facts)\/index\.ts/,
      );
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
        if (
          (ts.isExportDeclaration(node) && node.isTypeOnly) ||
          (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)
        )
          continue;
        if (
          ts.isImportDeclaration(node) &&
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.every((item) => item.isTypeOnly)
        )
          continue;
        const spec = node.moduleSpecifier;
        if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith("@/")) continue;
        const name = path.resolve("src", spec.text.slice(2));
        const child = [name + ".ts", name + ".tsx", path.join(name, "index.ts")].find(existsSync);
        if (child) walk(child);
      }
    }
    walk(path.resolve(entry));
  },
);
