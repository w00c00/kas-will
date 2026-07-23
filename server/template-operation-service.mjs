import crypto from "node:crypto";
import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { finalizeExternalCovenantPackage, inspectExternalCovenantPackage } from "./external-covenant-service.mjs";
import { findCovenantUtxo, kasToSompi, kascovPreflight } from "./kaspa-service.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const MAX_OPERATION_FEE = 10_000_000n;
const OPERATION_COMPUTE_BUDGET = 120;

const OPERATIONS = {
  "owner-vault": [
    { id: "spend", titleZh: "拥有者释放", titleEn: "Owner spend", destination: true }
  ],
  "timelock-transfer": [
    { id: "claim", titleZh: "收款方领取", titleEn: "Recipient claim" },
    { id: "refund", titleZh: "到期退款", titleEn: "Timeout refund" }
  ],
  "two-of-three": [
    { id: "spend", titleZh: "三选二释放", titleEn: "Two-of-three spend", destination: true, signers: true }
  ],
  "hashlock-refund": [
    { id: "claim", titleZh: "提供秘密领取", titleEn: "Claim with secret", secret: true },
    { id: "refund", titleZh: "到期退款", titleEn: "Timeout refund" }
  ],
  "inheritance-vault": [
    { id: "checkIn", titleZh: "拥有者签到续期", titleEn: "Owner check-in" },
    { id: "recover", titleZh: "拥有者取回", titleEn: "Owner recovery" },
    { id: "inherit", titleZh: "到期分配继承", titleEn: "Mature inheritance distribution" }
  ]
};

function operationError(message, code = "INVALID_TEMPLATE_OPERATION") {
  return Object.assign(new Error(message), { status: 400, code });
}

function publicKeyOf(address, network, label = "Operation wallet") {
  const value = String(address || "").trim().toLowerCase();
  if (!value) throw operationError(`${label} is required`, "OPERATION_ADDRESS_REQUIRED");
  if (!value.startsWith(`${network.prefix}:`)) throw operationError(`${label} is on the wrong network`, "OPERATION_ADDRESS_WRONG_NETWORK");
  let parsed;
  let key;
  try {
    parsed = new kaspa.Address(value);
    key = kaspa.XOnlyPublicKey.fromAddress(parsed);
    return { address: value, publicKey: key.toString().toLowerCase() };
  } catch { throw operationError(`${label} must be a valid P2PK wallet address`, "OPERATION_ADDRESS_INVALID"); }
  finally { try { key?.free(); } catch {} try { parsed?.free(); } catch {} }
}

function signature(publicKey) {
  return { kind: "signature", publicKey };
}

function int(data) {
  return { kind: "int", data: Number(data) };
}

function templateIdOf(project) {
  const id = String(project?.review?.templateId || "");
  if (!OPERATIONS[id]) throw operationError("This project has no deterministic lifecycle operation builder", "NO_TEMPLATE_OPERATION_BUILDER");
  return id;
}

export function templateOperations(project) {
  const templateId = templateIdOf(project);
  const operations = structuredClone(OPERATIONS[templateId]);
  if (templateId === "two-of-three") {
    const parameters = project.templateParameters || {};
    const availableSigners = [parameters.key1Address, parameters.key2Address, parameters.key3Address].filter(Boolean);
    for (const operation of operations) if (operation.signers) operation.availableSigners = availableSigners;
  }
  return operations;
}

function exactOperation(templateId, operationId) {
  const operation = OPERATIONS[templateId]?.find((item) => item.id === operationId);
  if (!operation) throw operationError("Unknown template lifecycle operation");
  return operation;
}

function timeoutOf(project, templateId) {
  const index = templateId === "timelock-transfer" ? 2 : 3;
  const value = Number(project.constructorArgs?.[index]?.data);
  if (!Number.isSafeInteger(value) || value <= 0) throw operationError("Compiled timeout constructor argument is invalid");
  return value;
}

function inheritOutputs(parameters, value, network) {
  const inheritors = parameters?.inheritors;
  if (!Array.isArray(inheritors) || inheritors.length < 2 || inheritors.length > 5) throw operationError("Inheritance parameters are missing");
  const base = value / 10000n;
  const remainder = value % 10000n;
  let paid = 0n;
  return inheritors.map((item, index) => {
    const identity = publicKeyOf(item.address, network);
    const share = BigInt(item.shareBps);
    let amount = base * share + (remainder * share) / 10000n;
    if (index === inheritors.length - 1) amount = value - paid;
    paid += amount;
    return new kaspa.TransactionOutput(amount, kaspa.payToAddressScript(identity.address));
  });
}

export async function buildTemplateOperationPackage(
  input,
  project,
  template,
  findUtxo = findCovenantUtxo,
  preflight = kascovPreflight
) {
  const templateId = templateIdOf(project);
  const operation = exactOperation(templateId, String(input.operationId || ""));
  if (!project?.artifact?.programHex || !project?.deployment?.txid) throw operationError("Project must have a compiled and broadcast covenant deployment");
  if (project.deployment.network !== project.network) throw operationError("Project deployment network does not match the project");
  const network = NETWORKS[project.network];
  if (!network) throw operationError("Project network is unsupported");
  const source = await findUtxo(
    project.network,
    project.artifact.programHex,
    project.deployment.activeTxid || project.deployment.txid,
    project.deployment.activeOutputIndex ?? 0,
    project.deployment.covenantId || ""
  );
  if (project.deployment.covenantId && project.deployment.covenantId !== source.covenantId) throw operationError("Stored deployment covenant ID does not match the unspent output");
  const fee = kasToSompi(String(input.feeKas || "0.01"));
  if (fee < 1000n || fee > MAX_OPERATION_FEE) throw operationError("Operation fee must be from 0.00001 to 0.1 KAS/TKAS");
  const inputValue = BigInt(source.entry.amount);
  if (inputValue <= fee) throw operationError("Covenant value is not enough to pay the selected fee");
  const payout = inputValue - fee;
  const parameters = project.templateParameters || {};
  let outputs = [];
  let args = [];
  let sequence = 0n;
  let lockTime = 0n;
  let sigOps = 0;

  if (templateId === "owner-vault") {
    const owner = publicKeyOf(parameters.ownerAddress, network);
    const destination = publicKeyOf(input.destinationAddress, network, "Destination wallet");
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(destination.address))];
    args = [signature(owner.publicKey)];
    sigOps = 1;
  } else if (templateId === "timelock-transfer") {
    const isClaim = operation.id === "claim";
    const identity = publicKeyOf(isClaim ? parameters.recipientAddress : parameters.senderAddress, network);
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(identity.address))];
    args = [signature(identity.publicKey)];
    sigOps = 1;
    if (!isClaim) lockTime = BigInt(timeoutOf(project, templateId));
  } else if (templateId === "two-of-three") {
    const configured = [parameters.key1Address, parameters.key2Address, parameters.key3Address].map((address) => publicKeyOf(address, network));
    const requested = Array.isArray(input.signerAddresses) ? input.signerAddresses.map((address) => publicKeyOf(address, network)) : [];
    if (requested.length !== 2 || requested[0].address === requested[1].address) throw operationError("Select exactly two different configured signer wallets");
    for (const signer of requested) if (!configured.some((item) => item.address === signer.address)) throw operationError("Selected signer is not part of this multisig covenant");
    const destination = publicKeyOf(input.destinationAddress, network, "Destination wallet");
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(destination.address))];
    args = [{ kind: "pubkey", hex: requested[0].publicKey }, signature(requested[0].publicKey), { kind: "pubkey", hex: requested[1].publicKey }, signature(requested[1].publicKey)];
    sigOps = 2;
  } else if (templateId === "hashlock-refund") {
    const isClaim = operation.id === "claim";
    const identity = publicKeyOf(isClaim ? parameters.recipientAddress : parameters.senderAddress, network);
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(identity.address))];
    if (isClaim) {
      const secretHex = String(input.secretHex || "").trim().toLowerCase().replace(/^0x/, "");
      if (!secretHex || secretHex.length % 2 || !/^[0-9a-f]+$/.test(secretHex) || secretHex.length > 1040) throw operationError("Claim secret must be 1-520 bytes of hexadecimal data");
      if (crypto.createHash("sha256").update(Buffer.from(secretHex, "hex")).digest("hex") !== parameters.secretHash) throw operationError("Claim secret does not match the configured SHA-256 digest");
      args = [{ kind: "bytes", hex: secretHex }, signature(identity.publicKey)];
    } else {
      args = [signature(identity.publicKey)];
      lockTime = BigInt(timeoutOf(project, templateId));
    }
    sigOps = 1;
  } else if (templateId === "inheritance-vault") {
    const owner = publicKeyOf(parameters.ownerAddress, network);
    if (operation.id === "checkIn") {
      outputs = [new kaspa.TransactionOutput(payout, kaspa.payToScriptHashScript(project.artifact.programHex), new kaspa.CovenantBinding(0, new kaspa.Hash(source.covenantId)))];
      args = [signature(owner.publicKey), int(fee)];
      sigOps = 1;
    } else if (operation.id === "recover") {
      outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(owner.address))];
      args = [signature(owner.publicKey), int(fee)];
      sigOps = 1;
    } else {
      outputs = inheritOutputs(parameters, payout, network);
      args = [int(fee)];
      sequence = BigInt(Number(project.constructorArgs?.[3]?.data || 0));
      if (sequence <= 0n) throw operationError("Inheritance inactivity period is invalid");
    }
  }

  const transaction = new kaspa.Transaction({
    version: 1,
    inputs: [{
      previousOutpoint: source.entry.outpoint,
      signatureScript: "",
      sequence,
      sigOpCount: sigOps,
      computeBudget: OPERATION_COMPUTE_BUDGET,
      utxo: source.entry
    }],
    outputs,
    lockTime,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  if (!kaspa.updateTransactionMass(network.kaspaNetworkId, transaction, Math.max(sigOps, 1), true)) throw operationError("Operation transaction exceeds the standard mass limit");
  const packageValue = {
    version: 1,
    network: project.network,
    transactionSafeJson: transaction.serializeToSafeJSON(),
    covenantInput: {
      index: 0,
      covenantId: source.covenantId,
      programHex: project.artifact.programHex,
      programSha256: project.artifact.programSha256,
      abi: project.artifact.abi,
      entrypoint: operation.id,
      arguments: args
    },
    provenance: {
      kind: "silverstudio-template-operation",
      projectId: project.id,
      templateId,
      operationId: operation.id,
      compilerCommit: project.artifact.compiler?.upstreamCommit || "",
      sourceSha256: project.artifact.sourceSha256 || ""
    }
  };
  const prepared = sigOps === 0 ? finalizeExternalCovenantPackage(packageValue) : inspectExternalCovenantPackage(packageValue);
  const preflightReport = await preflight(prepared.package.transactionSafeJson, project.network, "draft");
  return { operation, ...prepared, preflight: preflightReport };
}
