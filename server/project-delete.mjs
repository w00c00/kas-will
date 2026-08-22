import { createPortableWillPackage } from "./portable-will-service.mjs";

const WILL_TEMPLATE_IDS = new Set(["inheritance-vault", "kcc20-inheritance-vault"]);
const HEX_32 = /^[0-9a-f]{64}$/;

export const DELETE_CONFIRMATION_PHRASE = "DELETE LOCAL WILL RECORD";

function fail(message, code, status = 400) {
  throw Object.assign(new Error(message), { status, code });
}

export function deleteRequiresBackup(project) {
  return Boolean(project && WILL_TEMPLATE_IDS.has(project.review?.templateId) && project.deployment?.txid);
}

// Removing a local record never touches the chain, but an operated will loses
// its only local handle. Deletion therefore requires the typed confirmation
// phrase, and for deployed wills a commitment proof that the current portable
// package was exported (backed up) immediately before the delete call.
export function assertProjectDeleteAuthorized(project, input = {}, { appVersion = "0.1.0", templates = null } = {}) {
  if (!project) fail("Project not found", "PROJECT_NOT_FOUND", 404);
  if (String(input.confirmation || "") !== DELETE_CONFIRMATION_PHRASE) {
    fail("Type DELETE LOCAL WILL RECORD to confirm removing this local record", "PROJECT_DELETE_CONFIRMATION_REQUIRED");
  }
  if (!deleteRequiresBackup(project)) return;
  let expectedCommitment;
  try {
    expectedCommitment = createPortableWillPackage(project, { appVersion, templates }).commitment;
  } catch {
    // No exportable package exists for this record, so a commitment proof is
    // impossible; the typed phrase remains the only gate.
    return;
  }
  const backupCommitment = String(input.backupCommitment || "").toLowerCase();
  if (!HEX_32.test(backupCommitment)) {
    fail("Back up the will operation package before deleting this on-chain record", "PROJECT_DELETE_BACKUP_REQUIRED", 409);
  }
  if (expectedCommitment !== backupCommitment) {
    fail("The backed-up operation package does not match the current will record; export a fresh backup first", "PROJECT_DELETE_BACKUP_MISMATCH", 409);
  }
}
