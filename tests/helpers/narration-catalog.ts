import { composeInterpretationCatalog } from "@/infrastructure/interpretation/catalog";
import { nodeSha256Adapter } from "@/infrastructure/hashing";

// Existing narration-plan fixture, moved unchanged. Explicit data replaces repository defaults.
const passage = "正月甲木。初春尚有餘寒。得丙癸透。富貴雙全。";
const digest = nodeSha256Adapter.digest(passage);
const stamp = "2026-10-24T00:00:00.000Z";
export const summarizedCatalog = composeInterpretationCatalog(
  {
    schemaVersion: "1.0.0",
    note: "test",
    passages: { "src.qtbj.gap-in": { passage, retrievedAt: stamp, passageDigest: digest } },
  },
  {
    schemaVersion: "1.0.0",
    note: "test",
    summaries: {
      "iu.qtbj.gap-in": {
        text: "정월의 갑목은 초봄의 추위가 남아 병화와 계수가 함께 드러나는 것을 귀하게 본다는 구절이다.",
        modelId: "gpt-4o-mini",
        promptVersion: "1.0.0",
        generatedAt: stamp,
        passageDigest: digest,
        entailment: { status: "passed", modelId: "gpt-4o-mini", checkedAt: stamp },
      },
    },
  },
);
const empty = { schemaVersion: "1.0.0", note: "test" };
export const unsummarizedCatalog = composeInterpretationCatalog(
  { ...empty, passages: {} },
  { ...empty, summaries: {} },
);
export const emptyCatalog = { ...unsummarizedCatalog, sources: [], units: [] };
