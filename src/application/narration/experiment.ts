import { narrateCore } from "@/application/narration";
import { NarrationError, type NarrationProvider } from "@/domain/narration";
import {
  experimentDay,
  ExperimentAccessSchema,
  ExperimentError,
  ExperimentPolicySchema,
  quoteExperimentRequest,
  type ExperimentBudgetStore,
} from "@/domain/experiment";

/** Server-owned composition only: never bind policy/identity/clock/store to request body fields. */
export interface ExperimentRunnerOptions {
  readonly policy: unknown;
  readonly provider: NarrationProvider;
  readonly store: ExperimentBudgetStore;
  readonly environment?: () => string | undefined;
  readonly now?: () => number;
  readonly resolveAccess?: () => Promise<unknown>;
  readonly model?: string;
}
type Execution<T> = (
  core: unknown,
  provider: NarrationProvider,
  options: { readonly signal?: AbortSignal },
) => Promise<T>;
export function createExperimentRunner<T>(
  options: ExperimentRunnerOptions & { readonly execute: Execution<T> },
): { run(core: unknown, options?: { readonly signal?: AbortSignal }): Promise<T> };
export function createExperimentRunner(options: ExperimentRunnerOptions): {
  run(core: unknown, options?: { readonly signal?: AbortSignal }): ReturnType<typeof narrateCore>;
};
export function createExperimentRunner(
  options: ExperimentRunnerOptions & { readonly execute?: Execution<unknown> },
) {
  const parsed = ExperimentPolicySchema.safeParse(options.policy);
  if (!parsed.success) throw new ExperimentError("POLICY_REJECTED");
  const policy = parsed.data;
  const environment = options.environment ?? (() => undefined);
  const now = options.now ?? (() => Date.now());
  const resolveAccess = options.resolveAccess ?? (async () => null);
  function checkEnvironment() {
    try {
      const instant = now();
      experimentDay(instant);
      if (!policy.enabled || environment() !== "development" || instant >= policy.expiresAt)
        throw new ExperimentError("ACCESS_DENIED");
      return instant;
    } catch (cause) {
      throw cause instanceof ExperimentError ? cause : new ExperimentError("ACCESS_DENIED");
    }
  }
  return Object.freeze({
    async run(core: unknown, { signal }: { readonly signal?: AbortSignal } = {}) {
      if (signal?.aborted) throw new NarrationError("CANCELLED");
      checkEnvironment();
      if (options.provider.kind !== "mock") throw new NarrationError("LIVE_DISABLED");
      let rawAccess: unknown;
      try {
        rawAccess = await resolveAccess();
      } catch {
        throw new ExperimentError("ACCESS_DENIED");
      }
      if (signal?.aborted) throw new NarrationError("CANCELLED");
      const access = ExperimentAccessSchema.safeParse(rawAccess);
      if (!access.success || !policy.allowedPrincipalIds.includes(access.data.principalId))
        throw new ExperimentError("ACCESS_DENIED");
      let denial: ExperimentError | undefined;
      const guarded: NarrationProvider = {
        kind: "mock",
        async generate(request, callOptions) {
          let lease: ReturnType<ExperimentBudgetStore["reserve"]>;
          const limitedRequest = Object.freeze({
            ...request,
            maxOutputTokens: policy.maxOutputTokens,
          });
          try {
            const instant = checkEnvironment();
            if (options.provider.kind !== "mock") throw new ExperimentError("ACCESS_DENIED");
            const allocation = quoteExperimentRequest(limitedRequest, policy);
            lease = options.store.reserve({
              now: instant,
              access: access.data,
              allocation,
              policy,
            });
          } catch (cause) {
            denial =
              cause instanceof ExperimentError ? cause : new ExperimentError("STORE_UNAVAILABLE");
            throw denial;
          }
          // Deliberately release when the underlying supplier settles, not when its caller aborts.
          try {
            return await options.provider.generate(limitedRequest, callOptions);
          } finally {
            lease.settle();
          }
        },
      };
      // Execution is a trusted server strategy, never a request body callback or prompt.
      try {
        return await (options.execute ?? narrateCore)(core, guarded, {
          signal,
          model: options.model,
        });
      } catch (cause) {
        if (denial) throw denial;
        throw cause;
      }
    },
  });
}
