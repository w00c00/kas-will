import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { resolveNativeBinary } from "../server/native-runtime.mjs";

test("compressed helpers preserve exact pinned bytes and reject tampering", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kas-will-native-"));
  try {
    const bytes = Buffer.from("Public native helper test data, not a wallet secret");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const binary = path.join(directory, "silverc-1.0.0"), archive = `${binary}.gz`, cache = path.join(directory, "cache");
    fs.writeFileSync(archive, gzipSync(bytes));
    const resolved = resolveNativeBinary(binary, hash, cache);
    assert.deepEqual(fs.readFileSync(resolved), bytes);
    assert.equal(resolveNativeBinary(archive, hash, cache), resolved);
    fs.writeFileSync(resolved, "modified cache");
    assert.deepEqual(fs.readFileSync(resolveNativeBinary(binary, hash, cache)), bytes);
    assert.throws(() => resolveNativeBinary(binary, "00".repeat(32), cache), /SHA-256 mismatch/);
    assert.throws(() => resolveNativeBinary(binary, "", cache), /pinned SHA-256/);
    fs.writeFileSync(archive, gzipSync(Buffer.from("modified archive")));
    assert.throws(() => resolveNativeBinary(binary, hash, cache), /SHA-256 mismatch/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("uncompressed helper paths stay unchanged; linked cache directories are refused", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kas-will-native-"));
  try {
    const binary = path.join(directory, "helper");
    fs.writeFileSync(binary, "public test data");
    assert.equal(resolveNativeBinary(binary, "", directory), binary);
    if (process.platform !== "win32") {
      const bytes = Buffer.from("public archive data"), hash = crypto.createHash("sha256").update(bytes).digest("hex");
      fs.writeFileSync(`${binary}.gz`, gzipSync(bytes)); fs.unlinkSync(binary);
      const elsewhere = path.join(directory, "elsewhere");fs.mkdirSync(elsewhere);
      fs.symlinkSync(elsewhere, path.join(directory, ".runtime-helpers"));
      assert.throws(() => resolveNativeBinary(binary, hash, directory), /symbolic link/);
      assert.deepEqual(fs.readdirSync(elsewhere), []);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
