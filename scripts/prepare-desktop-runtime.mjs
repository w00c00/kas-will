import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauri = path.join(root, "src-tauri");
const runtime = path.join(tauri, "runtime", "app");
const binaries = path.join(tauri, "binaries");

function copy(relative) {
  const destination = path.join(runtime, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, relative), destination, { recursive: true, force: true });
}

for (const compiler of ["silverc-latest", "silverc-legacy"]) {
  if (!fs.existsSync(path.join(root, "bin", compiler))) throw new Error(`Pinned ${compiler} is missing. Run npm run setup:silverc first.`);
}
if (!fs.existsSync(path.join(root, "bin", "kascov-preflight"))) throw new Error("Pinned local preflight engine is missing. Run npm run setup:kascov-preflight first.");
fs.rmSync(path.join(tauri, "runtime"), { recursive: true, force: true });
fs.mkdirSync(runtime, { recursive: true });
for (const entry of ["server", "src/kcc721-metadata.js", "templates", "knowledge", "config", "third_party", "bin", "dist", "node_modules", "package.json"]) copy(entry);

const hostLine = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).split("\n").find((line) => line.startsWith("host: "));
if (!hostLine) throw new Error("Unable to determine the Rust target triple");
const triple = hostLine.slice(6).trim();
fs.mkdirSync(binaries, { recursive: true });
const extension = process.platform === "win32" ? ".exe" : "";
const sidecar = path.join(binaries, `node-${triple}${extension}`);
fs.copyFileSync(process.execPath, sidecar);
fs.chmodSync(sidecar, 0o755);
fs.chmodSync(path.join(runtime, "bin", "silverc-latest"), 0o755);
fs.chmodSync(path.join(runtime, "bin", "silverc-legacy"), 0o755);
fs.chmodSync(path.join(runtime, "bin", "kascov-preflight"), 0o755);

console.log(`Desktop runtime prepared for ${triple}`);
console.log(`Node sidecar: ${sidecar}`);
