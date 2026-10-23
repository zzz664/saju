import type { NatalFactsDependencies } from "@/application/natal-facts";
import type { HashedCoreExport, Sha256Adapter } from "@/domain/core-fingerprint";
import type {
  FeatureId,
  ModuleId,
  Subject,
  FeatureTarget,
  FeatureJudgment,
  ModuleSnapshot,
  FeatureResult,
} from "@/domain/features/schemas";
import type { Topic } from "@/domain/judgment/topics/schemas";

export type ModuleContext = Readonly<{
  moduleId: ModuleId;
  subject: Subject;
  topic: Topic | null;
  core: HashedCoreExport;
  otherCore: HashedCoreExport | null;
  target: FeatureTarget | null;
  upstream: readonly ModuleSnapshot[];
}>;
export type FeatureContext = Readonly<{
  featureId: FeatureId;
  core: HashedCoreExport;
  otherCore: HashedCoreExport | null;
  target: FeatureTarget | null;
  modules: readonly ModuleSnapshot[];
  availableJudgments: readonly FeatureJudgment[];
}>;
// Trusted server assembly ports. Neither raw request fields nor LLM responses configure these ports.
export type ModuleExecutor = Readonly<{
  version: string;
  execute: (context: ModuleContext) => unknown;
}>;
export type FeatureExecutor = Readonly<{
  version: string;
  execute: (context: FeatureContext) => unknown;
}>;
export interface FeatureDependencies extends NatalFactsDependencies {
  readonly hash: Sha256Adapter;
  readonly moduleExecutors?: Readonly<Partial<Record<ModuleId, ModuleExecutor>>>;
  readonly featureExecutors?: Readonly<Partial<Record<FeatureId, FeatureExecutor>>>;
}
export interface FeatureEngine {
  execute(request: unknown, dependencies: FeatureDependencies): Promise<FeatureResult>;
}
