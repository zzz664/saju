export interface DocumentationIssue {
  file: string;
  line: number;
  code: "INVALID_PATH" | "OUTSIDE_REPOSITORY" | "MISSING_TARGET";
  target: string;
}
export function checkMarkdownLinks(
  root: string,
  file: string,
  source: string,
  exists?: (file: string) => boolean,
): { links: number; issues: DocumentationIssue[] };
export function checkRepositoryDocs(root?: string): {
  files: number;
  links: number;
  issues: DocumentationIssue[];
};
