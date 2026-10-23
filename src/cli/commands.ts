export const INPUT_COMMANDS = Object.freeze([
  "validate",
  "calculate",
  "normalize-time",
  "calculate-policy",
  "derive-facts",
  "judge-facts",
  "arbitrate-facts",
  "diagnose-structure",
  "export-json",
  "manual-prompt",
  "hash-json",
] as const);
export const CLI_COMMANDS = Object.freeze([...INPUT_COMMANDS, "export-schema", "--help"]);
