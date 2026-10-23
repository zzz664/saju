import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkMarkdownLinks, checkRepositoryDocs } from "../scripts/check-doc-links.mjs";

const root = path.resolve("test-doc-root");
describe("WBS-17 local documentation links", () => {
  it("checks actual tracked documentation without network or secrets", () => {
    const result = checkRepositoryDocs(process.cwd());
    expect(result.files).toBeGreaterThan(30);
    expect(result.links).toBeGreaterThan(30);
    expect(result.issues).toEqual([]);
  });
  it("resolves relative Korean names, escaped spaces and angle-bracket paths", () => {
    const exists = vi.fn<(file: string) => boolean>(() => true);
    const result = checkMarkdownLinks(
      root,
      "docs/index.md",
      "[가](기술설계.md#목차) [나](my%20file.md) [다](<my other.md>)",
      exists,
    );
    expect(result).toEqual({ links: 3, issues: [] });
    expect(exists.mock.calls.map((call) => call[0])).toEqual([
      path.join(root, "docs/기술설계.md"),
      path.join(root, "docs/my file.md"),
      path.join(root, "docs/my other.md"),
    ]);
  });
  it("reports missing targets and their source lines", () => {
    expect(
      checkMarkdownLinks(root, "README.md", "title\n[broken](docs/missing.md)", () => false),
    ).toMatchObject({
      links: 1,
      issues: [{ file: "README.md", line: 2, code: "MISSING_TARGET", target: "docs/missing.md" }],
    });
  });
  it("does not probe outside the repository or accept malformed URL encodings", () => {
    const exists = vi.fn(() => true);
    const result = checkMarkdownLinks(
      root,
      "README.md",
      "[escape](../private.md) [bad](%ZZ.md)",
      exists,
    );
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "OUTSIDE_REPOSITORY",
      "INVALID_PATH",
    ]);
    expect(exists).not.toHaveBeenCalled();
  });
  it("ignores external links, anchors and inline code", () => {
    const exists = vi.fn(() => false);
    const source =
      "[web](https://example.test/path) [mail](mailto:dev@example.test) [anchor](#section) `[literal](missing.md)`";
    expect(checkMarkdownLinks(root, "README.md", source, exists)).toEqual({ links: 0, issues: [] });
    expect(exists).not.toHaveBeenCalled();
  });
  it("ignores backtick and tilde fenced examples but checks images and links after the fence", () => {
    const source =
      '```md\n[x](missing.md)\n```\n~~~\n[y](missing.md)\n~~~\n![asset](image.png) [file](real.md "Title")';
    expect(checkMarkdownLinks(root, "docs/index.md", source, () => true)).toEqual({
      links: 2,
      issues: [],
    });
  });
});
