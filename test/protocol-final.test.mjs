import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { compileContract } from "../server/compiler.mjs";
import { TemplateStore } from "../server/template-store.mjs";
import { buildKcc20WillOperationPackage } from "../server/kcc20-will-service.mjs";
import { kascovPreflight, setRpcClientFactoryForTests, buildWalletTransferDraft, signAndBroadcastWalletTransfer, buildDeployDraft, signDeployDraft, broadcastDeploy } from "../server/kaspa-service.mjs";
import { DraftStore } from "../server/draft-store.mjs";
import { finalizeExternalCovenantPackage, signExternalCovenantPackage } from "../server/external-covenant-service.mjs";
import { queryCovenantIndex } from "../server/covenant-state-source.mjs";
import { createPortableWillPackage, inspectPortableWillPackage } from "../server/portable-will-service.mjs";
import { requireNetwork } from "../server/network-policy.mjs";
import { Kcc20TokenRegistry, registerKcc20WalletToken } from "../server/kcc20-wallet-service.mjs";
import { assertNetworkContext, clearNetworkContext } from "../src/network-context.js";
import { buildTemplateOperationPackage } from "../server/template-operation-service.mjs";
import { FINAL_KCC20_ABI, FINAL_KCC20_FIELDS, ZERO32, kcc1TemplateHash, kcc1DispatchTag, encodeFinalState, decodeFinalState, encodeFinalTokenProgram, decodeFinalTokenProgram } from "../server/kcc20-final.mjs";

const require = createRequire(import.meta.url), kaspa = require("@kluster/kaspa-wasm");
const reference = JSON.parse(fs.readFileSync(new URL("./fixtures/kcc20-final-reference.json", import.meta.url)));
function privateKey() { for (;;) { try { return new kaspa.PrivateKey(crypto.randomBytes(32).toString("hex")); } catch {} } }
function referenceTemplate() {
  const code = Buffer.from(reference.programHex, "hex");
  // Argent carries its own immutable route-template commitment immediately
  // before the standard six fields; use a descriptor-pinned six-field view.
  Buffer.from(reference.templateHash, "hex").copy(code, 2);
  const offset = reference.stateSpan.offset + 33;
  const prefix = code.subarray(0, offset), suffix = code.subarray(reference.stateSpan.offset + reference.stateSpan.len);
  return { prefix, suffix, protocol: "kcc20-final", extension_commitment: ZERO32,
    prefixLength: prefix.length, suffixLength: suffix.length, templateHash: kcc1TemplateHash(prefix, suffix) };
}
function source(programHex, covenantId, transactionId, amount, ownerAddress) {
  const spk = kaspa.payToScriptHashScript(programHex);
  const network = ownerAddress.startsWith("kaspa:") ? "mainnet" : "testnet-10";
  const tx = kaspa.Transaction.deserializeFromSafeJSON(JSON.stringify({ id: ZERO32, version: 1,
    inputs: [{ transactionId, index: 0, sequence: "0", sigOpCount: 0, computeBudget: 0, signatureScript: "", utxo: {
      address: kaspa.addressFromScriptPublicKey(spk, network).toString(), amount: String(amount), scriptPublicKey: `0000${spk.script}`, blockDaaScore: "1", isCoinbase: false, covenantId } }],
    outputs: [{ value: "1", scriptPublicKey: `0000${kaspa.payToAddressScript(ownerAddress).script}`, covenant: null }],
    subnetworkId: "00".repeat(20), lockTime: "0", gas: "0", storageMass: "0", payload: "" }));
  return { entry: tx.inputs[0].utxo, covenantId };
}

test("KCC-1 template and dispatch hashes match official vectors", () => {
  assert.equal(kcc1TemplateHash([], []), "e572dff82304700b856a555ac3a4558d0df3646a3727816500270a93c66aac1e");
  assert.equal(kcc1TemplateHash([0,255], [16,0,128]), "6616a66757315de0221cb2acba729113cebde31f8d3ca7fa93878a0584b96905");
  assert.deepEqual(FINAL_KCC20_ABI.map((e) => kcc1DispatchTag(e, FINAL_KCC20_FIELDS)), reference.dispatch.map((e) => e.dispatch_tag_hex));
});
test("Final six-field state matches the official explicit-push vector and rejects invalid encodings", () => {
  const bytes = Buffer.from(reference.stateVector.encoded_hex, "hex"), state = decodeFinalState(bytes);
  assert.equal(state.amount, 1000n);
  assert.deepEqual(encodeFinalState(state), bytes);
  for (const position of [0,9,42,44,46,79]) { const bad = Buffer.from(bytes); bad[position] ^= 1; assert.throws(() => decodeFinalState(bad)); }
  const negativeZero = Buffer.from(bytes); negativeZero.fill(0, 1, 9); negativeZero[8] = 128;
  assert.throws(() => decodeFinalState(negativeZero), /negative/i);
  assert.throws(() => encodeFinalState({ ...state, amount: 1n << 63n }));
  assert.throws(() => encodeFinalState({ ...state, owner_scheme: 128 }));
  assert.throws(() => encodeFinalState({ ...state, borrow_scheme: 4 }));
});
test("Final token state views bind template, extension and protocol without legacy auto-detection", () => {
  const template = referenceTemplate();
  const program = encodeFinalTokenProgram(template, "11".repeat(32), 4, 10000n);
  const decoded = decodeFinalTokenProgram(program, template);
  assert.equal(decoded.owner_scheme, 4); assert.equal(decoded.amount, 10000n);
  assert.throws(() => decodeFinalTokenProgram(program, { ...template, protocol: "kcc20-legacy" }));
  assert.throws(() => decodeFinalTokenProgram(program, { ...template, templateHash: ZERO32 }));
  assert.throws(() => decodeFinalTokenProgram(program, { ...template, extensionCommitment: "11".repeat(32) }));
});
for (const network of ["tn10", "mainnet"]) for (const heirCount of [1, 3]) test(`Final KCC20 lifecycle executes on ${network} with ${heirCount} heir(s)`, async () => {
  const networkId = network === "mainnet" ? "mainnet" : "testnet-10";
  const owner = privateKey(), heir = privateKey();
  const ownerAddress = owner.toAddress(networkId).toString();
  const heirKey = heir.toPublicKey().toXOnlyPublicKey().toString();
  const tokenId = "b7".repeat(32), controllerId = "c8".repeat(32), template = referenceTemplate();
  const tokenProgram = encodeFinalTokenProgram(template, controllerId, 4, 10000n);
  const templates = new TemplateStore();
  const configured = templates.projectInput("kcc20-final-inheritance-vault", network, {
    amountKas: "0.5", ownerAddress, inheritors: Array.from({ length: heirCount }, (_, index) => ({
      address: (index === 0 ? heir : privateKey()).toAddress(networkId).toString(),
      shareBps: heirCount === 1 ? 10000 : [2000, 3000, 5000][index]
    })), inactivityDays: { value: 1, unit: "days" },
    tokenCovenantId: tokenId, tokenDisplayName: "", tokenTemplatePrefixLength: template.prefixLength,
    tokenTemplateSuffixLength: template.suffixLength, tokenTemplateHash: template.templateHash, tokenExtensionCommitment: ZERO32 });
  const artifact = await compileContract(configured);
  assert.equal(artifact.compiler.upstreamCommit, reference.compilerCommit);
  const project = { id: "final-inherit-test", ...configured, artifact,
    deployment: { txid: "d9".repeat(32), activeTxid: "d9".repeat(32), activeOutputIndex: 0, covenantId: controllerId, network } };
  const portable = createPortableWillPackage(project, { templates });
  assert.equal(inspectPortableWillPackage(portable, templates).project.compilerProfileId, "stable-1.0.0");
  // Three large reference-token outputs need adequate sompi backing for
  // storage mass. A tiny carrier must be rejected, never forced through.
  const tokenSource = source(tokenProgram, tokenId, "e1".repeat(32), 10_000_000_000, ownerAddress);
  const controllerSource = source(artifact.programHex, controllerId, "d9".repeat(32), 50_000_000, ownerAddress);
  const built = await buildKcc20WillOperationPackage({ operationId: "inherit", tokenProgramHex: tokenProgram,
    tokenTransactionId: "e1".repeat(32), tokenOutputIndex: 0, feeKas: "0.02" }, project, {
    findUtxo: async (_network, program) => program === tokenProgram ? tokenSource : controllerSource, preflight: kascovPreflight });
  assert.equal(built.review.complete, true);
  assert.equal(built.preflight.localEngineVerified, true);
  assert.equal(built.preflight.ok, true, JSON.stringify(built.preflight));
  const fields = built.package.covenantInputs[1].arguments[0].items[0].fields;
  assert.equal(fields.owner.hex, heirKey); assert.equal(fields.amount.data, heirCount === 1 ? "10000" : "2000");
  assert.equal(fields.owner_scheme.data, 0); assert.equal(fields.borrow_scheme.data, 0);
  const amounts = built.package.covenantInputs[1].arguments[0].items.map((item) => BigInt(item.fields.amount.data));
  assert.deepEqual(amounts, heirCount === 1 ? [10000n] : [2000n, 3000n, 5000n]);
  assert.equal(amounts.reduce((a, b) => a + b, 0n), 10000n);
  if (heirCount === 3) {
    await assert.rejects(buildKcc20WillOperationPackage({ operationId: "inherit", tokenProgramHex: tokenProgram,
      tokenTransactionId: "e1".repeat(32), tokenOutputIndex: 0, feeKas: "0.02" }, project, {
      findUtxo: async (_network, program) => program === tokenProgram
        ? source(tokenProgram, tokenId, "e1".repeat(32), 100_000_000, ownerAddress) : controllerSource,
      preflight: kascovPreflight
    }), { code: "KCC20_OPERATION_MASS_LIMIT" });
  }
  // The VM, not only the package validator, must reject tampered transactions.
  for (const mutate of [
    (tx) => { tx.inputs[0].sequence = "0"; },
    (tx) => { tx.inputs[1].utxo.covenantId = "aa".repeat(32); },
    (tx) => { tx.outputs[0].covenant.covenantId = "aa".repeat(32); },
    (tx) => { tx.outputs[0].value = String(BigInt(tx.outputs[0].value) - 1n); },
    (tx) => { tx.inputs.reverse(); }
  ]) {
    const tx = JSON.parse(built.package.transactionSafeJson); mutate(tx);
    await assert.rejects(kascovPreflight(JSON.stringify(tx), network, "signed"));
  }
  const tampered = structuredClone(built.package);
  tampered.covenantInputs[1].arguments[0].items[0].fields.amount.data = "9999";
  await assert.rejects(kascovPreflight(finalizeExternalCovenantPackage(tampered).package.transactionSafeJson, network, "signed"));

  // Exercise the new 00 || signature witness rather than legacy sig[].
  const ownerKey = owner.toPublicKey().toXOnlyPublicKey().toString();
  const ownedProgram = encodeFinalTokenProgram(template, ownerKey, 0, 10000n);
  const funding = await buildKcc20WillOperationPackage({ operationId: "fundKcc20", tokenProgramHex: ownedProgram,
    tokenTransactionId: "f2".repeat(32), tokenOutputIndex: 0, feeKas: "0.02" }, project, {
    findUtxo: async () => source(ownedProgram, tokenId, "f2".repeat(32), 100_000_000, ownerAddress), preflight: kascovPreflight });
  const signer = { async createCovenantInputSignature({ transactionSafeJson, inputIndex }) {
    const tx = kaspa.Transaction.deserializeFromSafeJSON(transactionSafeJson);
    const sig = String(kaspa.createInputSignature(tx, inputIndex, owner, 1)).toLowerCase();
    return /^41[0-9a-f]{130}$/.test(sig) ? sig.slice(2) : sig;
  } };
  const signed = await signExternalCovenantPackage({ package: funding.package, publicKey: ownerKey,
    confirmation: "SIGN REVIEWED EXTERNAL COVENANT", mainnetConfirmation: "SIGN REAL KAS EXTERNAL" }, signer);
  assert.equal(signed.preflight.localEngineVerified, true);
  assert.equal(signed.package.covenantInputs[0].arguments[1].kind, "signature-witness");
  const recovery = await buildKcc20WillOperationPackage({ operationId: "recover", tokenProgramHex: tokenProgram,
    tokenTransactionId: "e1".repeat(32), tokenOutputIndex: 0, feeKas: "0.02" }, project, {
    findUtxo: async (_network, program) => program === tokenProgram ? tokenSource : controllerSource, preflight: kascovPreflight });
  const recovered = await signExternalCovenantPackage({ package: recovery.package, publicKey: ownerKey,
    confirmation: "SIGN REVIEWED EXTERNAL COVENANT", mainnetConfirmation: "SIGN REAL KAS EXTERNAL" }, signer);
  assert.equal(recovered.preflight.localEngineVerified, true);
  await assert.rejects(buildKcc20WillOperationPackage({ operationId: "inherit" }, { ...project, network: "invalid" }), { code: "WRONG_NETWORK" });
});

test("native covenant index consumes all pages and rejects malformed or looping cursors", async () => {
  const calls = [], cursor = { startDaaScore: 123n, startOutpoint: { index: 2 } };
  const rpc = { async getUtxosByCovenantIds(request) { calls.push(request); return calls.length === 1
    ? { entries: [{ outpoint: { index: 0 }, utxoEntry: { amount: 1n } }], nextCursor: cursor }
    : { entries: [{ outpoint: { index: 1 }, utxoEntry: { amount: 2n } }] }; } };
  const result = await queryCovenantIndex(rpc, "ab".repeat(32));
  assert.equal(result.length, 2); assert.equal(result[1].entry.amount, 2n);
  assert.deepEqual(calls[1].cursor, cursor);
  await assert.rejects(queryCovenantIndex({}, "ab".repeat(32)), { code: "COVENANT_RPC_UNSUPPORTED" });
  await assert.rejects(queryCovenantIndex({ getUtxosByCovenantIds: async () => ({ entries: [], nextCursor: cursor }) }, "ab".repeat(32)), { code: "COVENANT_RPC_CURSOR_LOOP" });
  await assert.rejects(queryCovenantIndex({ getUtxosByCovenantIds: async () => ({}) }, "ab".repeat(32)));
});

test("network switches clear every wallet, signature and draft context", () => {
  let aborted = false;
  const state = { wallet: {}, activeProject: {}, package: {}, review: {}, transferDraft: {}, kcc20Package: {},
    kcc20Review: {}, kcc20Tokens: [{}], tokenMetadata: {}, operationId: "inherit", lifecycleRequestId: 3,
    lifecycleController: { abort() { aborted = true; } }, countdownTargetMs: 1, networkEpoch: 1 };
  clearNetworkContext(state);
  for (const key of ["wallet", "activeProject", "package", "review", "transferDraft", "kcc20Package", "kcc20Review", "tokenMetadata", "countdownTargetMs"]) assert.equal(state[key], null);
  assert.equal(state.networkEpoch, 2); assert.equal(state.lifecycleRequestId, 4); assert.ok(aborted);
  assert.equal(state.kcc20Tokens.length, 0);
  assert.throws(() => assertNetworkContext("mainnet", "tn10"));
  assert.throws(() => requireNetwork("mainnet", { legacy: true }), { code: "LEGACY_TOKEN_MAINNET_DISABLED" });
  assert.throws(() => requireNetwork("not-a-network"), { code: "WRONG_NETWORK" });
});

test("Final token registrations are isolated by network, including identical covenant IDs", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kas-will-networks-"));
  try {
    const registry = new Kcc20TokenRegistry(directory), template = referenceTemplate(), covenantId = "ac".repeat(32);
    const programHex = encodeFinalTokenProgram(template, "11".repeat(32), 0, 10000n);
    const descriptor = { protocol: "kcc20-final", covenantId, templateHash: template.templateHash,
      prefixLength: template.prefixLength, suffixLength: template.suffixLength, extensionCommitment: ZERO32 };
    const findUtxo = async (network) => { assert.ok(["mainnet", "tn10"].includes(network)); return { covenantId }; };
    for (const network of ["tn10", "mainnet"]) await registerKcc20WalletToken({ network, descriptor, programHex, name: network }, { registry, findUtxo });
    assert.equal(registry.get(covenantId, "mainnet").name, "mainnet");
    assert.equal(registry.get(covenantId, "tn10").name, "tn10");
    assert.equal(registry.list("mainnet").length, 1);
    registry.remove(covenantId, "tn10"); assert.equal(registry.list("mainnet").length, 1);
    await assert.rejects(registerKcc20WalletToken({ network: "mainnet", descriptor: { ...descriptor, network: "tn10" }, programHex }, { registry, findUtxo }), { code: "WRONG_NETWORK" });
    await assert.rejects(registerKcc20WalletToken({ network: "mainnet", descriptor: { ...descriptor, protocol: "kcc20-legacy" }, programHex }, { registry, findUtxo }), { code: "LEGACY_TOKEN_MAINNET_DISABLED" });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("ALLOW_MAINNET=false blocks signers and all broadcast entrypoints before node access", () => {
  const script = `
    import assert from 'node:assert/strict';
    import { requireNetwork } from './server/network-policy.mjs';
    import { WalletService } from './server/wallet-service.mjs';
    import { broadcastDeploy, broadcastWalletTransfer, submitReviewedTransaction } from './server/kaspa-service.mjs';
    assert.throws(()=>requireNetwork('mainnet',{spend:true}),{code:'MAINNET_DISABLED'});
    const wallet=Object.create(WalletService.prototype);
    for(const method of ['signTransaction','createCovenantInputSignature','signP2pkInput']) await assert.rejects(wallet[method]({network:'mainnet'}),{code:'MAINNET_DISABLED'});
    const drafts={get:()=>({network:'mainnet',kind:'wallet-transfer'})};
    await assert.rejects(broadcastDeploy({draftId:'unused'},drafts),{code:'MAINNET_DISABLED'});
    await assert.rejects(broadcastWalletTransfer({draftId:'unused'},drafts),{code:'MAINNET_DISABLED'});
    await assert.rejects(submitReviewedTransaction('mainnet','{}'));
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: new URL("../", import.meta.url), env: { ...process.env, ALLOW_MAINNET: "false" }, stdio: "pipe" });
});

test("stable mainnet KAS renew/recover/inherit execute locally with explicit real-KAS signature confirmation", async () => {
  const owner = privateKey(), heir = privateKey(), templates = new TemplateStore();
  const ownerAddress = owner.toAddress("mainnet").toString(), ownerKey = owner.toPublicKey().toXOnlyPublicKey().toString();
  const configured = templates.projectInput("inheritance-vault", "mainnet", { ownerAddress, amountKas: "0.5",
    inheritors: [{ address: heir.toAddress("mainnet").toString(), shareBps: 10000 }], inactivityDays: { value: 1, unit: "days" } });
  const artifact = await compileContract(configured), covenantId = "bb".repeat(32);
  const project = { id: "mainnet-kas-test", ...configured, artifact,
    deployment: { txid: "cc".repeat(32), covenantId, activeOutputIndex: 0, network: "mainnet" } };
  const cell = source(artifact.programHex, covenantId, project.deployment.txid, 100_000_000, ownerAddress);
  const signer = { async createCovenantInputSignature({ transactionSafeJson, inputIndex }) {
    const tx = kaspa.Transaction.deserializeFromSafeJSON(transactionSafeJson);
    const sig = String(kaspa.createInputSignature(tx, inputIndex, owner, 1)); return sig.startsWith("41") && sig.length === 132 ? sig.slice(2) : sig;
  } };
  for (const operationId of ["checkIn", "recover", "inherit"]) {
    const built = await buildTemplateOperationPackage({ operationId, feeKas: "0.01" }, project, templates.get("inheritance-vault"), async () => cell, kascovPreflight);
    if (operationId === "inherit") assert.equal(built.preflight.localEngineVerified, true);
    else {
      await assert.rejects(signExternalCovenantPackage({ package: built.package, publicKey: ownerKey, confirmation: "SIGN REVIEWED EXTERNAL COVENANT" }, signer), /Mainnet external signing confirmation/);
      const signed = await signExternalCovenantPackage({ package: built.package, publicKey: ownerKey,
        confirmation: "SIGN REVIEWED EXTERNAL COVENANT", mainnetConfirmation: "SIGN REAL KAS EXTERNAL" }, signer);
      assert.equal(signed.preflight.localEngineVerified, true);
    }
  }
});

test("mainnet deployment and plain transfer build, sign and submit only to a mocked node", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kas-will-mainnet-drafts-"));
  const owner = privateKey(), heir = privateKey(), address = owner.toAddress("mainnet").toString();
  const publicKey = owner.toPublicKey().toXOnlyPublicKey().toString(), recipient = heir.toAddress("mainnet").toString();
  let submitted = 0;
  try {
    setRpcClientFactoryForTests((network) => {
      assert.equal(network.id, "mainnet");
      return { async connect() {}, async disconnect() {}, async stop() {},
        async getServerInfo() { return { networkId: "mainnet" }; },
        async getUtxosByAddresses() { return { entries: [{ address, outpoint: { transactionId: "ad".repeat(32), index: 0 },
          amount: 2_000_000_000n, scriptPublicKey: { script: kaspa.payToAddressScript(address).script }, blockDaaScore: 0n, isCoinbase: false }] }; },
        async submitTransaction() { submitted++; return { transactionId: "de".repeat(32) }; }
      };
    });
    const drafts = new DraftStore(directory);
    const transfer = { network: "mainnet", address, recipient, amountKas: "0.5" };
    await assert.rejects(buildWalletTransferDraft(transfer, drafts), /confirmation phrase/);
    await assert.rejects(buildWalletTransferDraft({ ...transfer, amountKas: "1.1", mainnetConfirmation: "SEND REAL KAS" }, drafts), /local cap/);
    const draft = await buildWalletTransferDraft({ ...transfer, mainnetConfirmation: "SEND REAL KAS" }, drafts);
    const signer = { async signTransaction({ transactionSafeJson, network }) {
      assert.equal(network, "mainnet");
      const tx = kaspa.Transaction.deserializeFromSafeJSON(transactionSafeJson);
      return kaspa.signTransaction(tx, [owner], true).serializeToSafeJSON();
    } };
    const sent = await signAndBroadcastWalletTransfer({ draftId: draft.id }, drafts, signer);
    assert.equal(sent.network, "mainnet"); assert.equal(sent.preflight.localEngineVerified, true);
    const templates = new TemplateStore(), configured = templates.projectInput("inheritance-vault", "mainnet", {
      ownerAddress: address, amountKas: "0.5", inheritors: [{ address: recipient, shareBps: 10000 }], inactivityDays: { value: 1, unit: "days" } });
    const artifact = await compileContract(configured);
    const input = { ...configured, amountKas: "0.5", artifact, address, publicKey };
    await assert.rejects(buildDeployDraft(input, drafts), /confirmation phrase/);
    const deploy = await buildDeployDraft({ ...input, mainnetConfirmation: "DEPLOY REAL KAS" }, drafts);
    const signed = await signDeployDraft({ draftId: deploy.id }, drafts, signer);
    const deployed = await broadcastDeploy({ draftId: deploy.id, signedTransactionSafeJson: signed.signedTransactionSafeJson }, drafts);
    assert.equal(deployed.network, "mainnet"); assert.equal(deployed.preflight.localEngineVerified, true);
    assert.equal(submitted, 2);
  } finally {
    setRpcClientFactoryForTests(); fs.rmSync(directory, { recursive: true, force: true });
  }
});
