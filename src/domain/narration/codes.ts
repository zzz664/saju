import { z } from "zod";

/** Pure code enums shared by the server validator and the client view; no engine imports. */
export const NarrationRejectionCodeSchema = z.enum([
  "BYTES",
  "JSON_PARSE",
  "SCHEMA",
  "BEAT_SET",
  "ALIAS_UNKNOWN",
  "ALIAS_MISSING",
  "LENGTH",
  "DATE_FORBIDDEN",
  "INTERNAL_ID_LEAK",
]);
export type NarrationRejectionCode = z.infer<typeof NarrationRejectionCodeSchema>;

export const StyleIssueCodeSchema = z.enum([
  "REGISTER_MIX",
  "STOCK_PHRASE",
  "CERTAINTY",
  "EMOJI",
  "CATCHPHRASE_LIMIT",
  "PARAGRAPH_COUNT",
  "SENTENCE_COUNT",
  "DUPLICATE_PARAGRAPH",
]);
export type StyleIssueCode = z.infer<typeof StyleIssueCodeSchema>;
