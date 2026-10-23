import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Local inline Markdown links only. Does not fetch URLs or read linked targets. */
export function checkMarkdownLinks(root, file, source, exists = fs.existsSync) {
  const base = path.resolve(root),
    from = path.resolve(base, file),
    issues = [];
  let fence = null,
    links = 0;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const prose = line.replace(/`[^`\n]*`/g, "");
    for (const match of prose.matchAll(
      /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+["'][^"'\n]*["'])?\s*\)/g,
    )) {
      const raw = match[1].replace(/^<|>$/g, "");
      if (!raw || raw.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//"))
        continue;
      links++;
      let target;
      try {
        target = decodeURIComponent(raw.split(/[?#]/)[0]);
      } catch {
        issues.push({ file, line: index + 1, code: "INVALID_PATH", target: raw });
        continue;
      }
      const resolved = path.resolve(path.dirname(from), target),
        relative = path.relative(base, resolved);
      const code =
        relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)
          ? "OUTSIDE_REPOSITORY"
          : exists(resolved)
            ? null
            : "MISSING_TARGET";
      if (code) issues.push({ file, line: index + 1, code, target });
    }
  }
  return { links, issues };
}

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? markdownFiles(full) : entry.name.endsWith(".md") ? [full] : [];
  });
}
export function checkRepositoryDocs(root = process.cwd()) {
  const files = [
    path.join(root, "README.md"),
    path.join(root, "AGENTS.md"),
    ...markdownFiles(path.join(root, "docs")),
    ...markdownFiles(path.join(root, "src")),
  ];
  const results = files.map((file) =>
    checkMarkdownLinks(
      root,
      path.relative(root, file).replaceAll(path.sep, "/"),
      fs.readFileSync(file, "utf8"),
    ),
  );
  return {
    files: files.length,
    links: results.reduce((sum, result) => sum + result.links, 0),
    issues: results.flatMap((result) => result.issues),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = checkRepositoryDocs();
    console.log(JSON.stringify(result, null, 2));
    if (result.issues.length) process.exitCode = 1;
  } catch {
    console.error("Local documentation check failed.");
    process.exitCode = 1;
  }
}
