import { ExperimentError, type ExperimentConcurrencyGate } from "@/domain/experiment";

/** Shared within one process. Tracks active Mock calls and forgets them when they settle. */
export class MemoryExperimentConcurrencyGate implements ExperimentConcurrencyGate {
  #active = new Set<string>();

  acquire(principalId: string, maxConcurrent: number) {
    if (this.#active.size >= maxConcurrent || this.#active.has(principalId))
      throw new ExperimentError("CONCURRENCY_LIMIT");
    this.#active.add(principalId);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.#active.delete(principalId);
      },
    };
  }
}
