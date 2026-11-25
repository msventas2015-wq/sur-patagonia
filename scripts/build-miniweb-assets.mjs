import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

const m = JSON.parse(await readFile("worker/miniweb-public-assets.json", "utf8"));
if (m.version !== 1 || m.assets.length !== 777 || m.runtime.length !== 28)
  throw Error("manifest_invalid");
const all = [...m.assets, ...m.runtime];
if (new Set(all.map(f => f.path)).size !== 805) throw Error("duplicate_path");

for (const f of all) {
  if (typeof f.path !== "string" || f.path.startsWith("/") ||
      f.path.includes(String.fromCharCode(92)) ||
      f.path.split("/").some(x => x === ".." || x.startsWith(".")) ||
      !/^([a-f0-9]{64})$/.test(f.sha256))
    throw Error("path_invalid");
}

const data = [];
for (const f of all) {
  const b = await readFile(f.path);
  if (createHash("sha256").update(b).digest("hex") !== f.sha256)
    throw Error("source_changed:" + f.path);
  if (m.assets.includes(f)) {
    if (["docs", "tmp", "worker", "supabase", "scripts", "node_modules"].includes(f.path.split("/")[0]))
      throw Error("nonpublic_path");
    data.push([f.path, b]);
  }
}

await rm("dist", { recursive: true, force: true });
for (const [p, b] of data) {
  await mkdir(dirname("dist/" + p), { recursive: true });
  await writeFile("dist/" + p, b);
}
console.log("PUBLIC_ASSETS_VERIFIED", data.length, "RUNTIME_VERIFIED", m.runtime.length);
