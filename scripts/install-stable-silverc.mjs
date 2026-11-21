// Install an already-built, exact official checkout without touching legacy
// compiler binaries or the user's wallets. The manifest is generated local data.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cargoReleaseBinary, executableName, makeExecutable } from "./platform-binaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.argv[2] || ".");
const commit = "3ed973335b59269293564805cc2c58a14595ec03";
const output = (args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
if (output(["rev-parse", "HEAD"]) !== commit || output(["status", "--porcelain", "--untracked-files=no"])) {
  throw new Error("Expected a clean official SilverScript v1.0.0 checkout at the pinned commit");
}
execFileSync("cargo", ["build", "--locked", "--release", "-p", "silverscript-lang", "--bin", "silverc"], {
  cwd: source, stdio: "inherit", env: { ...process.env, RUSTUP_TOOLCHAIN: "1.95.0" }
});
const destination = path.join(root, "bin", executableName("silverc-1.0.0"));
fs.copyFileSync(cargoReleaseBinary(path.join(source, "target"), "silverc"), destination);
makeExecutable(destination);
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(destination)).digest("hex");
const file = path.join(root, "config/compiler.json");
const stored = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { defaultProfileId: "latest-023c7ee", profiles: {} };
stored.profiles ||= {};
stored.profiles["stable-1.0.0"] = { bin: destination, sha256, upstreamCommit: commit, builtAt: new Date().toISOString() };
fs.writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ profile: "stable-1.0.0", commit, sha256 }));
