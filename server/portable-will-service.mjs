import { sha256, stable } from "./security.mjs";

export const PORTABLE_WILL_KIND = "kas-will-portable-will";
export const PORTABLE_WILL_VERSION = 1;
const WILL_TEMPLATE_IDS = new Set(["inheritance-vault", "kcc20-inheritance-vault"]);
const HEX_32 = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;

function fail(message, code = "INVALID_PORTABLE_WILL") {
  throw Object.assign(new Error(message), { status: 400, code });
}

function parsePackage(input) {
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > 1_000_000) fail("Portable will package exceeds 1 MB");
    try { return JSON.parse(input); } catch { fail("Portable will package is not valid JSON"); }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Portable will package must be a JSON object");
  return structuredClone(input);
}

function artifactIdentity(project) {
  const artifact = project?.artifact || {};
  return {
    programSha256: String(artifact.programSha256 || "").toLowerCase(),
    sourceSha256: String(artifact.sourceSha256 || "").toLowerCase(),
    constructorArgsSha256: String(artifact.constructorArgsSha256 || "").toLowerCase(),
    compilerProfileId: String(project?.compilerProfileId || artifact.compiler?.id || ""),
    compilerCommit: String(artifact.compiler?.upstreamCommit || "").toLowerCase()
  };
}

function publicDeployment(deployment) {
  if (!deployment?.txid) return null;
  return {
    txid: String(deployment.txid).toLowerCase(),
    covenantId: String(deployment.covenantId || "").toLowerCase(),
    network: String(deployment.network || "tn10"),
    status: String(deployment.status || "active"),
    activeTxid: String(deployment.activeTxid || deployment.txid).toLowerCase(),
    activeOutputIndex: Number(deployment.activeOutputIndex ?? 0),
    broadcastAt: String(deployment.broadcastAt || ""),
    kascovTransactionUrl: String(deployment.kascovTransactionUrl || ""),
    kascovCovenantUrl: String(deployment.kascovCovenantUrl || ""),
    lastOperationAt: String(deployment.lastOperationAt || ""),
    history: Array.isArray(deployment.history) ? structuredClone(deployment.history.slice(-100)) : []
  };
}

function portablePayload(project) {
  if (!project?.artifact) fail("Compile the will before exporting it", "PORTABLE_WILL_NOT_COMPILED");
  const templateId = String(project.review?.templateId || "");
  if (!WILL_TEMPLATE_IDS.has(templateId)) fail("Only Kas Will inheritance templates can be exported");
  return {
    network: String(project.network || "tn10"),
    project: {
      name: String(project.name || "Kas Will").slice(0, 120),
      source: String(project.source || ""),
      constructorArgs: structuredClone(project.constructorArgs || []),
      compilerProfileId: String(project.compilerProfileId || ""),
      templateParameters: structuredClone(project.templateParameters || {}),
      deployAmount: String(project.deployAmount || "0"),
      requirements: String(project.requirements || ""),
      specification: structuredClone(project.specification || null),
      transactionPlans: Array.isArray(project.transactionPlans) ? structuredClone(project.transactionPlans) : [],
      review: structuredClone(project.review || null),
      deployment: publicDeployment(project.deployment),
      artifact: artifactIdentity(project)
    }
  };
}

function resolveTemplateRevision(templates, templateId, source) {
  if (!templates || typeof templates.matchHistoryRevision !== "function") return null;
  return templates.matchHistoryRevision(templateId, source);
}

export function createPortableWillPackage(project, { appVersion = "0.1.0", exportedAt = new Date().toISOString(), templates = null } = {}) {
  const payload = portablePayload(project);
  const templateId = String(payload.project.review?.templateId || "");
  const template = templateId && templates ? templates.get(templateId) : null;
  if (template && payload.project.source !== template.source) {
    const revision = resolveTemplateRevision(templates, templateId, payload.project.source);
    payload.project.templateRevision = revision ? revision.id : "unrecognized";
  }
  return {
    kind: PORTABLE_WILL_KIND,
    version: PORTABLE_WILL_VERSION,
    appVersion: String(appVersion),
    exportedAt,
    payload,
    commitment: sha256(JSON.stringify(stable(payload)))
  };
}

export function inspectPortableWillPackage(input, templates) {
  const pkg = parsePackage(input);
  if (pkg.kind !== PORTABLE_WILL_KIND || Number(pkg.version) !== PORTABLE_WILL_VERSION) fail("Unsupported portable will package format");
  const payload = pkg.payload;
  const actualCommitment = sha256(JSON.stringify(stable(payload)));
  if (!HEX_32.test(String(pkg.commitment || "").toLowerCase()) || actualCommitment !== String(pkg.commitment).toLowerCase()) {
    fail("Portable will package commitment does not match its contents", "PORTABLE_WILL_COMMITMENT_MISMATCH");
  }
  if (payload?.network !== "tn10") fail("Kas Will v0.1.0 portable packages are TN10-only", "PORTABLE_WILL_WRONG_NETWORK");
  const project = payload?.project;
  const templateId = String(project?.review?.templateId || "");
  if (!WILL_TEMPLATE_IDS.has(templateId)) fail("Portable package does not contain a supported inheritance template");
  const expected = templates.projectInput(templateId, payload.network, project.templateParameters, {
    encodingVersion: Number(project.review?.parameterEncodingVersion || 1)
  });
  if (project.compilerProfileId !== expected.compilerProfileId || project.artifact?.compilerProfileId !== expected.compilerProfileId) {
    fail("Portable will does not use the template's pinned compiler profile", "PORTABLE_WILL_COMPILER_PROFILE_MISMATCH");
  }
  let templateRevision = "current";
  if (project.source !== expected.source) {
    const revision = resolveTemplateRevision(templates, templateId, project.source);
    if (!revision) {
      fail("Portable will source or constructor arguments differ from the deterministic template", "PORTABLE_WILL_TEMPLATE_DRIFT");
    }
    templateRevision = revision.id;
  }
  if (JSON.stringify(project.constructorArgs) !== JSON.stringify(expected.constructorArgs)) {
    fail("Portable will source or constructor arguments differ from the deterministic template", "PORTABLE_WILL_TEMPLATE_DRIFT");
  }
  const identity = project.artifact || {};
  for (const field of ["programSha256", "sourceSha256", "constructorArgsSha256"]) {
    if (!HEX_32.test(String(identity[field] || "").toLowerCase())) fail(`Portable will artifact ${field} is invalid`);
  }
  if (!GIT_COMMIT.test(String(identity.compilerCommit || "").toLowerCase())) fail("Portable will artifact compilerCommit is invalid");
  if (identity.sourceSha256 !== sha256(project.source) || identity.constructorArgsSha256 !== sha256(JSON.stringify(project.constructorArgs))) {
    fail("Portable will artifact hashes do not match its deterministic source and arguments", "PORTABLE_WILL_STALE_ARTIFACT");
  }
  const deployment = project.deployment;
  if (deployment) {
    if (!HEX_32.test(deployment.txid) || !HEX_32.test(deployment.covenantId) || !HEX_32.test(deployment.activeTxid || deployment.txid)) {
      fail("Portable will deployment identity is invalid");
    }
    if (deployment.network !== "tn10" || !Number.isSafeInteger(deployment.activeOutputIndex) || deployment.activeOutputIndex < 0) {
      fail("Portable will deployment state is invalid");
    }
  }
  return { package: pkg, payload, project, templateId, commitment: actualCommitment, templateRevision };
}

export function portableWillMatchesProject(inspected, project) {
  if (!project?.artifact) return false;
  const candidate = inspected.project;
  return project.network === inspected.payload.network
    && project.review?.templateId === inspected.templateId
    && project.source === candidate.source
    && JSON.stringify(project.constructorArgs) === JSON.stringify(candidate.constructorArgs)
    && project.artifact.programSha256 === candidate.artifact.programSha256
    && (!candidate.deployment?.covenantId || !project.deployment?.covenantId || candidate.deployment.covenantId === project.deployment.covenantId);
}
