import { createApprovedPersonaCatalog } from "../../domain/persona/catalog";
import haeyo from "./profiles/synthetic-haeyo.v1.0.0.json";
import formal from "./profiles/synthetic-formal.v1.0.1.json";

// Explicit local developer/evaluation approvals, not product character approvals.
// A file or valid schema alone never registers a persona.
const approvedManifest = [
  { status: "approved", personaId: "synthetic-style", personaVersion: "1.0.0", json: JSON.stringify(haeyo) },
  { status: "approved", personaId: "synthetic-formal", personaVersion: "1.0.1", json: JSON.stringify(formal) },
];
const activeSelections = [
  { personaId: "synthetic-style", personaVersion: "1.0.0" },
  { personaId: "synthetic-formal", personaVersion: "1.0.1" },
];

export function createSyntheticPersonaCatalog() {
  return createApprovedPersonaCatalog(approvedManifest, activeSelections);
}
