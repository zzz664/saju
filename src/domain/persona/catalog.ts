import { z } from "zod";
import { createApprovedPersonaRegistry, PersonaError, PersonaSelectionSchema } from "./index";

/** Trusted server configuration only. Registration and active selection are separate:
 * historical versions may remain registered while each persona has one active version. */
export function createApprovedPersonaCatalog(manifest: unknown = [], activeSelections: unknown = []) {
  const registry = createApprovedPersonaRegistry(manifest);
  const parsed = z.array(PersonaSelectionSchema).max(50)
    .refine(rows => new Set(rows.map(row => row.personaId)).size === rows.length).safeParse(activeSelections);
  if (!parsed.success) throw new PersonaError("REGISTRY_REJECTED");
  const selections = new Map(parsed.data.map(item => [item.personaId, item]));
  const profiles = Object.freeze(parsed.data.map(item => registry.load(item)));
  return {
    registry, profiles,
    personas: profiles.map(item => ({ id: item.personaId, label: item.displayName })),
    selection(personaId: string) {
      const selected = selections.get(personaId);
      if (!selected) throw new PersonaError("SELECTION_REJECTED");
      return selected;
    },
  };
}
