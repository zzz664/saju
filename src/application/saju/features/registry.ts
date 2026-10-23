import { z } from "zod";
import {
  FeatureIdSchema,
  ModuleIdSchema,
  VersionSchema,
  type FeatureId,
  type ModuleId,
} from "@/domain/features/schemas";
import { TopicSchema, type Topic } from "@/domain/judgment/topics/schemas";
const profileSchema = z
  .strictObject({
    featureId: FeatureIdSchema,
    version: VersionSchema,
    modules: z.array(ModuleIdSchema).readonly(),
    topics: z.array(TopicSchema).readonly(),
    children: z.array(FeatureIdSchema).readonly(),
  })
  .readonly();
const rows = [
  ["F01", ["M01", "M02", "M03", "M04"], ["social"], ["F02", "F03", "F04", "F05", "F06", "F07"]],
  ["F02", ["M01", "M03"], ["temperament"], []],
  ["F03", ["M01", "M03"], ["strengths"], []],
  ["F04", ["M01", "M03"], ["career"], []],
  ["F05", ["M01", "M03"], ["wealth"], []],
  ["F06", ["M01", "M02", "M03"], ["romance"], []],
  ["F07", ["M04"], [], []],
  ["F08", ["M01", "M02", "M05", "M07"], [], []],
  ["F09", ["M01", "M02", "M05", "M06", "M07"], [], []],
  ["F10", ["M01", "M02", "M05", "M06", "M07"], [], []],
  ["F11", ["M01", "M02", "M03", "M08"], TopicSchema.options, []],
] as const;
export const FEATURE_PROFILES = z
  .array(profileSchema)
  .length(11)
  .readonly()
  .parse(
    rows.map(([featureId, modules, topics, children]) => ({
      featureId,
      modules,
      topics,
      children,
      version: "1.0.0",
    })),
  );
export const MODULE_DEPENDENCIES: Readonly<Record<ModuleId, readonly ModuleId[]>> = Object.freeze({
  M01: Object.freeze([]),
  M02: Object.freeze([]),
  M03: Object.freeze(["M01", "M02"] as const),
  M04: Object.freeze([]),
  M05: Object.freeze([]),
  M06: Object.freeze([]),
  M07: Object.freeze(["M01", "M02", "M05", "M06"] as const),
  M08: Object.freeze(["M01", "M02", "M03"] as const),
});
export function getProfile(id: FeatureId) {
  return FEATURE_PROFILES.find((profile) => profile.featureId === id)!;
}
export function planFeature(id: FeatureId): Readonly<{
  modules: readonly ModuleId[];
  topics: readonly Topic[];
  features: readonly FeatureId[];
}> {
  const modules = new Set<ModuleId>(),
    topics = new Set<Topic>(),
    features = new Set<FeatureId>();
  function module(id: ModuleId) {
    if (modules.has(id)) return;
    for (const dep of MODULE_DEPENDENCIES[id]) module(dep);
    modules.add(id);
  }
  function feature(id: FeatureId) {
    if (features.has(id)) return;
    const profile = getProfile(id);
    profile.modules.forEach(module);
    profile.topics.forEach((topic) => topics.add(topic));
    profile.children.forEach(feature);
    features.add(id);
  }
  feature(id);
  return Object.freeze({
    modules: Object.freeze([...modules].sort()),
    topics: Object.freeze([...topics].sort()),
    features: Object.freeze([...features].sort()),
  });
}
