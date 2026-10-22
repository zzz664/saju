import { getHeavenlyStemElement, getHeavenlyStemYinYang, getEarthlyBranchElement, getEarthlyBranchYinYang, getTenGod } from "manseryeok";
import packageInfo from "manseryeok/package.json";
import { StemSchema, BranchSchema, SymbolCatalogSchema, NatalFactsError, type SymbolCatalogAdapter } from "../../domain/natal-facts/index";

export const manseryeokSymbolCatalogAdapter: SymbolCatalogAdapter = Object.freeze({
  load() {
    let raw: unknown;
    try {
      raw = {
        stems: StemSchema.options.map((stem) => ({ stem, element: getHeavenlyStemElement(stem), polarity: getHeavenlyStemYinYang(stem) })),
        branches: BranchSchema.options.map((branch) => ({ branch, element: getEarthlyBranchElement(branch), polarity: getEarthlyBranchYinYang(branch) })),
        tenGods: StemSchema.options.flatMap((dayMaster) => StemSchema.options.map((target) => ({ dayMaster, target, tenGod: getTenGod(dayMaster, target) }))),
        provenance: { libraryName: packageInfo.name, libraryVersion: packageInfo.version, ruleId: "symbols.public-sdk", ruleVersion: "1.0.0" },
      };
    } catch { throw new NatalFactsError("CATALOG_LOAD_FAILED"); }
    const result = SymbolCatalogSchema.safeParse(raw);
    if (!result.success) throw new NatalFactsError("OUTPUT_INVALID");
    return result.data;
  },
});
