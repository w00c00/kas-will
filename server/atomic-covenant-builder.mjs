import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { sha256 } from "./security.mjs";
import { buildCovenantDescriptor, caip2Network } from "./covenant-descriptor.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const MAX_COVENANT_INPUTS = 32;

function builderError(message, code = "INVALID_ATOMIC_COVENANT_BUILD") {
  return Object.assign(new Error(message), { status: 400, code });
}

function cleanHex(value, bytes = null) {
  const hex = String(value || "").replace(/^0x/, "").toLowerCase();
  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/.test(hex) || (bytes !== null && hex.length !== bytes * 2)) throw builderError("Atomic covenant build contains invalid hexadecimal data");
  return hex;
}

function covenantIdOf(utxo) {
  return cleanHex(utxo?.entry?.covenantId || utxo?.covenantId, 32);
}

function amountOf(utxo) {
  const amount = BigInt(utxo?.amount ?? utxo?.entry?.amount ?? 0);
  if (amount <= 0n) throw builderError("Every atomic covenant input must have positive value");
  return amount;
}

function transactionUtxo(utxo) {
  if (utxo?.entry) return utxo;
  const outpoint = utxo?.outpoint || {};
  const script = String(utxo?.scriptPublicKey?.script || utxo?.scriptPublicKey || "").replace(/^0000/, "").toLowerCase();
  const safeUtxo = {
    ...(utxo?.address ? { address: String(utxo.address) } : {}),
    amount: amountOf(utxo).toString(),
    scriptPublicKey: `0000${cleanHex(script)}`,
    blockDaaScore: BigInt(utxo?.blockDaaScore ?? 0).toString(),
    isCoinbase: Boolean(utxo?.isCoinbase),
    covenantId: covenantIdOf(utxo)
  };
  const carrier = kaspa.Transaction.deserializeFromSafeJSON(JSON.stringify({
    id: "00".repeat(32),
    version: 1,
    inputs: [{ transactionId: outpoint.transactionId, index: Number(outpoint.index), sequence: "0", sigOpCount: 0, computeBudget: 0, signatureScript: "", utxo: safeUtxo }],
    outputs: [{ value: "1", scriptPublicKey: safeUtxo.scriptPublicKey, covenant: null }],
    subnetworkId: "00".repeat(20), lockTime: "0", gas: "0", storageMass: "0", payload: ""
  }));
  return carrier.inputs[0].utxo;
}

function outputFrom(descriptor, network, inputIndexById) {
  const value = BigInt(descriptor.valueSompi);
  if (value <= 0n) throw builderError("Every atomic output must have positive value");
  if (descriptor.address) {
    if (descriptor.genesisAuthorizerCovenantId) throw builderError("An address output cannot also be a fresh covenant lineage");
    const address = String(descriptor.address).trim().toLowerCase();
    if (!address.startsWith(`${network.prefix}:`)) throw builderError("Atomic output address is on the wrong network");
    return { output: new kaspa.TransactionOutput(value, kaspa.payToAddressScript(address)), genesisAuthorizingInput: null };
  }
  const programHex = cleanHex(descriptor.programHex);
  if (descriptor.genesisAuthorizerCovenantId) {
    if (descriptor.covenantId) throw builderError("A fresh covenant lineage output must not declare a pre-existing covenant ID");
    const authorizerId = cleanHex(descriptor.genesisAuthorizerCovenantId, 32);
    const authorizingInput = inputIndexById.get(authorizerId);
    if (!Number.isSafeInteger(authorizingInput)) throw builderError("Fresh covenant lineage authorizer does not map to an input covenant ID");
    return {
      output: new kaspa.TransactionOutput(value, kaspa.payToScriptHashScript(programHex)),
      genesisAuthorizingInput: authorizingInput,
      programSha256: sha256(Buffer.from(programHex, "hex"))
    };
  }
  const covenantId = cleanHex(descriptor.covenantId, 32);
  const sourceInputIndex = inputIndexById.get(covenantId);
  if (!Number.isSafeInteger(sourceInputIndex)) throw builderError("Covenant continuation output does not map to an input covenant ID");
  return {
    output: new kaspa.TransactionOutput(
      value,
      kaspa.payToScriptHashScript(programHex),
      new kaspa.CovenantBinding(sourceInputIndex, new kaspa.Hash(covenantId))
    ),
    genesisAuthorizingInput: null
  };
}

export function buildAtomicCovenantPackage({ network: networkId = "tn10", covenantInputs, outputs, p2pkAuthorization = null, feeSompi, provenance = {} }) {
  const network = NETWORKS[networkId];
  if (!network) throw builderError("Atomic covenant build network is unsupported");
  if (!Array.isArray(covenantInputs) || covenantInputs.length < 1 || covenantInputs.length > MAX_COVENANT_INPUTS) {
    throw builderError(`Covenant build requires 1-${MAX_COVENANT_INPUTS} covenant inputs`);
  }
  if (!Array.isArray(outputs) || !outputs.length || outputs.length > 64) throw builderError("Atomic covenant build requires 1-64 outputs");
  const usedOutpoints = new Set();
  const usedIds = new Set();
  const metadata = [];
  const transactionInputs = covenantInputs.map((item, index) => {
    const utxo = item.utxo;
    const outpoint = utxo?.outpoint || utxo?.entry?.outpoint;
    const outpointKey = `${String(outpoint?.transactionId || "").toLowerCase()}:${Number(outpoint?.index)}`;
    if (!/^[0-9a-f]{64}:\d+$/.test(outpointKey) || usedOutpoints.has(outpointKey)) throw builderError("Atomic covenant inputs must have unique valid outpoints");
    usedOutpoints.add(outpointKey);
    const covenantId = covenantIdOf(utxo);
    if (usedIds.has(covenantId)) throw builderError("Atomic builder requires one live input per covenant ID");
    usedIds.add(covenantId);
    const programHex = cleanHex(item.programHex);
    const script = utxo?.scriptPublicKey?.script || utxo?.entry?.scriptPublicKey?.script;
    if (String(script || "").toLowerCase() !== kaspa.payToScriptHashScript(programHex).script) throw builderError("Atomic covenant redeem program does not match its input UTXO");
    const programSha256 = sha256(Buffer.from(programHex, "hex"));
    const abi = item.abi;
    const stateFields = item.stateFields || [];
    const authorizationPrincipals = (item.arguments || []).flatMap((argument, argumentIndex) => {
      if (argument?.kind === "signature") return [{
        role: `input-${index}-signature-${argumentIndex}`,
        profile: "p2pk-schnorr/v1",
        cardinality: 1,
        reference: { kind: "public-key", value: argument.publicKey }
      }];
      if (argument?.kind === "signature[]") return (argument.items || []).map((slot, slotIndex) => ({
        role: `input-${index}-signature-${argumentIndex}-${slotIndex}`,
        profile: "p2pk-schnorr/v1",
        cardinality: 1,
        reference: { kind: "public-key", value: slot.publicKey }
      }));
      return [];
    });
    const descriptor = buildCovenantDescriptor({
      profileId: item.descriptorProfileId || `silverstudio/atomic-input-${index}/v1`,
      network: networkId,
      programSha256,
      covenantId,
      abi,
      stateFields,
      controlPrincipals: item.controlPrincipals || [],
      authorizationPrincipals
    });
    metadata.push({
      index,
      covenantId,
      programHex,
      programSha256,
      abi,
      stateFields,
      entrypoint: item.entrypoint,
      arguments: item.arguments || [],
      descriptor: descriptor.descriptor,
      descriptorSha256: descriptor.descriptorSha256
    });
    return {
      previousOutpoint: outpoint,
      signatureScript: "",
      sequence: BigInt(item.sequence || 0),
      // Toccata v1 inputs use computeBudget; a non-zero legacy sig-op field is
      // rejected by current nodes before script execution.
      sigOpCount: 0,
      computeBudget: Number(item.computeBudget || 120),
      utxo: transactionUtxo(utxo)
    };
  });
  if (p2pkAuthorization?.input) {
    const expectedIndex = transactionInputs.length;
    if (!p2pkAuthorization.metadata || Number(p2pkAuthorization.metadata.inputIndex) !== expectedIndex) {
      throw builderError("P2PK authorization metadata must identify the appended authorization input");
    }
    const authInput = p2pkAuthorization.input;
    const authScript = String(authInput.utxo?.scriptPublicKey?.script || "").toLowerCase();
    const authAddress = String(p2pkAuthorization.metadata.address || "").toLowerCase();
    if (!authAddress.startsWith(`${network.prefix}:`) || authScript !== kaspa.payToAddressScript(authAddress).script) {
      throw builderError("P2PK authorization input does not match its wallet or network");
    }
    if (authInput.signatureScript) throw builderError("P2PK authorization must be unsigned before the atomic package is reviewed");
    transactionInputs.push(authInput);
  }
  const inputIndexById = new Map(metadata.map((item) => [item.covenantId, item.index]));
  const outputPlans = outputs.map((output) => outputFrom(output, network, inputIndexById));
  const transactionOutputs = outputPlans.map((plan) => plan.output);
  const inputTotal = covenantInputs.reduce((sum, item) => sum + amountOf(item.utxo), 0n)
    + (p2pkAuthorization?.input ? amountOf(p2pkAuthorization.input.utxo) : 0n);
  const outputTotal = outputs.reduce((sum, output) => sum + BigInt(output.valueSompi), 0n);
  const fee = inputTotal - outputTotal;
  if (fee < 0n) throw builderError("Atomic covenant outputs exceed inputs");
  if (fee !== BigInt(feeSompi)) throw builderError("Atomic covenant fee does not equal the explicit fee");
  const transaction = new kaspa.Transaction({
    version: 1,
    inputs: transactionInputs,
    outputs: transactionOutputs,
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  });
  const genesisGroups = new Map();
  outputPlans.forEach((plan, outputIndex) => {
    if (!Number.isSafeInteger(plan.genesisAuthorizingInput)) return;
    const indexes = genesisGroups.get(plan.genesisAuthorizingInput) || [];
    indexes.push(outputIndex);
    genesisGroups.set(plan.genesisAuthorizingInput, indexes);
  });
  if (genesisGroups.size) {
    transaction.populateGenesisCovenants([...genesisGroups].map(([authorizingInput, genesisOutputs]) => ({
      authorizingInput,
      outputs: genesisOutputs
    })));
  }
  const genesisCovenants = outputPlans.flatMap((plan, outputIndex) => {
    if (!Number.isSafeInteger(plan.genesisAuthorizingInput)) return [];
    const covenantId = String(transaction.outputs[outputIndex].covenant?.covenantId || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(covenantId)) throw builderError("Fresh covenant lineage ID was not populated", "GENESIS_COVENANT_POPULATION_FAILED");
    if (Number(transaction.outputs[outputIndex].covenant?.authorizingInput) !== plan.genesisAuthorizingInput) {
      throw builderError("Fresh covenant lineage has the wrong authorizing input", "GENESIS_COVENANT_AUTHORIZATION_MISMATCH");
    }
    return [{ outputIndex, authorizingInputIndex: plan.genesisAuthorizingInput, covenantId, programSha256: plan.programSha256 }];
  });
  const covenantSignatures = metadata.reduce((sum, item) => sum + (item.arguments || []).reduce((count, argument) => count
    + (argument?.kind === "signature" ? 1 : argument?.kind === "signature[]" ? (argument.items || []).length : 0), 0), 0);
  const sigOps = Math.max(1, covenantSignatures + (p2pkAuthorization?.input ? 1 : 0));
  if (!kaspa.updateTransactionMass(network.kaspaNetworkId, transaction, sigOps, true)) throw builderError("Atomic covenant transaction exceeds the current mass limit", "ATOMIC_MASS_LIMIT");
  return {
    version: 1,
    network: network.id,
    networkCaip2: caip2Network(network.id),
    transactionSafeJson: transaction.serializeToSafeJSON(),
    covenantInputs: metadata,
    ...(genesisCovenants.length ? { genesisCovenants } : {}),
    ...(p2pkAuthorization?.metadata ? { p2pkAuthorization: { ...p2pkAuthorization.metadata, signed: false } } : {}),
    provenance: {
      kind: "silverstudio-atomic-covenant",
      atomic: true,
      inputCount: metadata.length,
      genesisOutputCount: genesisCovenants.length,
      ...provenance
    }
  };
}
