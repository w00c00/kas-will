import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { requireNetwork } from "./network-policy.mjs";
import { FINAL_KCC20_PROTOCOL, FINAL_KCC20_ABI, FINAL_KCC20_FIELDS, ZERO32, finalStateArgument } from "./kcc20-final.mjs";
import { decodeKcc20TokenProgram, encodeKcc20TokenProgram, kcc20WalletIdentity, KCC20_ABI, KCC20_STATE_FIELDS } from "./kcc20-will-service.mjs";
import { buildAtomicCovenantPackage } from "./atomic-covenant-builder.mjs";
import { finalizeExternalCovenantPackage, inspectExternalCovenantPackage } from "./external-covenant-service.mjs";
import { fetchKascovTokenMetadata } from "./kascov-token-service.mjs";
import { fetchSpendableUtxos, findCovenantUtxo, kasToSompi, kascovPreflight, sompiToKas } from "./kaspa-service.mjs";
import { safeId } from "./security.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const MAX_FEE = 10_000_000n;
const COMPUTE_BUDGET = 120;
const TOKEN_CELL_KAS = 20_000n; // 0.0002 TKAS rides along with every token output
const DUST = 5_460n;

function fail(message, code = "INVALID_KCC20_WALLET_OPERATION") {
  throw Object.assign(new Error(message), { status: 400, code });
}

function hex(value, bytes = null, label = "hexadecimal value") {
  const normalized = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 || (bytes !== null && normalized.length !== bytes * 2)) {
    fail(`${label} is invalid`);
  }
  return normalized;
}

export class Kcc20TokenRegistry {
  constructor(dataDir) {
    this.directory = path.join(dataDir, "kcc20-tokens");
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  file(id, network = "tn10") {
    requireNetwork(network);
    const directory = network === "tn10" ? this.directory : path.join(this.directory, network);
    return path.join(directory, `${safeId(id, "covenant id")}.json`);
  }

  list(network = "tn10") {
    requireNetwork(network);
    const directory = network === "tn10" ? this.directory : path.join(this.directory, network);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        try { return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")); } catch { return null; }
      })
      .filter((record) => record && (record.network || "tn10") === network)
      .sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt)));
  }

  get(id, network = "tn10") {
    try {
      const record = JSON.parse(fs.readFileSync(this.file(id, network), "utf8"));
      return (record.network || "tn10") === network ? record : null;
    } catch { return null; }
  }

  save(record) {
    const file = this.file(record.covenantId, record.network || "tn10");
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
    return record;
  }

  remove(id, network = "tn10") {
    try {
      fs.unlinkSync(this.file(id, network));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
}

function normalizedDescriptor(raw) {
  let descriptor;
  try { descriptor = typeof raw === "string" ? JSON.parse(raw) : (raw || {}); }
  catch { fail("KCC20 descriptor is not valid JSON"); }
  const root = descriptor.descriptor || descriptor;
  const covenantId = hex(root.covenantId || root.covenant_id, 32, "KCC20 covenant ID");
  const templateHash = hex(root.templateHash || root.template_hash || root.expectedTemplateHash, 32, "KCC20 template hash");
  const prefixLength = Number(root.templatePrefixLen ?? root.template_prefix_len ?? root.prefixLength ?? root.prefixLen);
  const suffixLength = Number(root.templateSuffixLen ?? root.template_suffix_len ?? root.suffixLength ?? root.suffixLen);
  if (!Number.isSafeInteger(prefixLength) || prefixLength < 0 || !Number.isSafeInteger(suffixLength) || suffixLength < 1) {
    fail("KCC20 descriptor template lengths are invalid");
  }
  const protocol = root.protocol || "kcc20-legacy";
  if (!["kcc20-legacy", FINAL_KCC20_PROTOCOL].includes(protocol)) fail("Unknown KCC20 protocol; legacy and Final descriptors are not interchangeable");
  return { covenantId, templateHash, prefixLength, suffixLength, protocol, ...(root.extensionCommitment ? { extensionCommitment: hex(root.extensionCommitment, 32) } : {}) };
}

export function publicTokenView(record, holdings = null) {
  return {
    network: record.network || "tn10",
    covenantId: record.covenantId,
    protocol: record.protocol || "kcc20-legacy",
    extensionCommitment: record.extensionCommitment || "",
    name: record.name || "",
    ticker: record.ticker || "",
    templateHash: record.templateHash,
    prefixLength: String(record.prefixHex || "").length / 2,
    suffixLength: String(record.suffixHex || "").length / 2,
    registeredAt: record.registeredAt,
    ...(holdings ? { holdings } : {})
  };
}

// Registering captures the token's immutable template (prefix + suffix bytes)
// from one pasted live redeem program; later sends rebuild programs from the
// template and verify them against the node's P2SH script, so the paste is
// needed only once.
export async function registerKcc20WalletToken(input, { registry, findUtxo = findCovenantUtxo } = {}) {
  const descriptor = normalizedDescriptor(input?.descriptor);
  const network = requireNetwork(input?.network || "tn10", { legacy: descriptor.protocol !== FINAL_KCC20_PROTOCOL });
  const rawDescriptor = typeof input?.descriptor === "string" ? JSON.parse(input.descriptor) : input?.descriptor;
  const declaredNetwork = rawDescriptor?.descriptor?.network || rawDescriptor?.network;
  if (declaredNetwork && declaredNetwork !== network.id && declaredNetwork !== network.kaspaNetworkId) fail("Descriptor network differs from the selected network", "WRONG_NETWORK");
  const programHex = hex(input?.programHex, null, "KCC20 redeem program");
  const state = decodeKcc20TokenProgram(programHex, descriptor);
  if (state.isMinter) fail("Kas Will never registers a KCC20 minter cell", "KCC20_MINTER_REJECTED");
  const live = await findUtxo(network.id, programHex, "", 0, descriptor.covenantId);
  if (String(live.covenantId || "").toLowerCase() !== descriptor.covenantId) {
    fail("Resolved token UTXO has a different Covenant ID", "KCC20_COVENANT_ID_MISMATCH");
  }
  const existing = registry.get(descriptor.covenantId, network.id) || {};
  if (existing.covenantId && (existing.templateHash !== descriptor.templateHash || (existing.protocol || "kcc20-legacy") !== descriptor.protocol
    || (descriptor.protocol === FINAL_KCC20_PROTOCOL && existing.extensionCommitment !== state.extension_commitment))) fail("An existing token registration cannot change its template, protocol or fungibility domain");
  const record = {
    network: network.id,
    covenantId: descriptor.covenantId,
    name: String(input?.name || existing.name || "").slice(0, 120),
    ticker: String(input?.ticker || existing.ticker || "").slice(0, 32),
    templateHash: descriptor.templateHash,
    protocol: descriptor.protocol,
    prefixLength: descriptor.prefixLength,
    suffixLength: descriptor.suffixLength,
    ...(descriptor.protocol === FINAL_KCC20_PROTOCOL ? { extensionCommitment: state.extension_commitment } : {}),
    prefixHex: state.prefix.toString("hex"),
    suffixHex: state.suffix.toString("hex"),
    registeredAt: existing.registeredAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cells: existing.cells || {},
    programs: [...new Set([programHex, ...(existing.programs || [])])].slice(0, 8)
  };
  registry.save(record);
  return { token: publicTokenView(record) };
}

async function holdingsForToken(record, address) {
  try {
    const metadata = await fetchKascovTokenMetadata(record.network || "tn10", record.covenantId);
    const mine = (metadata.balances || []).filter((entry) => entry.ownerAddress === address);
    return {
      balance: mine.reduce((sum, entry) => sum + BigInt(entry.balance), 0n).toString(),
      cells: mine.reduce((sum, entry) => sum + Number(entry.cells || 0), 0),
      advisory: true,
      source: "kascov"
    };
  } catch {
    return { balance: null, cells: null, advisory: true, source: "unavailable" };
  }
}

export async function listKcc20WalletTokens({ address, network: networkId = "tn10" }, { registry } = {}) {
  const network = requireNetwork(networkId);
  const wallet = String(address || "").trim().toLowerCase();
  kcc20WalletIdentity(wallet, network);
  const tokens = registry.list(network.id);
  const settled = await Promise.all(tokens.map((record) => holdingsForToken(record, wallet)));
  return {
    tokens: tokens.map((record, index) => publicTokenView(record, settled[index]))
  };
}

async function resolveCurrentCell(token, owner, candidates) {
  for (const candidateHex of candidates) {
    try {
      const source = await findCovenantUtxo(token.network || "tn10", candidateHex, "", 0, token.covenantId);
      const state = decodeKcc20TokenProgram(candidateHex, { ...token, prefixLength: token.prefixHex.length / 2, suffixLength: token.suffixHex.length / 2 });
      if (state.ownerIdentifier === owner.publicKey && state.identifierType === 0 && !state.isMinter) {
        return { source, state, programHex: candidateHex };
      }
    } catch { /* candidate is not the live cell; try the next one */ }
  }
  return null;
}

// Builds a __leader_transfer that moves `amount` tokens to the recipient's
// P2PK identity, keeps any remainder in a change cell owned by the sender, and
// pays fees through a plain wallet UTXO appended as a p2pk authorization input.
export async function buildKcc20WalletTransfer(input, { registry } = {}) {
  const network = requireNetwork(input?.network || "tn10", { spend: true });
  const covenantId = hex(input?.covenantId, 32, "KCC20 covenant ID");
  const token = registry.get(covenantId, network.id);
  if (!token) fail("This KCC20 token is not registered on this device", "KCC20_TOKEN_NOT_REGISTERED");
  requireNetwork(network.id, { legacy: token.protocol !== FINAL_KCC20_PROTOCOL });
  const owner = kcc20WalletIdentity(input?.address, network);
  const recipient = kcc20WalletIdentity(input?.recipientAddress, network);
  if (recipient.address === owner.address) fail("KCC20 recipient must differ from the sending wallet");
  const amount = BigInt(input?.amount ?? "");
  if (amount <= 0n) fail("KCC20 transfer amount must be a positive integer");

  const isFinal = token.protocol === FINAL_KCC20_PROTOCOL;
  const template = { prefixHex: token.prefixHex, suffixHex: token.suffixHex, protocol: token.protocol, extensionCommitment: token.extensionCommitment };
  let current = await resolveCurrentCell(token, owner, [
    ...input?.programHex ? [hex(input.programHex, null, "KCC20 redeem program")] : [],
    ...token.cells?.[owner.address]?.programHex ? [token.cells[owner.address].programHex] : [],
    ...(token.programs || [])
  ]);
  if (!current) {
    // Reconstruct candidate programs from Kascov's advisory single-cell
    // balances; the node's P2SH script match below rejects any wrong guess.
    const metadata = await fetchKascovTokenMetadata(network.id, covenantId);
    const candidates = (metadata.balances || [])
      .filter((entry) => entry.ownerAddress === owner.address && Number(entry.cells || 0) === 1)
      .map((entry) => encodeKcc20TokenProgram(template, owner.publicKey, 0, BigInt(entry.balance)));
    current = await resolveCurrentCell(token, owner, candidates);
  }
  if (!current) {
    fail("The live KCC20 cell for this wallet was not found; paste the current redeem program", "KCC20_CELL_NOT_FOUND");
  }
  const { source, state, programHex } = current;
  if (amount > state.amount) fail("KCC20 transfer amount exceeds the current cell", "KCC20_AMOUNT_EXCEEDS_CELL");
  const remainder = state.amount - amount;
  if (remainder < 0n) fail("KCC20 transfer leaves a negative cell");

  const sourceKas = BigInt(source.entry?.entry?.amount ?? source.entry?.amount ?? 0);
  if (sourceKas <= 0n) fail("The KCC20 cell carries no KAS for fees");

  const requestedFee = kasToSompi(String(input?.feeKas || "0.02"));
  const utxos = await fetchSpendableUtxos(network, owner.address);
  if (!utxos.length) fail("Wallet has no plain UTXO to pay the transfer fee", "KCC20_NO_FUNDING_UTXO");
  const funding = utxos
    .filter((utxo) => utxo.amount >= requestedFee * 2n + DUST)
    .sort((a, b) => (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0))[0]
    || utxos.sort((a, b) => (a.amount < b.amount ? 1 : a.amount > b.amount ? -1 : 0))[0];
  const authKas = funding.amount;

  let fee = requestedFee;
  let built = null;
  let inspected = null;
  let changeProgramHex = null;
  let recipientProgramHex = "";
  for (let pass = 0; pass < 4; pass += 1) {
    if (fee > MAX_FEE) fail(`KCC20 transfer requires at most ${sompiToKas(MAX_FEE)} TKAS in fees`, "KCC20_FEE_CAP");
    if (authKas < fee) fail("The funding UTXO cannot cover the transfer fee", "KCC20_FUNDING_TOO_SMALL");
    const plainChange = authKas - fee;
    if (plainChange !== 0n && plainChange < DUST) fee = authKas;

    const outputs = [];
    recipientProgramHex = encodeKcc20TokenProgram(template, recipient.publicKey, 0, amount);
    const recipientValue = remainder === 0n
      ? sourceKas
      : (sourceKas > TOKEN_CELL_KAS * 2n ? TOKEN_CELL_KAS : sourceKas - TOKEN_CELL_KAS);
    outputs.push({ valueSompi: recipientValue.toString(), programHex: recipientProgramHex, covenantId });
    if (remainder > 0n) {
      const changeValue = sourceKas - recipientValue;
      if (changeValue <= 0n) fail("The KCC20 cell cannot fund two token outputs", "KCC20_CELL_VALUE_TOO_SMALL");
      changeProgramHex = encodeKcc20TokenProgram(template, owner.publicKey, 0, remainder);
      outputs.push({ valueSompi: changeValue.toString(), programHex: changeProgramHex, covenantId });
    } else {
      changeProgramHex = null;
    }
    if (authKas - fee > 0n) outputs.push({ valueSompi: (authKas - fee).toString(), address: owner.address });

    const tokenArguments = isFinal ? [
      { kind: "state[]", items: [{ owner: recipient.publicKey, amount }, ...(remainder > 0n ? [{ owner: owner.publicKey, amount: remainder }] : [])]
        .map((item) => finalStateArgument({ ...item, owner_scheme: 0, borrow_scheme: 0, borrow_guard: ZERO32, extension_commitment: state.extension_commitment })) },
      { kind: "signature-witness", publicKey: owner.publicKey, prefixHex: "00" }
    ] : [
      { kind: "state[]", items: [
        { fields: {
          ownerIdentifier: { kind: "bytes32", hex: recipient.publicKey },
          identifierType: { kind: "byte", data: 0 },
          amount: { kind: "int", data: amount.toString() },
          isMinter: { kind: "bool", data: false }
        } },
        ...(remainder > 0n ? [{
          fields: {
            ownerIdentifier: { kind: "bytes32", hex: owner.publicKey },
            identifierType: { kind: "byte", data: 0 },
            amount: { kind: "int", data: remainder.toString() },
            isMinter: { kind: "bool", data: false }
          }
        }] : [])
      ] },
      { kind: "signature[]", items: [{ kind: "signature", publicKey: owner.publicKey }] },
      { kind: "bytes", hex: "00" }
    ];
    const authInput = {
      previousOutpoint: funding.outpoint,
      signatureScript: "",
      sequence: 0n,
      sigOpCount: 0,
      computeBudget: COMPUTE_BUDGET,
      utxo: {
        address: owner.address,
        outpoint: funding.outpoint,
        amount: funding.amount,
        scriptPublicKey: new kaspa.ScriptPublicKey(0, funding.script),
        blockDaaScore: funding.blockDaaScore,
        isCoinbase: false
      }
    };
    built = buildAtomicCovenantPackage({
      network: network.id,
      covenantInputs: [{
        utxo: source.entry,
        programHex,
        abi: isFinal ? FINAL_KCC20_ABI : KCC20_ABI,
        stateFields: isFinal ? FINAL_KCC20_FIELDS : KCC20_STATE_FIELDS,
        entrypoint: isFinal ? "transfer" : "__leader_transfer",
        arguments: tokenArguments,
        computeBudget: COMPUTE_BUDGET,
        descriptorProfileId: "kas-will/kcc20-token-input/v1",
        controlPrincipals: [{ role: "asset", profile: "covenant-id/v1", cardinality: 1, reference: { kind: "covenant-id", value: covenantId } }]
      }],
      outputs,
      p2pkAuthorization: { input: authInput, metadata: { inputIndex: 1, address: owner.address, publicKey: owner.publicKey } },
      feeSompi: fee.toString(),
      provenance: { kind: "kas-will-kcc20-wallet", covenantId, templateHash: token.templateHash }
    });
    inspected = inspectExternalCovenantPackage(built);
    const estimationInput = structuredClone(inspected.package);
    for (const covenantInput of estimationInput.covenantInputs || []) {
      covenantInput.arguments = (covenantInput.arguments || []).map((argument) => argument?.kind === "signature-witness" ? { ...argument, hex: "00".repeat(65) } : argument?.kind === "signature[]"
        ? { ...argument, items: (argument.items || []).map((item) => ({ ...item, hex: "00".repeat(65) })) }
        : argument);
    }
    const estimation = finalizeExternalCovenantPackage(estimationInput);
    const estimationTx = kaspa.Transaction.deserializeFromSafeJSON(estimation.package.transactionSafeJson);
    const signatureCount = estimation.review.signatureSlots.length + 1;
    const calculatedMass = BigInt(kaspa.calculateTransactionMass(network.kaspaNetworkId, estimationTx, signatureCount, true));
    const maximumMass = BigInt(kaspa.maximumStandardTransactionMass());
    const minimumFee = kaspa.calculateTransactionFee(network.kaspaNetworkId, estimationTx, signatureCount, true);
    try { estimationTx.free?.(); } catch {}
    if (calculatedMass > maximumMass || minimumFee === undefined) fail("KCC20 transfer exceeds the standard mass limit", "KCC20_OPERATION_MASS_LIMIT");
    const requiredFee = BigInt(minimumFee);
    if (requiredFee <= fee) break;
    if (pass === 3) fail(`KCC20 transfer requires at least ${sompiToKas(requiredFee)} TKAS in fees`, "KCC20_OPERATION_FEE_TOO_LOW");
    fee = requiredFee + 10_000n;
  }

  const preflight = await kascovPreflight(inspected.package.transactionSafeJson, network.id, "draft");

  // A draft is not a confirmed spend. Retain the live program and only cache
  // possible change as a bounded candidate; every future use checks the node.
  registry.save({ ...token, programs: [...new Set([programHex, ...(changeProgramHex ? [changeProgramHex] : []), ...(token.programs || [])])].slice(0, 8), updatedAt: new Date().toISOString() });

  return {
    transfer: {
      covenantId,
      name: token.name || "",
      ticker: token.ticker || "",
      amount: amount.toString(),
      remainder: remainder.toString(),
      recipient: recipient.address,
      sentCellProgramHex: recipientProgramHex,
      changeCellProgramHex: changeProgramHex || ""
    },
    ...inspected,
    preflight
  };
}
