import { describe, expect, it } from "vitest";
import {
  evaluateTopic,
  TOPIC_RULES,
  TOPIC_SOURCES,
  TopicSchema,
  TopicEvaluationSchema,
  type Topic,
} from "@/domain/judgment/topics";
import { parseStructureDiagnosis } from "@/domain/judgment/structure";
import { analyzeRelations, parseRelationAnalysis } from "@/domain/judgment/relations";
import { topicContext, topicPillars, uniformChart } from "./helpers/topic-context";

// Fixed charts and expected condition categories, hand-tabulated with the adopted ten-god/hidden-stem convention.
const resourceOnly = uniformChart("임", "자");
const outputWealth = uniformChart("병", "오", "오");
const authorityResourceWealth = uniformChart("경", "신");
const peerWealthResource = uniformChart("갑", "진", "진");
const peerOutputResource = uniformChart("정", "묘");
const peerOnly = {
  year: { heavenlyStem: "을", earthlyBranch: "묘" },
  month: { heavenlyStem: "을", earthlyBranch: "묘" },
  day: { heavenlyStem: "을", earthlyBranch: "묘" },
  hour: { heavenlyStem: "을", earthlyBranch: "묘" },
} as const;
const pairCases = [
  ["temperament", "resource-output", resourceOnly, outputWealth],
  ["temperament", "peer-authority", authorityResourceWealth, peerOnly],
  ["strengths", "resource-output", resourceOnly, outputWealth],
  ["strengths", "authority-resource", resourceOnly, outputWealth],
  ["career", "authority-resource", resourceOnly, outputWealth],
  ["career", "output-wealth", authorityResourceWealth, peerOutputResource],
  ["wealth", "output-wealth", authorityResourceWealth, peerOutputResource],
  ["wealth", "wealth-peer", outputWealth, peerOnly],
  ["social", "peer-output", outputWealth, peerWealthResource],
  ["social", "peer-authority", authorityResourceWealth, peerOnly],
] as const;

describe("M03 six bounded rule packs", () => {
  it.each(pairCases)(
    "%s/%s requires both categories; missing either is not an opposite trait",
    (topic, key, withoutFirst, withoutSecond) => {
      const ruleId = `m03.${topic}.${key}`;
      expect(
        evaluateTopic(topicContext(), topic).findings.some(
          (f) => f.ruleId === ruleId && f.kind === "candidate",
        ),
      ).toBe(true);
      for (const chart of [withoutFirst, withoutSecond])
        expect(
          evaluateTopic(topicContext(chart), topic).findings.some((f) => f.ruleId === ruleId),
        ).toBe(false);
    },
  );
  it.each(TopicSchema.options)(
    "evaluates only %s rules and leaves all upstream modules unchanged",
    (topic) => {
      const context = topicContext(),
        before = structuredClone(context),
        result = evaluateTopic(context, topic);
      expect(result.evaluatedRuleIds).toEqual(
        TOPIC_RULES.filter((rule) => rule.topic === topic).map((rule) => rule.ruleId),
      );
      expect(result.findings.every((f) => f.topic === topic)).toBe(true);
      expect(context).toEqual(before);
      expect(TopicEvaluationSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
      for (const finding of result.findings) {
        expect(
          finding.sourceRefs.every((id) => TOPIC_SOURCES.some((source) => source.id === id)),
        ).toBe(true);
        expect(finding.ruleVersion).toBe("1.0.0");
        expect(finding.precision).toBe("partial");
        for (const evidence of finding.evidence) {
          let actual: unknown = context;
          for (const part of evidence.inputPath.split("."))
            actual = (actual as Record<string, unknown>)[part];
          expect(actual).toBe(evidence.value);
        }
      }
    },
  );
  it("does not create interpretations from one repeated category or the day stem itself", () => {
    for (const chart of [resourceOnly, peerOnly])
      for (const topic of TopicSchema.options)
        expect(
          evaluateTopic(topicContext(chart), topic).findings.filter((f) => f.kind === "candidate"),
        ).toEqual([]);
    expect(evaluateTopic(topicContext(peerOnly), "strengths")).toMatchObject({
      status: "unavailable",
      limitations: expect.arrayContaining(["NO_ADOPTED_PATTERN"]),
    });
  });
  it("retains observed unknown-hour evidence but never invents unknown day-relative ten gods", () => {
    const unknownHour = topicContext({ ...topicPillars, hour: null });
    expect(
      evaluateTopic(unknownHour, "temperament").findings.some((f) =>
        f.ruleId.endsWith("resource-output"),
      ),
    ).toBe(true);
    for (const topic of TopicSchema.options) {
      const result = evaluateTopic(topicContext({ ...topicPillars, day: null, hour: null }), topic);
      expect(result.status).toBe("unavailable");
      expect(result.findings.filter((f) => f.kind === "candidate")).toEqual([]);
      expect(result.limitations).toContain("DAY_MASTER_UNKNOWN");
    }
  });
  it("requires day-branch relations and month context for romance without a gender/spouse-star rule", () => {
    const combined = evaluateTopic(topicContext(), "romance");
    expect(combined.findings.some((f) => f.ruleId === "m03.romance.day-combination")).toBe(true);
    const opposed = evaluateTopic(
      topicContext({ ...topicPillars, hour: { heavenlyStem: "무", earthlyBranch: "술" } }),
      "romance",
    );
    expect(opposed.findings.some((f) => f.ruleId === "m03.romance.day-opposition")).toBe(true);
    expect(
      evaluateTopic(topicContext({ ...topicPillars, month: null }), "romance").findings.filter(
        (f) => f.kind === "candidate",
      ),
    ).toEqual([]);
    expect(
      evaluateTopic(topicContext(peerOnly), "romance").findings.filter(
        (f) => f.kind === "candidate",
      ),
    ).toEqual([]);
  });
  it("gives context review priority and reciprocal conflicts without deleting lower-priority candidates", () => {
    for (const topic of ["career", "wealth", "social"] as Topic[]) {
      const result = evaluateTopic(topicContext(), topic),
        guard = result.findings.find((f) => f.kind === "context-review")!;
      const candidates = result.findings.filter((f) => f.kind === "candidate");
      expect(candidates.length).toBeGreaterThan(0);
      expect(result.findings[0]).toBe(guard);
      expect(
        candidates.every(
          (f) =>
            f.priority < guard.priority &&
            f.disposition === "deferred" &&
            f.conflictingWith.includes(guard.findingId),
        ),
      ).toBe(true);
      expect(guard.conflictingWith).toEqual(candidates.map((f) => f.findingId));
      expect(result.conflicts[0].resolution).toBe("defer-candidates");
    }
  });
  it("reuses verified immutable module identities and verifies external JSON content", () => {
    const context = topicContext();
    expect(parseStructureDiagnosis(context.facts, context.structure)).toBe(context.structure);
    expect(parseRelationAnalysis(context.relations)).toBe(context.relations);
    expect(evaluateTopic(JSON.parse(JSON.stringify(context)), "career")).toEqual(
      evaluateTopic(context, "career"),
    );
  });
  it("retains a tentative candidate when the adopted structure methods agree and no relation review is present", () => {
    const context = topicContext({
      year: { heavenlyStem: "무", earthlyBranch: "오" },
      month: { heavenlyStem: "신", earthlyBranch: "유" },
      day: { heavenlyStem: "갑", earthlyBranch: "오" },
      hour: { heavenlyStem: "병", earthlyBranch: "오" },
    });
    expect(
      context.structure.judgments.filter((j) => j.topic === "strength").map((j) => j.value),
    ).toEqual(["weak-candidate", "weak-candidate"]);
    expect(context.structure.conflicts).toEqual([]);
    expect(context.relations.conflicts).toEqual([]);
    const result = evaluateTopic(context, "wealth");
    expect(result.findings).toMatchObject([
      {
        ruleId: "m03.wealth.output-wealth",
        kind: "candidate",
        disposition: "candidate",
        precision: "partial",
      },
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.status).toBe("partial");
  });
  it("rejects wrong charts, foreign/temporal relation scopes, surplus fields and semantic tampering", () => {
    const input = topicContext(),
      other = topicContext(peerOnly);
    const alteredStructure = {
      ...input.structure,
      judgments: input.structure.judgments.map((j, i) =>
        i === 0 ? { ...j, assertion: "synthetic-private-assertion" } : j,
      ),
    };
    const alteredRelations = {
      ...input.relations,
      relations: input.relations.relations.map((r, i) =>
        i === 0 ? { ...r, participants: ["natal:day", "natal:day"] } : r,
      ),
    };
    const foreign = analyzeRelations(
      input.relations.pillars.map((ref) => ({ ...ref, source: "personA" })),
    );
    const temporal = analyzeRelations(
      input.relations.pillars.map((ref) => ({ ...ref, source: "annual" })),
    );
    for (const bad of [
      { ...input, extra: "private" },
      { ...input, structure: other.structure },
      { ...input, relations: other.relations },
      { ...input, structure: alteredStructure },
      { ...input, relations: alteredRelations },
      { ...input, facts: { ...input.facts, dayMaster: "병" } },
      { ...input, relations: foreign },
      { ...input, relations: temporal },
    ])
      expect(() => evaluateTopic(bad, "wealth")).toThrow("Topic context was rejected.");
  });
});
