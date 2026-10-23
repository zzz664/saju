import {
  experimentDay,
  ExperimentBudgetSchema,
  ExperimentError,
  type ExperimentAccess,
  type ExperimentBudget,
  type ExperimentBudgetStore,
} from "@/domain/experiment";

const zero = (): ExperimentBudget => ({ calls: 0, tokens: 0, microUsd: 0 });
/** Single-process local mock ledger. No reset/eviction/refund endpoint. Never use for live billing. */
export class MemoryExperimentBudgetStore implements ExperimentBudgetStore {
  #daily = new Map<string, ExperimentBudget>();
  #principals = new Map<string, ExperimentBudget>();
  #sessions = new Map<string, ExperimentBudget>();
  #activePrincipals = new Map<string, number>();
  #active = 0;
  #lastNow = -1;
  readonly #maxEntries: number;
  constructor(maxEntries = 10000) {
    if (!Number.isInteger(maxEntries) || maxEntries < 3 || maxEntries > 1000000)
      throw new ExperimentError("POLICY_REJECTED");
    this.#maxEntries = maxEntries;
  }
  reserve({ now, access, allocation, policy }: Parameters<ExperimentBudgetStore["reserve"]>[0]) {
    if (!ExperimentBudgetSchema.safeParse(allocation).success || allocation.calls !== 1)
      throw new ExperimentError("POLICY_REJECTED");
    const day = experimentDay(now);
    if (now < this.#lastNow) throw new ExperimentError("CLOCK_INVALID");
    this.#lastNow = now;
    if (this.#active >= policy.maxConcurrent || this.#activePrincipals.has(access.principalId))
      throw new ExperimentError("CONCURRENCY_LIMIT");
    const scopes = [
      { map: this.#daily, key: day, limit: policy.daily },
      {
        map: this.#principals,
        key: JSON.stringify([day, access.principalId]),
        limit: policy.perPrincipalDaily,
      },
      {
        map: this.#sessions,
        key: JSON.stringify([access.principalId, access.sessionId]),
        limit: policy.perSession,
      },
    ];
    const updates = scopes.map(({ map, key, limit }) => {
      const used = map.get(key) ?? zero();
      if (
        allocation.calls > limit.calls - used.calls ||
        allocation.tokens > limit.tokens - used.tokens ||
        allocation.microUsd > limit.microUsd - used.microUsd
      )
        throw new ExperimentError("BUDGET_EXCEEDED");
      return {
        map,
        key,
        used: {
          calls: used.calls + allocation.calls,
          tokens: used.tokens + allocation.tokens,
          microUsd: used.microUsd + allocation.microUsd,
        },
      };
    });
    const newEntries = updates.filter(({ map, key }) => !map.has(key)).length;
    if (
      this.#daily.size + this.#principals.size + this.#sessions.size + newEntries >
      this.#maxEntries
    )
      throw new ExperimentError("STORE_UNAVAILABLE");
    // Synchronous checks and writes: no await/callback between checking and reserving all scopes.
    for (const { map, key, used } of updates) map.set(key, used);
    this.#active++;
    this.#activePrincipals.set(access.principalId, 1);
    let released = false;
    const settle = () => {
      if (released) return;
      released = true;
      this.#active--;
      this.#activePrincipals.delete(access.principalId);
    };
    return { settle, release: settle };
  }
  /** Internal inspection for local tests; no raw prompt/input, no HTTP exposure. */
  inspect(now: number, access: ExperimentAccess) {
    const day = experimentDay(now);
    return Object.freeze({
      daily: Object.freeze({ ...(this.#daily.get(day) ?? zero()) }),
      principal: Object.freeze({
        ...(this.#principals.get(JSON.stringify([day, access.principalId])) ?? zero()),
      }),
      session: Object.freeze({
        ...(this.#sessions.get(JSON.stringify([access.principalId, access.sessionId])) ?? zero()),
      }),
      active: this.#active,
    });
  }
}
