import { NETWORKS } from "./config.mjs";
import { sompiToKas } from "./kaspa-service.mjs";

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function configuredDurationSeconds(project) {
  const duration = project?.templateParameters?.inactivity || project?.templateParameters?.inactivityDays;
  const value = Number(duration?.value);
  const unit = String(duration?.unit || "");
  const multiplier = { seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[unit];
  return Number.isFinite(value) && multiplier ? value * multiplier : null;
}

export function buildLifecycleStatus(project, source, node, now = Date.now()) {
  const network = NETWORKS[project.network];
  const blockDaaScore = BigInt(source.entry?.entry?.blockDaaScore ?? source.entry?.blockDaaScore ?? 0);
  const virtualDaaScore = BigInt(node.virtualDaaScore || 0);
  const outpoint = source.entry?.outpoint || source.entry?.entry?.outpoint || {};
  const result = {
    deployed: true,
    unspent: true,
    status: "active",
    network: project.network,
    covenantId: source.covenantId,
    valueSompi: String(source.entry?.entry?.amount ?? source.entry?.amount ?? 0),
    valueKas: sompiToKas(source.entry?.entry?.amount ?? source.entry?.amount ?? 0),
    activeOutpoint: { transactionId: String(outpoint.transactionId || ""), index: Number(outpoint.index || 0) },
    broadcastAt: project.deployment?.broadcastAt || "",
    blockDaaScore: blockDaaScore.toString(),
    virtualDaaScore: virtualDaaScore.toString(),
    schedule: null
  };

  if (!["inheritance-vault", "kcc20-inheritance-vault"].includes(project.review?.templateId)) return result;
  const periodDaa = BigInt(project.constructorArgs?.[3]?.data || 0);
  if (periodDaa <= 0n) return result;
  const targetDaaScore = blockDaaScore + periodDaa;
  const remainingDaa = targetDaaScore > virtualDaaScore ? targetDaaScore - virtualDaaScore : 0n;
  const daaPerSecond = Number(network?.daaPerSecond || 10);
  const remainingSeconds = Math.ceil(Number(remainingDaa) / daaPerSecond);
  const actualSeconds = Number(periodDaa) / daaPerSecond;
  const configuredSeconds = configuredDurationSeconds(project);
  const encodingVersion = Number(project.review?.parameterEncodingVersion || 1);
  const mismatch = configuredSeconds !== null && Math.abs(actualSeconds - configuredSeconds) >= 1;
  result.status = remainingDaa === 0n ? "mature" : "active";
  result.schedule = {
    mode: "relative-daa",
    periodDaa: periodDaa.toString(),
    targetDaaScore: targetDaaScore.toString(),
    remainingDaa: remainingDaa.toString(),
    daaPerSecond,
    approximateActualSeconds: actualSeconds,
    approximateRemainingSeconds: remainingSeconds,
    approximateMaturesAt: new Date(now + remainingSeconds * 1000).toISOString(),
    mature: remainingDaa === 0n,
    configuredSeconds,
    parameterEncodingVersion: encodingVersion,
    mismatch,
    legacyEncoding: encodingVersion < 2
  };
  return result;
}

export function spentLifecycleStatus(project) {
  return {
    deployed: Boolean(project?.deployment?.txid),
    unspent: false,
    status: "spent",
    network: project?.network || "",
    covenantId: project?.deployment?.covenantId || "",
    schedule: null
  };
}
