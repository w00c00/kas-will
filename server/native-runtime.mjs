import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

// Linuxdeploy rewrites ELF RPATHs, invalidating pinned helper hashes. Ship
// helpers as opaque gzip resources and materialize only the exact original
// bytes in the app-owned cache. Never weaken or rewrite the expected hash.
export function resolveNativeBinary(candidate, expectedSha256, dataDirectory) {
  const binary = path.resolve(candidate);
  const archive = binary.endsWith(".gz") ? binary : `${binary}.gz`;
  if (!binary.endsWith(".gz") && fs.existsSync(binary)) return binary;
  if (!fs.existsSync(archive)) return binary;
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error("Compressed native helper has no pinned SHA-256");
  const bytes = gunzipSync(fs.readFileSync(archive), { maxOutputLength: 256 * 1024 * 1024 });
  if (digest(bytes) !== expectedSha256) throw new Error("Compressed native helper SHA-256 mismatch");
  const directory = path.join(path.resolve(dataDirectory), ".runtime-helpers");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("Native helper cache cannot be a symbolic link");
  const name = path.basename(archive, ".gz").replace(/[^a-zA-Z0-9._-]/g, "_");
  const output = path.join(directory, `${name}-${expectedSha256}`);
  if (fs.existsSync(output)) {
    const stat = fs.lstatSync(output);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Native helper cache entry must be a regular file");
    if (digest(fs.readFileSync(output)) === expectedSha256) { fs.chmodSync(output, 0o700); return output; }
  }
  const temporary = `${output}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o700 });
    fs.renameSync(temporary, output);
  } finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  return output;
}
