import fs from "node:fs";
import path from "node:path";
import { config, SILVERSCRIPT_COMMIT } from "./config.mjs";

const FILES = [
  "SKILL.md",
  "references/official-baseline.md",
  "references/covenant-semantics.md",
  "references/security-checklist.md",
  "references/ai-and-games.md",
  "references/transaction-builder-patterns.md"
];

let cached = "";

export function loadSkillContext() {
  if (cached) return cached;
  const root = path.join(config.root, "knowledge", "kaspa-silverscript");
  cached = FILES.map((name) => {
    const text = fs.readFileSync(path.join(root, name), "utf8");
    return `\n--- ${name} ---\n${text}`;
  }).join("\n");
  return cached;
}

export function skillManifest() {
  return {
    name: "kaspa-silverscript",
    upstreamCommit: SILVERSCRIPT_COMMIT,
    files: FILES.slice()
  };
}
