import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config, NETWORKS } from "./config.mjs";
import { sha256, transactionCommitment } from "./security.mjs";
import { kascovPreflight, sompiToKas } from "./kaspa-service.mjs";
import { operationPresentation } from "./operation-metadata.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const COVENANT_SCRIPT_OPTIONS = { flags: { covenantsEnabled: true } };
const MAX_PACKAGE_BYTES = 1_000_000;
const MAX_EXTERNAL_FEE = 10_000_000n;

function packageError(message, code = "INVALID_COVENANT_PACKAGE") {
  return Object.assign(new Error(message), { status: 400, code });
}

function parsePackage(input) {
  const value = typeof input === "string" ? input : JSON.stringify(input || {});
  if (Buffer.byteLength(value, "utf8") > MAX_PACKAGE_BYTES) throw packageError("External covenant package exceeds 1MB");
  let parsed;
  try { parsed = typeof input === "string" ? JSON.parse(input) : structuredClone(input || {}); } catch { throw packageError("External covenant package is not valid JSON"); }
  if (parsed.version !== 1) throw packageError("External covenant package version must be 1");
  if (!NETWORKS[parsed.network]) throw packageError("External covenant package network is unsupported");
  if (typeof parsed.transactionSafeJson !== "string") parsed.transactionSafeJson = JSON.stringify(parsed.transactionSafeJson || {});
  if (!parsed.covenantInput || typeof parsed.covenantInput !== "object") throw packageError("External covenant package requires covenantInput metadata");
  return parsed;
}

function cleanProgram(value) {
  const hex = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!hex || hex.length % 2 || hex.length > 20_000 || !/^[0-9a-f]+$/.test(hex)) throw packageError("Covenant redeem program is invalid");
  return hex;
}

function cleanAbi(value) {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw packageError("Covenant ABI must contain 1-32 entrypoints");
  return value.map((entry) => {
    const name = String(entry?.name || "");
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw packageError("Covenant ABI contains an invalid entrypoint name");
    if (!Array.isArray(entry.inputs) || entry.inputs.length > 32) throw packageError(`Covenant ABI entrypoint ${name} has invalid inputs`);
    return { name, inputs: entry.inputs.map((item) => ({ name: String(item?.name || ""), type_name: String(item?.type_name || "") })) };
  });
}

function transactionFrom(pkg) {
  try { return kaspa.Transaction.deserializeFromSafeJSON(pkg.transactionSafeJson); } catch { throw packageError("Transaction Safe JSON cannot be decoded by Kaspa WASM"); }
}

function inputCovenantId(input) {
  try { return String(input.utxo?.entry?.covenantId || "").toLowerCase(); } catch { return ""; }
}

function outputAddress(output, networkId) {
  try { return kaspa.addressFromScriptPublicKey(output.scriptPublicKey, networkId)?.toString() || ""; } catch { return ""; }
}

function normalized(pkg) {
  const transaction = transactionFrom(pkg);
  const metadata = pkg.covenantInput;
  const inputIndex = Number(metadata.index);
  if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= transaction.inputs.length) throw packageError("Covenant input index is invalid");
  const input = transaction.inputs[inputIndex];
  if (!input.utxo) throw packageError("Target input must include its complete UTXO entry");
  const programHex = cleanProgram(metadata.programHex);
  const actualProgramSha256 = sha256(Buffer.from(programHex, "hex"));
  if (metadata.programSha256 && String(metadata.programSha256).toLowerCase() !== actualProgramSha256) throw packageError("Declared program SHA-256 does not match programHex");
  const expectedScript = kaspa.payToScriptHashScript(programHex).script;
  if (input.utxo.scriptPublicKey.script !== expectedScript) throw packageError("Redeem program does not match the target input P2SH script");
  const covenantId = inputCovenantId(input);
  if (!/^[0-9a-f]{64}$/.test(covenantId)) throw packageError("Target input has no covenant ID");
  if (metadata.covenantId && String(metadata.covenantId).toLowerCase() !== covenantId) throw packageError("Declared covenant ID does not match the target UTXO");
  const abi = cleanAbi(metadata.abi);
  const entrypoint = String(metadata.entrypoint || "");
  const selected = abi.find((entry) => entry.name === entrypoint);
  if (!selected) throw packageError("Selected entrypoint is not present in the supplied ABI");
  const argumentsList = Array.isArray(metadata.arguments) ? structuredClone(metadata.arguments) : [];
  if (argumentsList.length !== selected.inputs.length) throw packageError(`Entrypoint ${entrypoint} expects ${selected.inputs.length} arguments`);
  for (let index = 0; index < selected.inputs.length; index += 1) {
    const type = selected.inputs[index].type_name;
    if (!["sig", "pubkey", "int", "bool", "byte[]"].includes(type) && !/^byte\[\d+\]$/.test(type)) {
      throw packageError(`External signing does not yet support ABI argument type ${type}`);
    }
    if (type === "sig" && !/^[0-9a-f]{64}$/i.test(argumentsList[index]?.publicKey || "")) {
      throw packageError(`Signature slot ${selected.inputs[index].name || index} requires a 32-byte x-only public key`);
    }
  }
  let inputTotal = 0n;
  for (const item of transaction.inputs) {
    if (!item.utxo) throw packageError("Every transaction input must include its complete UTXO entry");
    inputTotal += BigInt(item.utxo.amount);
  }
  let outputTotal = 0n;
  for (const output of transaction.outputs) outputTotal += BigInt(output.value);
  const fee = inputTotal - outputTotal;
  if (fee < 0n) throw packageError("Transaction outputs exceed its inputs");
  if (fee > MAX_EXTERNAL_FEE) throw packageError("External transaction fee exceeds the local 0.1 KAS/TKAS safety cap", "EXTERNAL_FEE_CAP");
  return { transaction, input, inputIndex, programHex, covenantId, abi, selected, argumentsList, fee };
}

function bytes(value, exactLength = null) {
  const hex = String(value || "").toLowerCase().replace(/^0x/, "");
  if (hex.length % 2 || !/^[0-9a-f]*$/.test(hex)) throw packageError("Covenant argument contains invalid hexadecimal data");
  const data = Buffer.from(hex, "hex");
  if (exactLength !== null && data.length !== exactLength) throw packageError(`Covenant argument must contain exactly ${exactLength} bytes`);
  if (data.length > 520) throw packageError("Covenant argument exceeds the 520-byte stack element limit");
  return data;
}

function appendArgument(builder, type, value) {
  if (type === "int") {
    let data;
    try { data = BigInt(value?.data); } catch { throw packageError("Covenant int argument is invalid"); }
    builder.addI64(data);
    return;
  }
  if (type === "bool") {
    builder.addI64(value?.data === true ? 1n : 0n);
    return;
  }
  if (type === "sig") {
    builder.addData(bytes(value?.hex, 65));
    return;
  }
  if (type === "pubkey") {
    builder.addData(bytes(value?.hex, 32));
    return;
  }
  const fixed = type.match(/^byte\[(\d+)\]$/);
  if (type === "byte[]" || fixed) {
    builder.addData(bytes(value?.hex, fixed ? Number(fixed[1]) : null));
    return;
  }
  throw packageError(`External signing does not yet support ABI argument type ${type}`);
}

function signatureSlots(selected, values) {
  return selected.inputs.map((input, index) => input.type_name === "sig" ? {
    index,
    name: input.name,
    publicKey: String(values[index]?.publicKey || "").toLowerCase(),
    signed: /^[0-9a-f]{130}$/i.test(values[index]?.hex || "")
  } : null).filter(Boolean);
}

export function inspectExternalCovenantPackage(input) {
  const pkg = parsePackage(input);
  const resolved = normalized(pkg);
  const network = NETWORKS[pkg.network];
  const outputs = resolved.transaction.outputs.map((output, index) => ({
    index,
    valueSompi: String(output.value),
    valueKas: sompiToKas(output.value),
    address: outputAddress(output, network.kaspaNetworkId),
    covenantId: String(output.covenant?.covenantId || "")
  }));
  const slots = signatureSlots(resolved.selected, resolved.argumentsList);
  const operation = operationPresentation({
    templateId: pkg.provenance?.templateId,
    entrypoint: resolved.selected.name,
    signatureSlots: slots,
    outputs,
    covenantId: resolved.covenantId
  });
  const previousOutpoint = resolved.input.previousOutpoint || {};
  return {
    package: {
      ...pkg,
      covenantInput: {
        ...pkg.covenantInput,
        programHex: resolved.programHex,
        covenantId: resolved.covenantId,
        abi: resolved.abi,
        arguments: resolved.argumentsList
      }
    },
    review: {
      network: pkg.network,
      transactionId: String(resolved.transaction.id || ""),
      commitment: transactionCommitment(pkg.transactionSafeJson),
      inputCount: resolved.transaction.inputs.length,
      outputCount: resolved.transaction.outputs.length,
      targetInputIndex: resolved.inputIndex,
      inputOutpoint: {
        transactionId: String(previousOutpoint.transactionId || ""),
        index: Number(previousOutpoint.index || 0)
      },
      covenantId: resolved.covenantId,
      programSha256: sha256(Buffer.from(resolved.programHex, "hex")),
      entrypoint: resolved.selected.name,
      feeSompi: resolved.fee.toString(),
      feeKas: sompiToKas(resolved.fee),
      outputs,
      signatureSlots: slots,
      operation,
      complete: slots.every((slot) => slot.signed),
      warning: "The supplied ABI is metadata, not proof of the redeem program semantics. Review trusted source/artifact provenance before signing."
    }
  };
}

export function exportExternalCovenantPackage(input, directory = path.join(os.homedir(), "Downloads")) {
  const inspected = inspectExternalCovenantPackage(input);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stem = `silverscript-${inspected.review.commitment.slice(0, 12)}`;
  let file = "";
  for (let index = 0; index < 100; index += 1) {
    const suffix = index ? `-${index + 1}` : "";
    const candidate = path.join(directory, `${stem}${suffix}.ssinvite`);
    try {
      fs.writeFileSync(candidate, `${JSON.stringify(inspected.package, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      file = candidate;
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  if (!file) throw packageError("Could not allocate a unique invitation filename", "INVITATION_EXPORT_FAILED");
  return { file, filename: path.basename(file), commitment: inspected.review.commitment };
}

export function finalizeExternalCovenantPackage(input) {
  const inspected = inspectExternalCovenantPackage(input);
  const pkg = inspected.package;
  const resolved = normalized(pkg);
  const remaining = signatureSlots(resolved.selected, resolved.argumentsList).filter((slot) => !slot.signed);
  if (remaining.length) throw packageError(`Covenant package still has ${remaining.length} unsigned signature slots`, "SIGNATURE_SLOTS_REMAIN");
  const argumentScript = new kaspa.ScriptBuilder(COVENANT_SCRIPT_OPTIONS);
  resolved.selected.inputs.forEach((definition, index) => appendArgument(argumentScript, definition.type_name, resolved.argumentsList[index]));
  if (resolved.abi.length > 1) argumentScript.addI64(BigInt(resolved.abi.findIndex((entry) => entry.name === resolved.selected.name)));
  const signatureScript = kaspa.ScriptBuilder
    .fromScript(resolved.programHex, COVENANT_SCRIPT_OPTIONS)
    .encodePayToScriptHashSignatureScript(argumentScript.drain());
  const transactionInputs = resolved.transaction.inputs;
  transactionInputs[resolved.inputIndex].signatureScript = signatureScript;
  resolved.transaction.inputs = transactionInputs;
  resolved.transaction.finalize();
  pkg.transactionSafeJson = resolved.transaction.serializeToSafeJSON();
  return inspectExternalCovenantPackage(pkg);
}

export async function signExternalCovenantPackage(input, walletService) {
  const inspected = inspectExternalCovenantPackage(input.package);
  const pkg = inspected.package;
  if (input.confirmation !== "SIGN REVIEWED EXTERNAL COVENANT") throw packageError("External covenant signing confirmation phrase is required", "EXTERNAL_CONFIRMATION_REQUIRED");
  if (pkg.network === "mainnet") {
    if (!config.allowMainnet) throw Object.assign(new Error("Mainnet external signing is disabled by this application build"), { status: 403 });
    if (input.mainnetConfirmation !== "SIGN REAL KAS EXTERNAL") throw packageError("Mainnet external signing confirmation phrase is required");
  }
  const resolved = normalized(pkg);
  const publicKey = String(input.publicKey || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(publicKey)) throw packageError("Connected wallet public key is invalid");
  const slots = signatureSlots(resolved.selected, resolved.argumentsList);
  const matching = slots.filter((slot) => slot.publicKey === publicKey && !slot.signed);
  if (!matching.length) throw packageError("Connected wallet has no unsigned slot in this covenant entrypoint", "NO_MATCHING_SIGNATURE_SLOT");
  const signature = await walletService.createCovenantInputSignature({
    walletId: input.walletId,
    walletSecret: input.walletSecret,
    paymentSecret: input.paymentSecret,
    network: pkg.network,
    transactionSafeJson: pkg.transactionSafeJson,
    inputIndex: resolved.inputIndex,
    expectedPublicKey: publicKey
  });
  for (const slot of matching) resolved.argumentsList[slot.index] = { ...resolved.argumentsList[slot.index], kind: "signature", publicKey, hex: signature };
  pkg.covenantInput.arguments = resolved.argumentsList;
  const remaining = signatureSlots(resolved.selected, resolved.argumentsList).filter((slot) => !slot.signed);
  let preflight = null;
  if (!remaining.length) {
    const finalized = finalizeExternalCovenantPackage(pkg);
    pkg.transactionSafeJson = finalized.package.transactionSafeJson;
    preflight = await kascovPreflight(pkg.transactionSafeJson, pkg.network, "signed");
  }
  const reviewed = inspectExternalCovenantPackage(pkg);
  return { ...reviewed, preflight, remainingSignatureSlots: remaining.length };
}
