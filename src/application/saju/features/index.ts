import { z } from "zod";
import { calculateCoreExport } from "@/application/core-export";
import { fingerprintCoreExport, type HashedCoreExport } from "@/domain/core-fingerprint";
import { canonicalizeJson } from "@/domain/json";
import { diagnoseStructure, type StructureDiagnosis } from "@/domain/judgment/structure";
import { analyzeRelations, type RelationAnalysis } from "@/domain/judgment/relations";
import { evaluateTopic, type TopicEvaluation, type Topic } from "@/domain/judgment/topics";
import {
  FeatureRequestSchema,
  FeatureResultSchema,
  FeatureJudgmentSchema,
  ModuleSnapshotSchema,
  FeatureNarrationInputSchema,
  VersionSchema,
  type FeatureId,
  type ModuleId,
  type Subject,
  type ModuleSnapshot,
  type FeatureJudgment,
  type Component,
  type FeatureLimitation,
  type FeatureResult,
} from "@/domain/features/schemas";
import { CoverageStatusSchema } from "@/domain/contracts";
import { defineCodedError, compareText } from "@/domain/utilities";
import {
  getProfile,
  planFeature,
  MODULE_DEPENDENCIES,
  BUILTIN_FEATURE_EXECUTORS,
} from "@/application/saju/features/registry";
import { observeStrengths } from "@/domain/features/strengths";
import { observeTemperament } from "@/domain/features/temperament";
import { observeCareer } from "@/domain/features/career";
import type { FeatureDependencies, FeatureEngine } from "@/application/saju/features/ports";
export * from "@/application/saju/features/ports";
export { getProfile, planFeature, FEATURE_PROFILES } from "@/application/saju/features/registry";
export class FeatureError extends defineCodedError("FeatureError", {
  EXECUTION_FAILED: "Feature execution failed.",
  OUTPUT_REJECTED: "Feature output was rejected.",
  HASH_FAILED: "Feature cache key failed.",
}) {}
const verified = new WeakSet<FeatureResult>();
const selectionSchema = z
  .strictObject({
    status: CoverageStatusSchema,
    judgmentIds: z.array(z.string().min(1)).max(500).readonly(),
  })
  .readonly();
const modulePayloadSchema = ModuleSnapshotSchema.unwrap()
  .pick({ status: true, judgments: true, limitations: true })
  .readonly();
const unique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort();

function baseJudgments(core: HashedCoreExport, subject: "primary" | "other"): FeatureJudgment[] {
  const arbitration = core.document.resolution?.arbitration;
  return (arbitration?.findings ?? [])
    .filter((finding) =>
      arbitration!.decisions.some(
        (decision) =>
          decision.findingId === finding.findingId && decision.disposition === "accepted",
      ),
    )
    .map((finding) =>
      FeatureJudgmentSchema.parse({
        judgmentId: `${subject}:base:${finding.findingId}`,
        originModule: "base",
        subject,
        topic: null,
        assertion: finding.assertion,
        status: finding.precision === "confirmed" ? "complete" : "partial",
        precision: finding.precision,
        disposition: finding.precision === "confirmed" ? "accepted" : "deferred",
        ruleId: finding.ruleId,
        ruleVersion: finding.ruleVersion,
        sourceRefs: finding.sourceRefs,
        evidence: finding.evidence,
        caveats: finding.caveats,
        exceptionsApplied: finding.exceptionsApplied,
      }),
    );
}

/** Request-scoped composition. Ports select existing evidence; this layer creates no new astrology rules. */
export function executeFeature(value: unknown, deps: FeatureDependencies): FeatureResult {
  const request = FeatureRequestSchema.parse(value);
  try {
    const core = fingerprintCoreExport(
      calculateCoreExport(
        { birthInput: request.birthInput, calculationPolicy: request.calculationPolicy },
        deps,
      ),
      deps.hash,
    );
    const otherCore =
      request.featureId === "F11"
        ? fingerprintCoreExport(
            calculateCoreExport(
              {
                birthInput: request.otherBirthInput,
                calculationPolicy: request.otherCalculationPolicy,
              },
              deps,
            ),
            deps.hash,
          )
        : null;
    const target = "target" in request ? request.target : null;
    const plan = planFeature(request.featureId);
    const subjects = otherCore ? (["primary", "other"] as const) : (["primary"] as const);
    const cores = { primary: core, other: otherCore, pair: core };
    type Data = StructureDiagnosis | RelationAnalysis | TopicEvaluation | null;
    const memo = new Map<string, { snapshot: ModuleSnapshot; data: Data }>();
    const pool = [
      ...baseJudgments(core, "primary"),
      ...(otherCore ? baseJudgments(otherCore, "other") : []),
    ];

    function load(
      moduleId: ModuleId,
      subject: Subject,
      topic: Topic | null = null,
    ): { snapshot: ModuleSnapshot; data: Data } {
      const key = `${subject}:${moduleId}:${topic ?? ""}`;
      const cached = memo.get(key);
      if (cached) return cached;
      for (const dep of MODULE_DEPENDENCIES[moduleId])
        for (const owner of subject === "pair" ? subjects : [subject]) {
          if (dep === "M03") for (const topic of plan.topics) load(dep, owner, topic);
          else load(dep, owner);
        }
      const selectedCore = cores[subject]!;
      const facts = selectedCore.document.facts;
      let data: Data = null;
      const port = deps.moduleExecutors?.[moduleId];
      let version: string | null =
        port?.version ?? (["M01", "M02", "M03"].includes(moduleId) ? "1.0.0" : null);
      let payload: unknown;
      if (!facts)
        payload = { status: "unavailable", judgments: [], limitations: ["CORE_UNAVAILABLE"] };
      else if (port)
        payload = port.execute(
          Object.freeze({
            moduleId,
            subject,
            topic,
            core: selectedCore,
            otherCore,
            target,
            upstream: Object.freeze([...memo.values()].map((entry) => entry.snapshot)),
          }),
        );
      else if (moduleId === "M01") {
        const result = diagnoseStructure(facts);
        data = result;
        payload = {
          status: result.status,
          limitations: result.status === "partial" ? ["UPSTREAM_PARTIAL"] : [],
          judgments: result.judgments
            .filter((j) => j.precision !== "unknown")
            .map((j) => ({
              judgmentId: `${subject}:M01:${j.judgmentId}`,
              originModule: "M01",
              subject,
              topic: null,
              assertion: j.assertion,
              status: j.status === "complete" ? "complete" : "partial",
              precision: j.precision,
              disposition: result.conflicts.some((conflict) =>
                conflict.judgmentIds.includes(j.judgmentId),
              )
                ? "deferred"
                : j.precision === "confirmed"
                  ? "accepted"
                  : "candidate",
              ruleId: j.ruleId,
              ruleVersion: j.ruleVersion,
              sourceRefs: j.sourceRefs,
              evidence: j.evidence,
              caveats: j.caveats,
              exceptionsApplied: j.exceptionsApplied,
            })),
        };
      } else if (moduleId === "M02") {
        const result = analyzeRelations(
          Object.entries(facts.sourcePillars).map(([position, pillar]) => ({
            referenceId: `natal:${position}`,
            source: "natal",
            contextId: "native",
            position,
            pillar,
          })),
        );
        data = result;
        payload = { status: result.status, judgments: [], limitations: ["UPSTREAM_PARTIAL"] };
      } else if (moduleId === "M03" && topic) {
        if (["strengths", "temperament", "career"].includes(topic)) version = "1.1.0";
        const structure = load("M01", subject).data as StructureDiagnosis | null;
        const relations = load("M02", subject).data as RelationAnalysis | null;
        if (!structure || !relations)
          payload = {
            status: "unavailable",
            judgments: [],
            limitations: ["EXECUTION_UNAVAILABLE"],
          };
        else {
          const result = evaluateTopic({ facts, structure, relations }, topic);
          const observations =
            topic === "strengths"
              ? observeStrengths(facts, subject)
              : topic === "temperament"
                ? observeTemperament(facts, subject)
                : topic === "career"
                  ? observeCareer(facts, subject)
                  : [];
          data = result;
          payload = {
            status:
              observations.length && result.status === "unavailable" ? "partial" : result.status,
            limitations: ["UPSTREAM_PARTIAL"],
            judgments: [
              ...result.findings.map((j) => ({
                judgmentId: `${subject}:M03:${j.findingId}`,
                originModule: "M03",
                subject,
                topic,
                assertion: j.assertion,
                status: "partial",
                precision: j.precision,
                disposition: j.disposition,
                ruleId: j.ruleId,
                ruleVersion: j.ruleVersion,
                sourceRefs: j.sourceRefs,
                evidence: j.evidence,
                caveats: j.caveats,
                exceptionsApplied: j.exceptionsApplied,
              })),
              ...observations,
            ],
          };
        }
      } else {
        version = null;
        payload = { status: "unavailable", judgments: [], limitations: ["MODULE_NOT_IMPLEMENTED"] };
      }
      const parsed = modulePayloadSchema.parse(payload);
      if (
        parsed.judgments.some(
          (j) =>
            j.originModule !== moduleId ||
            j.subject !== subject ||
            j.topic !== topic ||
            !j.judgmentId.startsWith(`${subject}:${moduleId}:`),
        ) ||
        new Set(parsed.judgments.map((j) => j.judgmentId)).size !== parsed.judgments.length
      )
        throw new FeatureError("OUTPUT_REJECTED");
      const snapshot = ModuleSnapshotSchema.parse({ moduleId, subject, topic, version, ...parsed });
      const entry = Object.freeze({ snapshot, data });
      memo.set(key, entry);
      pool.push(...snapshot.judgments);
      return entry;
    }
    for (const moduleId of plan.modules) {
      if (moduleId === "M08") load(moduleId, "pair");
      else
        for (const subject of subjects) {
          if (moduleId === "M03") for (const topic of plan.topics) load(moduleId, subject, topic);
          else load(moduleId, subject);
        }
    }
    if (new Set(pool.map((j) => j.judgmentId)).size !== pool.length)
      throw new FeatureError("OUTPUT_REJECTED");
    const modules = Object.freeze(
      [...memo.values()]
        .map((entry) => entry.snapshot)
        .sort((a, b) =>
          compareText(
            `${a.subject}:${a.moduleId}:${a.topic ?? ""}`,
            `${b.subject}:${b.moduleId}:${b.topic ?? ""}`,
          ),
        ),
    );
    const componentMemo = new Map<FeatureId, Component>();
    function compose(id: FeatureId): Component {
      const cached = componentMemo.get(id);
      if (cached) return cached;
      const profile = getProfile(id),
        ownPlan = planFeature(id);
      const required = modules.filter(
        (module) =>
          ownPlan.modules.includes(module.moduleId) &&
          (module.moduleId !== "M03" || ownPlan.topics.includes(module.topic!)),
      );
      const children = profile.children.map(compose);
      const limitations: FeatureLimitation[] = [];
      let ids: readonly string[] = [],
        declared: z.infer<typeof CoverageStatusSchema> = "complete";
      const port = deps.featureExecutors?.[id] ?? BUILTIN_FEATURE_EXECUTORS[id];
      const implementation = children.length ? "aggregate" : port ? "registered" : "missing";
      if (core.status === "unavailable" || otherCore?.status === "unavailable")
        limitations.push("CORE_UNAVAILABLE");
      if (
        core.status === "partial" ||
        otherCore?.status === "partial" ||
        required.some((module) => module.status === "partial")
      )
        limitations.push("UPSTREAM_PARTIAL");
      if (required.some((module) => module.status === "unavailable"))
        limitations.push(
          required.some((module) => module.limitations.includes("MODULE_NOT_IMPLEMENTED"))
            ? "MODULE_NOT_IMPLEMENTED"
            : "EXECUTION_UNAVAILABLE",
        );
      if (children.length) {
        ids = children.flatMap((child) => child.judgmentIds);
        if (children.some((child) => child.status !== "complete"))
          limitations.push("SUBFEATURE_INCOMPLETE");
        limitations.push(...children.flatMap((child) => child.limitations));
      } else if (!port) limitations.push("EXECUTOR_NOT_IMPLEMENTED");
      else if (
        !limitations.includes("CORE_UNAVAILABLE") &&
        !required.some((module) => module.status === "unavailable")
      ) {
        VersionSchema.parse(port.version);
        const available = Object.freeze(
          pool.filter(
            (j) =>
              (j.originModule === "base" || ownPlan.modules.includes(j.originModule)) &&
              (j.originModule !== "M03" || ownPlan.topics.includes(j.topic!)),
          ),
        );
        const selection = selectionSchema.parse(
          port.execute(
            Object.freeze({
              featureId: id,
              core,
              otherCore,
              target,
              modules: Object.freeze(required),
              availableJudgments: available,
            }),
          ),
        );
        ids = unique(selection.judgmentIds);
        declared = selection.status;
        if (ids.some((id) => !available.some((j) => j.judgmentId === id)))
          throw new FeatureError("OUTPUT_REJECTED");
      }
      const selected = unique(ids).map((id) => pool.find((j) => j.judgmentId === id)!);
      if (
        selected.some(
          (j) =>
            j.precision !== "confirmed" || j.status !== "complete" || j.disposition !== "accepted",
        )
      )
        limitations.push("UPSTREAM_PARTIAL");
      if (declared === "unavailable") limitations.push("EXECUTION_UNAVAILABLE");
      const status = limitations.includes("CORE_UNAVAILABLE")
        ? "unavailable"
        : children.length
          ? limitations.length
            ? "partial"
            : "complete"
          : required.some((module) => module.status === "unavailable") || declared === "unavailable"
            ? "unavailable"
            : limitations.length || declared === "partial"
              ? "partial"
              : "complete";
      const result: Component = Object.freeze({
        featureId: id,
        profileVersion: profile.version,
        executorVersion: port?.version ?? null,
        status,
        implementation,
        judgmentIds: Object.freeze(unique(ids)),
        limitations: Object.freeze(unique(limitations)),
      });
      componentMemo.set(id, result);
      return result;
    }
    const main = compose(request.featureId);
    const components = Object.freeze(
      [...componentMemo.values()].sort((a, b) => compareText(a.featureId, b.featureId)),
    );
    const judgments = main.judgmentIds
      .map((id) => pool.find((j) => j.judgmentId === id)!)
      .sort((a, b) => compareText(a.judgmentId, b.judgmentId));
    const provenance = {
      moduleId: "M09",
      schemaVersion: "1.0.0",
      rulesVersion: "1.0.0",
      featureProfileVersion: getProfile(request.featureId).version,
      calculationPolicyVersion: "core-manifest-v1",
    } as const;
    const cacheKey = deps.hash.digest(
      canonicalizeJson({
        featureId: request.featureId,
        primary: core.fingerprint,
        other: otherCore?.fingerprint ?? null,
        target,
        provenance,
        modules,
        components,
        judgments,
      }),
    );
    const result = FeatureResultSchema.parse({
      featureId: request.featureId,
      status: main.status,
      judgments,
      limitations: main.limitations,
      target,
      core,
      otherCore,
      modules,
      components,
      provenance,
      cacheKey,
    });
    verified.add(result);
    return result;
  } catch (error) {
    if (error instanceof FeatureError) throw error;
    throw new FeatureError("EXECUTION_FAILED");
  }
}
export const featureEngine: FeatureEngine = Object.freeze({
  execute: async (request: unknown, deps: FeatureDependencies) => executeFeature(request, deps),
});
export function buildFeatureNarrationInput(value: FeatureResult) {
  if (!verified.has(value)) throw new FeatureError("OUTPUT_REJECTED");
  return FeatureNarrationInputSchema.parse({
    featureId: value.featureId,
    status: value.status,
    target: value.target,
    verifiedFindings:
      value.status === "unavailable"
        ? []
        : value.judgments.filter(
            (j) =>
              j.status === "complete" &&
              j.precision === "confirmed" &&
              j.disposition === "accepted",
          ),
    limitations: value.limitations,
  });
}
