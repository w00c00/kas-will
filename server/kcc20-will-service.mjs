import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { buildAtomicCovenantPackage } from "./atomic-covenant-builder.mjs";
import { finalizeExternalCovenantPackage, inspectExternalCovenantPackage } from "./external-covenant-service.mjs";
import { findCovenantUtxo, kasToSompi, kascovPreflight, sompiToKas } from "./kaspa-service.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const MAX_FEE = 100_000_000n;
const COMPUTE_BUDGET = 120;
const SIGNATURE_RESERVE = 250_000n;
const TOKEN_STATE_BYTES = 46;

const KCC20_ABI = [
  { name: "__leader_transfer", inputs: [
    { name: "newStates", type_name: "State[]" },
    { name: "sigs", type_name: "sig[]" },
    { name: "witnesses", type_name: "byte[]" }
  ] },
  { name: "__delegate", inputs: [] }
];
const KCC20_STATE_FIELDS = [
  { name: "ownerIdentifier", type_name: "byte[32]" },
  { name: "identifierType", type_name: "byte" },
  { name: "amount", type_name: "int" },
  { name: "isMinter", type_name: "bool" }
];

function fail(message, code = "INVALID_KCC20_WILL_OPERATION") {
  throw Object.assign(new Error(message), { status: 400, code });
}

function hex(value, bytes = null, label = "hexadecimal value") {
  const normalized = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 || (bytes !== null && normalized.length !== bytes * 2)) {
    fail(`${label} is invalid`);
  }
  return normalized;
}

function templateHash(prefix, suffix) {
  const prefixLength = Buffer.alloc(8);
  const suffixLength = Buffer.alloc(8);
  prefixLength.writeBigInt64LE(BigInt(prefix.length));
  suffixLength.writeBigInt64LE(BigInt(suffix.length));
  const preimage = Buffer.concat([prefixLength, prefix, suffixLength, suffix]);
  return kaspa.payToScriptHashScript(preimage.toString("hex")).script.slice(4, 68);
}

function tokenState(programHex, project) {
  const program = Buffer.from(hex(programHex, null, "KCC20 redeem program"), "hex");
  const prefixLength = Number(project.templateParameters?.tokenTemplatePrefixLength);
  const suffixLength = Number(project.templateParameters?.tokenTemplateSuffixLength);
  if (!Number.isSafeInteger(prefixLength) || prefixLength < 0 || !Number.isSafeInteger(suffixLength) || suffixLength < 1) {
    fail("KCC20 template lengths are invalid");
  }
  if (program.length !== prefixLength + TOKEN_STATE_BYTES + suffixLength) {
    fail("KCC20 redeem program length does not match the descriptor-bound template", "KCC20_TEMPLATE_LENGTH_MISMATCH");
  }
  const prefix = program.subarray(0, prefixLength);
  const state = program.subarray(prefixLength, prefixLength + TOKEN_STATE_BYTES);
  const suffix = program.subarray(prefixLength + TOKEN_STATE_BYTES);
  if (state[0] !== 0x20 || state[33] !== 0x01 || state[35] !== 0x08 || state[44] !== 0x01) {
    fail("KCC20 state uses a non-canonical field encoding", "KCC20_STATE_ENCODING_MISMATCH");
  }
  const expectedHash = hex(project.templateParameters?.tokenTemplateHash, 32, "KCC20 template hash");
  if (templateHash(prefix, suffix) !== expectedHash) fail("KCC20 redeem program does not match the committed template hash", "KCC20_TEMPLATE_HASH_MISMATCH");
  const amount = state.readBigInt64LE(36);
  if (amount <= 0n) fail("KCC20 state amount must be positive");
  const isMinterByte = state[45];
  if (isMinterByte !== 0 && isMinterByte !== 1) fail("KCC20 isMinter state byte is non-canonical");
  return {
    prefix,
    suffix,
    ownerIdentifier: state.subarray(1, 33).toString("hex"),
    identifierType: state[34],
    amount,
    isMinter: isMinterByte === 1
  };
}

function encodeTokenProgram(state, ownerIdentifier, identifierType, amount) {
  const amountBytes = Buffer.alloc(8);
  amountBytes.writeBigInt64LE(BigInt(amount));
  return Buffer.concat([
    state.prefix,
    Buffer.from([0x20]),
    Buffer.from(hex(ownerIdentifier, 32, "token owner identifier"), "hex"),
    Buffer.from([0x01]),
    Buffer.from([identifierType]),
    Buffer.from([0x08]),
    amountBytes,
    Buffer.from([0x01]),
    Buffer.from([0]),
    state.suffix
  ]).toString("hex");
}

function stateArgument(ownerIdentifier, identifierType, amount) {
  return { fields: {
    ownerIdentifier: { kind: "bytes32", hex: ownerIdentifier },
    identifierType: { kind: "byte", data: identifierType },
    amount: { kind: "int", data: amount.toString() },
    isMinter: { kind: "bool", data: false }
  } };
}

function xOnly(address, network) {
  const normalized = String(address || "").trim().toLowerCase();
  if (!normalized.startsWith(`${network.prefix}:`)) fail("KCC20 wallet is on the wrong network");
  let parsed;
  let key;
  try {
    parsed = new kaspa.Address(normalized);
    key = kaspa.XOnlyPublicKey.fromAddress(parsed);
    return { address: normalized, publicKey: key.toString().toLowerCase() };
  } catch { fail("KCC20 wallet must be a valid P2PK address"); }
  finally { try { key?.free(); } catch {} try { parsed?.free(); } catch {} }
}

function distribute(total, shares, label) {
  const base = total / 10000n;
  const remainder = total % 10000n;
  let paid = 0n;
  let shareTotal = 0n;
  return shares.map((item, index) => {
    const share = BigInt(item.shareBps);
    shareTotal += share;
    let value = base * share + (remainder * share) / 10000n;
    if (index === shares.length - 1) value = total - paid;
    if (value <= 0n) fail(`Every inheritor must receive a positive ${label} amount`);
    paid += value;
    if (index === shares.length - 1 && shareTotal !== 10000n) fail("Inheritance shares must total exactly 100%");
    return value;
  });
}

function fillSignaturePlaceholders(pkg) {
  const copy = structuredClone(pkg);
  for (const input of copy.covenantInputs) {
    for (const argument of input.arguments || []) {
      if (argument?.kind === "signature" && !argument.hex) argument.hex = "00".repeat(65);
      if (argument?.kind === "signature[]") for (const item of argument.items || []) if (!item.hex) item.hex = "00".repeat(65);
    }
  }
  if (copy.covenantInputs.length === 1) copy.covenantInput = copy.covenantInputs[0];
  return copy;
}

function entryAmount(source) {
  return BigInt(source?.entry?.amount ?? source?.amountSompi ?? 0);
}

function tokenInputMetadata(source, programHex, argumentsList) {
  return {
    utxo: source.entry,
    programHex,
    abi: KCC20_ABI,
    stateFields: KCC20_STATE_FIELDS,
    entrypoint: "__leader_transfer",
    arguments: argumentsList,
    computeBudget: COMPUTE_BUDGET,
    descriptorProfileId: "kas-will/kcc20-token-input/v1",
    controlPrincipals: [{ role: "asset", profile: "covenant-id/v1", cardinality: 1, reference: { kind: "covenant-id", value: String(source.covenantId || "") } }]
  };
}

function controllerInputMetadata(source, project, operationId, fee, ownerPublicKey = "") {
  return {
    utxo: source.entry,
    programHex: project.artifact.programHex,
    abi: project.artifact.abi,
    stateFields: project.artifact.stateFields || [],
    entrypoint: operationId,
    arguments: operationId === "recover"
      ? [{ kind: "signature", publicKey: ownerPublicKey }, { kind: "int", data: fee.toString() }]
      : [{ kind: "int", data: fee.toString() }],
    sequence: operationId === "inherit" ? Number(project.constructorArgs?.[3]?.data || 0) : 0,
    computeBudget: COMPUTE_BUDGET,
    descriptorProfileId: "kas-will/kcc20-controller/v1",
    controlPrincipals: [{ role: "owner", profile: "p2pk-schnorr/v1", cardinality: 1 }]
  };
}

export async function buildKcc20WillOperationPackage(
  input,
  project,
  { findUtxo = findCovenantUtxo, preflight = kascovPreflight } = {},
  feeContext = null
) {
  if (project?.review?.templateId !== "kcc20-inheritance-vault" || project.network !== "tn10") fail("KCC20 inheritance is restricted to the TN10 experimental template");
  if (!project?.artifact?.programHex || !project?.deployment?.txid || !project?.deployment?.covenantId) fail("Deploy the KCC20 controller before building token operations");
  const operationId = String(input.operationId || "");
  if (!["fundKcc20", "recover", "inherit"].includes(operationId)) fail("Unknown KCC20 will operation");
  const network = NETWORKS.tn10;
  const tokenProgramHex = hex(input.tokenProgramHex, null, "KCC20 redeem program");
  const tokenCovenantId = hex(project.templateParameters?.tokenCovenantId, 32, "KCC20 covenant ID");
  const tokenSource = feeContext?.tokenSource || await findUtxo("tn10", tokenProgramHex, input.tokenTransactionId, input.tokenOutputIndex ?? 0, tokenCovenantId);
  if (String(tokenSource.covenantId || "").toLowerCase() !== tokenCovenantId) fail("Resolved token UTXO has a different Covenant ID");
  const previous = tokenState(tokenProgramHex, project);
  if (previous.isMinter) fail("Kas Will never accepts a KCC20 minter UTXO", "KCC20_MINTER_REJECTED");
  const owner = xOnly(project.templateParameters.ownerAddress, network);
  const controllerId = hex(project.deployment.covenantId, 32, "controller covenant ID");
  if (operationId === "fundKcc20") {
    if (previous.identifierType !== 0 || previous.ownerIdentifier !== owner.publicKey) fail("Funding token must currently be owned by the configured owner wallet", "KCC20_FUNDING_OWNER_MISMATCH");
  } else if (previous.identifierType !== 2 || previous.ownerIdentifier !== controllerId) {
    fail("Token UTXO is not controlled by this Kas Will controller", "KCC20_CONTROLLER_OWNERSHIP_MISMATCH");
  }

  const requestedFee = feeContext?.requestedFee ?? kasToSompi(String(input.feeKas || "0.02"));
  const fee = feeContext?.fee ?? requestedFee;
  if (fee < 1000n || fee > MAX_FEE) fail("KCC20 operation fee must be from 0.00001 to 1 TKAS");
  const tokenKas = entryAmount(tokenSource);
  let controllerSource = null;
  if (operationId !== "fundKcc20") {
    controllerSource = feeContext?.controllerSource || await findUtxo(
      "tn10",
      project.artifact.programHex,
      project.deployment.activeTxid || project.deployment.txid,
      project.deployment.activeOutputIndex ?? 0,
      controllerId
    );
  }
  const availableKas = tokenKas + (controllerSource ? entryAmount(controllerSource) : 0n) - fee;
  if (availableKas <= 0n) fail("KCC20 operation inputs cannot pay the selected fee");

  let tokenStates;
  let outputValues;
  let tokenPrograms;
  let tokenSignatures = [];
  let witnesses = "";
  if (operationId === "fundKcc20") {
    tokenStates = [{ ownerIdentifier: controllerId, identifierType: 2, amount: previous.amount }];
    outputValues = [availableKas];
    tokenPrograms = [encodeTokenProgram(previous, controllerId, 2, previous.amount)];
    tokenSignatures = [{ kind: "signature", publicKey: owner.publicKey }];
  } else if (operationId === "recover") {
    tokenStates = [{ ownerIdentifier: owner.publicKey, identifierType: 0, amount: previous.amount }];
    outputValues = [availableKas];
    tokenPrograms = [encodeTokenProgram(previous, owner.publicKey, 0, previous.amount)];
    witnesses = "00";
  } else {
    const inheritors = project.templateParameters?.inheritors || [];
    if (inheritors.length < 1 || inheritors.length > 5) fail("KCC20 inheritance requires 1-5 inheritors");
    const resolved = inheritors.map((item) => ({ ...item, identity: xOnly(item.address, network) }));
    const tokenAmounts = distribute(previous.amount, resolved, "token");
    outputValues = distribute(availableKas, resolved, "KAS");
    tokenStates = resolved.map((item, index) => ({ ownerIdentifier: item.identity.publicKey, identifierType: 0, amount: tokenAmounts[index] }));
    tokenPrograms = tokenStates.map((item) => encodeTokenProgram(previous, item.ownerIdentifier, 0, item.amount));
    witnesses = "00";
  }

  const tokenArguments = [
    { kind: "state[]", items: tokenStates.map((item) => stateArgument(item.ownerIdentifier, item.identifierType, item.amount)) },
    { kind: "signature[]", items: tokenSignatures },
    { kind: "bytes", hex: witnesses }
  ];
  const covenantInputs = [];
  if (controllerSource) covenantInputs.push(controllerInputMetadata(controllerSource, project, operationId, fee, owner.publicKey));
  covenantInputs.push(tokenInputMetadata(tokenSource, tokenProgramHex, tokenArguments));
  const tokenInputIndex = covenantInputs.length - 1;
  const outputs = tokenPrograms.map((programHex, index) => ({
    valueSompi: outputValues[index].toString(),
    programHex,
    covenantId: tokenCovenantId
  }));
  const built = buildAtomicCovenantPackage({
    network: "tn10",
    covenantInputs,
    outputs,
    feeSompi: fee.toString(),
    provenance: { kind: "kas-will-kcc20", projectId: project.id, templateId: project.review.templateId, operationId, tokenInputIndex }
  });
  let inspected = inspectExternalCovenantPackage(built);
  const estimation = finalizeExternalCovenantPackage(fillSignaturePlaceholders(inspected.package));
  const estimationTx = kaspa.Transaction.deserializeFromSafeJSON(estimation.package.transactionSafeJson);
  const signatureCount = estimation.review.signatureSlots.length;
  const sigOps = Math.max(1, signatureCount);
  const calculatedMass = BigInt(kaspa.calculateTransactionMass(network.kaspaNetworkId, estimationTx, sigOps, true));
  const maximumMass = BigInt(kaspa.maximumStandardTransactionMass());
  const minimumFee = kaspa.calculateTransactionFee(network.kaspaNetworkId, estimationTx, sigOps, true);
  try { estimationTx.free?.(); } catch {}
  if (calculatedMass > maximumMass || minimumFee === undefined) fail("KCC20 operation exceeds the standard transaction mass limit", "KCC20_OPERATION_MASS_LIMIT");
  const requiredFee = BigInt(minimumFee) + BigInt(signatureCount) * SIGNATURE_RESERVE;
  if (requiredFee > fee) {
    const pass = Number(feeContext?.pass || 0);
    const adjustedFee = requiredFee + 10_000n;
    if (pass >= 7 || adjustedFee > MAX_FEE) fail(`KCC20 operation requires at least ${sompiToKas(requiredFee)} TKAS in fees`, "KCC20_OPERATION_FEE_TOO_LOW");
    return buildKcc20WillOperationPackage(input, project, { findUtxo: async (_network, program) => program === tokenProgramHex ? tokenSource : controllerSource, preflight }, {
      tokenSource, controllerSource, requestedFee, fee: adjustedFee, pass: pass + 1
    });
  }
  const tx = kaspa.Transaction.deserializeFromSafeJSON(inspected.package.transactionSafeJson);
  tx.storageMass = calculatedMass;
  tx.finalize();
  inspected.package.transactionSafeJson = tx.serializeToSafeJSON();
  try { tx.free?.(); } catch {}
  inspected = inspectExternalCovenantPackage(inspected.package);
  if (inspected.review.complete) inspected = finalizeExternalCovenantPackage(inspected.package);
  const report = inspected.review.complete ? await preflight(inspected.package.transactionSafeJson, "tn10", "draft") : {
    ok: true,
    verdict: "signatures_required",
    provider: "local-structural",
    localEngineVerified: false
  };
  return {
    operation: { id: operationId, tokenAmount: previous.amount.toString() },
    ...inspected,
    preflight: report,
    fee: {
      requestedSompi: requestedFee.toString(),
      requestedKas: sompiToKas(requestedFee),
      actualSompi: fee.toString(),
      actualKas: sompiToKas(fee),
      automaticallyAdjusted: fee > requestedFee,
      calculatedMass: calculatedMass.toString(),
      maximumStandardMass: maximumMass.toString(),
      signatureExecutionReserveSompi: (BigInt(signatureCount) * SIGNATURE_RESERVE).toString()
    }
  };
}

export { KCC20_ABI, KCC20_STATE_FIELDS, tokenState as decodeKcc20TokenState };
