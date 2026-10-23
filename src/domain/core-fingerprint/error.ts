import { defineCodedError } from "@/domain/utilities";
const messages = {
  JSON_REJECTED: "Fingerprint JSON value was rejected.",
  DOCUMENT_REJECTED: "Fingerprint document was rejected.",
  HASH_FAILED: "Fingerprint hashing failed.",
} as const;
export class FingerprintError extends defineCodedError("FingerprintError", messages) {}
