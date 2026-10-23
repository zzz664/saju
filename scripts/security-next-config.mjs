import { copyFile, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

/** Caller supplies its newly-created QA workspace; never change the source config. */
export async function configureOfflineNext(workspace) {
  const file = path.join(workspace, "next.config.ts");
  const source = await readFile(file, "utf8"), marker = "export default nextConfig;";
  if (source.split(marker).length !== 2) throw new Error("Offline QA requires the reviewed named nextConfig export.");
  await copyFile(file, path.join(workspace, "next.qa-base.config.ts"), constants.COPYFILE_EXCL);
  await writeFile(file, source.replace(marker, `nextConfig.experimental = { ...nextConfig.experimental, agentUpgrade: false };
${marker}`), "utf8");
}
