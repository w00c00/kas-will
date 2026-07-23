import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config, SILVERSCRIPT_COMMIT } from "./config.mjs";
import { boundedText, sha256 } from "./security.mjs";

const execFileAsync = promisify(execFile);

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function compilerManifest() {
  const bin = config.compiler.bin;
  if (!fs.existsSync(bin)) throw Object.assign(new Error("SilverScript compiler is not installed. Run npm run setup:silverc"), { code: "SILVERC_NOT_INSTALLED" });
  if (!/^[0-9a-f]{64}$/.test(config.compiler.sha256)) throw Object.assign(new Error("SilverScript compiler SHA-256 is not pinned"), { code: "SILVERC_HASH_REQUIRED" });
  const actualSha256 = hashFile(bin);
  if (actualSha256 !== config.compiler.sha256) {
    throw Object.assign(new Error("SilverScript compiler hash does not match config/compiler.json"), {
      code: "SILVERC_HASH_MISMATCH",
      expectedSha256: config.compiler.sha256,
      actualSha256
    });
  }
  if (config.compiler.upstreamCommit !== SILVERSCRIPT_COMMIT) {
    throw Object.assign(new Error("Compiler manifest is pinned to a different SilverScript commit"), { code: "SILVERC_COMMIT_MISMATCH" });
  }
  const stat = fs.statSync(bin);
  return { bin, sha256: actualSha256, size: stat.size, upstreamCommit: config.compiler.upstreamCommit };
}

export async function staticAnalyze(source) {
  const text = boundedText(source, "contract source");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-audit-"));
  const sourceFile = path.join(directory, "contract.sil");
  try {
    fs.writeFileSync(sourceFile, text, { mode: 0o600 });
    const script = path.join(config.root, "knowledge", "kaspa-silverscript", "scripts", "audit_silverscript.py");
    const { stdout } = await execFileAsync("python3", [script, sourceFile], { timeout: 20_000, maxBuffer: 2_000_000 });
    const findings = String(stdout || "").split("\n").map((line) => {
      const match = line.match(/:(\d+):\s+(SS\d+):\s+(.+)$/);
      return match ? { line: Number(match[1]), code: match[2], message: match[3] } : null;
    }).filter(Boolean);
    return {
      kind: "heuristic-triage",
      findings,
      findingCount: findings.length,
      note: "Static pattern triage only; successful output is not compilation or a security proof."
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export async function compileContract({ source, constructorArgs = [] }) {
  const text = boundedText(source, "contract source");
  if (!Array.isArray(constructorArgs)) throw new Error("constructorArgs must be an array");
  const encodedArgs = JSON.stringify(constructorArgs);
  if (Buffer.byteLength(encodedArgs, "utf8") > 200_000) throw new Error("constructorArgs exceed 200KB");
  const compiler = compilerManifest();
  const analysis = await staticAnalyze(text);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-compile-"));
  const sourceFile = path.join(directory, "contract.sil");
  const argsFile = path.join(directory, "constructor.json");
  try {
    fs.writeFileSync(sourceFile, text, { mode: 0o600 });
    fs.writeFileSync(argsFile, encodedArgs, { mode: 0o600 });
    const { stdout, stderr } = await execFileAsync(compiler.bin, [
      sourceFile,
      "--constructor-args", argsFile,
      "--stdout"
    ], { timeout: 60_000, maxBuffer: 10_000_000 });
    let rawArtifact;
    try { rawArtifact = JSON.parse(stdout); } catch {
      throw Object.assign(new Error("silverc did not return a JSON artifact"), { stderr: String(stderr || "").slice(0, 4000) });
    }
    if (!Array.isArray(rawArtifact.script) || rawArtifact.script.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      throw new Error("silverc artifact has an invalid script byte array");
    }
    const program = Buffer.from(rawArtifact.script);
    return {
      contractName: rawArtifact.contract_name || "",
      compilerVersion: rawArtifact.compiler_version || "",
      abi: rawArtifact.abi || [],
      programHex: program.toString("hex"),
      programSha256: sha256(program),
      sourceSha256: sha256(text),
      constructorArgsSha256: sha256(encodedArgs),
      compiledAt: new Date().toISOString(),
      compiler,
      analysis,
      warnings: String(stderr || "").trim().split("\n").filter(Boolean).slice(0, 100)
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
