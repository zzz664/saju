import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("manseryeok", async (importOriginal) => ({ ...await importOriginal<typeof import("manseryeok")>(), getTenGod: vi.fn(), getHeavenlyStemElement: vi.fn() }));
import { getTenGod, getHeavenlyStemElement } from "manseryeok";
import { manseryeokSymbolCatalogAdapter } from "@/infrastructure/manseryeok";

describe("symbol catalog SDK trust boundary", () => {
  afterEach(() => vi.resetAllMocks());

  it("blocks unknown or missing SDK symbols", () => {
    expect(() => manseryeokSymbolCatalogAdapter.load()).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
    vi.mocked(getTenGod).mockReturnValue("unknown" as never);
    vi.mocked(getHeavenlyStemElement).mockReturnValue("wood" as never);
    expect(() => manseryeokSymbolCatalogAdapter.load()).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
  });

  it("hides unexpected upstream failures without raw data or causes", () => {
    vi.mocked(getHeavenlyStemElement).mockImplementation(() => { throw new Error("private upstream"); });
    try { manseryeokSymbolCatalogAdapter.load(); expect.fail("Expected failure"); }
    catch (error) { expect(error).toMatchObject({ code: "CATALOG_LOAD_FAILED" }); expect(String(error)).not.toContain("private"); expect(error).not.toHaveProperty("cause"); }
  });
});
