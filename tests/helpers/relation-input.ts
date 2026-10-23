import { StemSchema, BranchSchema } from "@/domain/natal-facts/schemas";
import type { PillarReference } from "@/domain/judgment/relations/schemas";

export function relationRefs(
  symbols: readonly string[],
  layer: "stem" | "branch" = "branch",
): PillarReference[] {
  return symbols.map((symbol, index) => {
    const options: readonly string[] = layer === "stem" ? StemSchema.options : BranchSchema.options;
    const parity = options.indexOf(symbol) % 2;
    return {
      referenceId: `ref-${index.toString().padStart(2, "0")}`,
      source: "annual",
      contextId: `period-${index}`,
      position: "period",
      pillar:
        layer === "stem"
          ? { heavenlyStem: StemSchema.parse(symbol), earthlyBranch: parity === 0 ? "자" : "축" }
          : { heavenlyStem: parity === 0 ? "갑" : "을", earthlyBranch: BranchSchema.parse(symbol) },
    };
  });
}
