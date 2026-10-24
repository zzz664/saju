import { describe, expect, it } from "vitest";
import {
  InterpretationCatalogSchema,
  isUsableInterpretation,
  matchInterpretations,
  parseInterpretationCatalog,
} from "@/domain/interpretation";
import {
  composeInterpretationCatalog,
  loadInterpretationCatalog,
} from "@/infrastructure/interpretation/catalog";
import { buildScaffold } from "@/infrastructure/interpretation/scaffold";
import { topicContext, topicPillars } from "./helpers/topic-context";
import { nodeSha256Adapter } from "@/infrastructure/hashing";

const digest = (text: string) => nodeSha256Adapter.digest(text);
const passage = "正月甲木。初春尚有餘寒。得丙癸透。富貴雙全。";
const retrievedAt = "2026-10-24T00:00:00.000Z";
const summary = (passageDigest: string, status: "passed" | "failed" = "passed") => ({
  text: "정월의 갑목은 아직 추위가 남아 있어 병화와 계수가 함께 드러나는 것을 귀하게 본다는 구절이다.",
  modelId: "gpt-4o-mini",
  promptVersion: "1.0.0",
  generatedAt: retrievedAt,
  passageDigest,
  entailment: { status, modelId: "gpt-4o-mini", checkedAt: retrievedAt },
});
const withData = (status: "passed" | "failed" = "passed") =>
  composeInterpretationCatalog(
    {
      schemaVersion: "1.0.0",
      note: "test",
      passages: { "src.qtbj.gap-in": { passage, retrievedAt, passageDigest: digest(passage) } },
    },
    {
      schemaVersion: "1.0.0",
      note: "test",
      summaries: { "iu.qtbj.gap-in": summary(digest(passage), status) },
    },
  );

describe("classical interpretation lookup catalog", () => {
  it("lets a collected passage carry the page and locator it was actually found with", () => {
    const moved =
      "https://zh.wikisource.org/wiki/%E4%B8%89%E5%91%BD%E9%80%9A%E6%9C%83%2F%E5%8D%B7%E4%B8%83";
    const catalog = composeInterpretationCatalog(
      {
        schemaVersion: "1.0.0",
        note: "test",
        passages: {
          "src.smth.peer": {
            passage,
            retrievedAt,
            passageDigest: digest(passage),
            url: moved,
            locator: "論劫財",
          },
        },
      },
      { schemaVersion: "1.0.0", note: "test", summaries: {} },
    );
    const peer = catalog.sources.find((s) => s.sourceId === "src.smth.peer");
    expect(peer?.url).toBe(moved);
    expect(peer?.locator).toBe("論劫財");
    const authority = catalog.sources.find((s) => s.sourceId === "src.smth.authority");
    expect(authority?.url).toContain("%E5%8D%B7%E4%BA%94"); // 卷五
    expect(catalog.sources.find((s) => s.sourceId === "src.smth.resource")?.url).toContain(
      "%E5%8D%B7%E5%85%AD", // 卷六
    );
    expect(authority?.locator).toBe("論正官");
  });
  it("scaffolds every day-master×month, day-master, family and pair slot without any prose", () => {
    const scaffold = buildScaffold();
    expect(scaffold).toHaveLength(120 + 10 + 5 + 6);
    expect(new Set(scaffold.map((entry) => entry.unit.unitId)).size).toBe(scaffold.length);
    expect(scaffold.find((entry) => entry.unit.unitId === "iu.qtbj.gap-in")?.source.locator).toBe(
      "正月甲木",
    );
    expect(scaffold.find((entry) => entry.unit.unitId === "iu.qtbj.gye-chuk")?.source.locator).toBe(
      "十二月癸水",
    );
    const catalog = loadInterpretationCatalog();
    // Passages are collected for every slot (Wikisource, no LLM). Summaries arrive in batches from
    // summarize-units.mjs, so the test checks consistency, not a fixed count: a unit is `scaffold`
    // exactly when it has no summary, and every summary is bound to its passage digest.
    const sourceById = new Map(catalog.sources.map((source) => [source.sourceId, source]));
    for (const unit of catalog.units) {
      expect(unit.reviewStatus).toBe(unit.summary ? "ai-summarized-unreviewed" : "scaffold");
      if (unit.summary)
        expect(unit.summary.passageDigest).toBe(sourceById.get(unit.sourceId)?.passageDigest);
    }
    expect(catalog.sources.every((source) => source.passage !== null)).toBe(true);
    expect(
      catalog.sources.every(
        (source) => source.passage !== null && source.passageDigest === digest(source.passage),
      ),
    ).toBe(true);
    expect(catalog.sources.every((source) => !/時日月年/.test(source.passage ?? ""))).toBe(true);
    // Season-only chapters and the 建祿 stand-in carry the locator that actually matched.
    expect(catalog.sources.find((s) => s.sourceId === "src.qtbj.gi-o")?.locator).toBe("三夏己土");
    expect(catalog.sources.find((s) => s.sourceId === "src.smth.peer")?.locator).toBe("論建祿");
    expect(catalog.sources.find((s) => s.sourceId === "src.qtbj.gap-in")?.passage).toMatch(
      /^正月甲木/,
    );
    expect(InterpretationCatalogSchema.safeParse(catalog).success).toBe(true);
  });
  it("matches confirmed day master, month and observed ten-god families only", () => {
    const facts = topicContext().facts; // 임자 / 병인 / 갑진 / 경신
    const matched = matchInterpretations(facts, loadInterpretationCatalog());
    const ids = matched.map((entry) => entry.unitId);
    expect(ids).toContain("iu.qtbj.gap-in");
    expect(ids).toContain("iu.dts.gap");
    expect(ids).toContain("iu.smth.pair.resource-output");
    expect(ids).not.toContain("iu.qtbj.gap-ja");
    expect(ids).not.toContain("iu.dts.eul");
    // usable ⇔ summary present, entailment passed and digest bound (whatever the data batch holds).
    const units = new Map(loadInterpretationCatalog().units.map((unit) => [unit.unitId, unit]));
    for (const entry of matched)
      expect(entry.usable).toBe(units.get(entry.unitId)?.summary?.entailment.status === "passed");
    const month = matched.find((entry) => entry.unitId === "iu.qtbj.gap-in")!;
    expect(month.evidence).toEqual([
      { inputPath: "facts.dayMaster", value: "갑" },
      { inputPath: "facts.positions.month.branch.branch", value: "인" },
    ]);
    for (const entry of matched)
      for (const evidence of entry.evidence) {
        const actual = evidence.inputPath
          .split(".")
          .slice(1)
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], facts);
        expect(String(actual)).toBe(evidence.value);
      }
    expect(
      matchInterpretations(facts, loadInterpretationCatalog(), { topics: ["wealth"] }).every(
        (entry) => entry.topics.includes("wealth"),
      ),
    ).toBe(true);
  });
  it("never matches without a day master or month and rejects altered facts", () => {
    const noMonth = topicContext({ ...topicPillars, month: null }).facts;
    expect(
      matchInterpretations(noMonth, loadInterpretationCatalog()).some(
        (entry) => entry.condition.kind === "day-master-month",
      ),
    ).toBe(false);
    const noDay = topicContext({ ...topicPillars, day: null }).facts;
    expect(matchInterpretations(noDay, loadInterpretationCatalog())).toEqual([]);
    expect(() =>
      matchInterpretations(
        { ...topicContext().facts, dayMaster: "을" },
        loadInterpretationCatalog(),
      ),
    ).toThrow();
  });
  it("marks a unit usable only with a collected passage and a passed entailment bound to its digest", () => {
    const passed = withData();
    const unit = passed.units.find((entry) => entry.unitId === "iu.qtbj.gap-in")!;
    expect(unit.reviewStatus).toBe("ai-summarized-unreviewed");
    expect(isUsableInterpretation(unit, passed)).toBe(true);
    const matched = matchInterpretations(topicContext().facts, passed).find(
      (entry) => entry.unitId === "iu.qtbj.gap-in",
    )!;
    expect(matched).toMatchObject({ usable: true, source: { collected: true } });
    expect(matched.summary).toContain("갑목");
    const failed = withData("failed");
    expect(
      isUsableInterpretation(
        failed.units.find((entry) => entry.unitId === "iu.qtbj.gap-in")!,
        failed,
      ),
    ).toBe(false);
    expect(() =>
      parseInterpretationCatalog({
        ...passed,
        units: passed.units.map((entry) =>
          entry.unitId === "iu.qtbj.gap-in"
            ? { ...entry, summary: { ...entry.summary!, passageDigest: "f".repeat(64) } }
            : entry,
        ),
      }),
    ).toThrow();
    expect(() =>
      composeInterpretationCatalog(
        { schemaVersion: "1.0.0", note: "", passages: {} },
        { schemaVersion: "1.0.0", note: "", summaries: { "iu.unknown": summary("a".repeat(64)) } },
      ),
    ).toThrow();
  });
});
