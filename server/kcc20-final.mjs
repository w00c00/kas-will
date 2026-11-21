// KCC-1/2/20 Final codec. Deliberately separate from the pre-standard four-field
// token codec: a legacy descriptor must never silently change interpretation.
import { blake3 } from "@noble/hashes/blake3";

export const FINAL_KCC20_PROTOCOL = "kcc20-final";
export const FINAL_KCC20_STATE_BYTES = 112;
export const FINAL_KCC20_MAX_AMOUNT = (1n << 63n) - 1n;
// Only this pinned reference implementation has been exercised with our
// controller. Six fields alone do not prove token transfer/minter semantics.
export const FINAL_KCC20_REFERENCE_VIEW_HASH = "734850b0af0aeef49f009167bf9ddd238fd8c5cdbe214234f97181ac6f5cc498";
export const FINAL_KCC20_FIELDS = Object.freeze([
  { name: "amount", type_name: "int" },
  { name: "owner", type_name: "byte[32]" },
  { name: "owner_scheme", type_name: "byte" },
  { name: "borrow_scheme", type_name: "byte" },
  { name: "borrow_guard", type_name: "byte[32]" },
  { name: "extension_commitment", type_name: "byte[32]" }
]);
export const FINAL_KCC20_ABI = Object.freeze([
  { name: "transfer", dispatchTag: "79c71c23", inputs: [
    { name: "next_states", type_name: "State[]" }, { name: "witness", type_name: "byte[]" }
  ] },
  { name: "transfer_delegator", dispatchTag: "fd3ef14a", inputs: [{ name: "witness", type_name: "byte[]" }] }
]);
export const ZERO32 = "00".repeat(32);

function fail(message, code = "KCC20_FINAL_INVALID") {
  throw Object.assign(new Error(message), { status: 400, code });
}
export function finalHex(value, length = null) {
  const text = String(value ?? "").replace(/^0x/, "").toLowerCase();
  if (text.length % 2 || !/^[0-9a-f]*$/.test(text) || (length !== null && text.length !== length * 2)) fail("Invalid KCC-20 Final hexadecimal data");
  return text;
}
export function kcc1TemplateHash(prefix, suffix) {
  const p = Buffer.from(prefix), s = Buffer.from(suffix);
  const a = Buffer.alloc(8), b = Buffer.alloc(8);
  a.writeBigInt64LE(BigInt(p.length)); b.writeBigInt64LE(BigInt(s.length));
  return Buffer.from(blake3(Buffer.concat([a, p, b, s]))).toString("hex");
}
export function kcc1DispatchTag(entry, stateFields = []) {
  const record = `{${stateFields.map((field) => field.type_name).join(",")}}`;
  const signature = `${entry.name}(${entry.inputs.map((field) => field.type_name.replace(/^State/, record)).join(",")})`;
  return Buffer.from(blake3(Buffer.from(signature, "utf8"))).subarray(0, 4).toString("hex");
}
function checkedState(input) {
  let amount;
  try { amount = BigInt(input.amount); } catch { fail("KCC-20 Final amount must be an integer"); }
  if (amount < 0n || amount > FINAL_KCC20_MAX_AMOUNT) fail("KCC-20 Final amount is outside 0..2^63-1");
  const owner_scheme = Number(input.owner_scheme), borrow_scheme = Number(input.borrow_scheme);
  if (!Number.isInteger(owner_scheme) || owner_scheme < 0 || owner_scheme > 4) fail("Unsupported KCC-2 owner scheme");
  if (!Number.isInteger(borrow_scheme) || borrow_scheme < 0 || borrow_scheme > 3) fail("Unsupported KCC-20 borrow scheme");
  return { amount, owner: finalHex(input.owner, 32), owner_scheme, borrow_scheme,
    borrow_guard: finalHex(input.borrow_guard, 32), extension_commitment: finalHex(input.extension_commitment, 32) };
}
export function encodeFinalState(input) {
  const state = checkedState(input), amount = Buffer.alloc(8);
  amount.writeBigInt64LE(state.amount);
  return Buffer.concat([
    Buffer.from([8]), amount, Buffer.from([32]), Buffer.from(state.owner, "hex"),
    Buffer.from([1, state.owner_scheme, 1, state.borrow_scheme, 32]),
    Buffer.from(state.borrow_guard, "hex"), Buffer.from([32]), Buffer.from(state.extension_commitment, "hex")
  ]);
}
export function decodeFinalState(bytes) {
  const state = Buffer.from(bytes);
  if (state.length !== FINAL_KCC20_STATE_BYTES || state[0] !== 8 || state[9] !== 32
    || state[42] !== 1 || state[44] !== 1 || state[46] !== 32 || state[79] !== 32) {
    fail("KCC-20 Final requires canonical six-field explicit-push state", "KCC20_FINAL_STATE_ENCODING");
  }
  // Negative values and negative zero must not be interpreted as unsigned funds.
  if (state[8] & 0x80) fail("Negative or negative-zero token amount is not spendable");
  const result = checkedState({ amount: state.readBigInt64LE(1), owner: state.subarray(10, 42).toString("hex"),
    owner_scheme: state[43], borrow_scheme: state[45], borrow_guard: state.subarray(47, 79).toString("hex"),
    extension_commitment: state.subarray(80, 112).toString("hex") });
  if (!encodeFinalState(result).equals(state)) fail("Non-canonical KCC-20 Final state");
  return result;
}
export function decodeFinalTokenProgram(programHex, descriptor) {
  if (descriptor?.protocol !== FINAL_KCC20_PROTOCOL) fail("An explicit kcc20-final protocol descriptor is required");
  const program = Buffer.from(finalHex(programHex), "hex");
  const p = Number(descriptor.prefixLength), s = Number(descriptor.suffixLength);
  if (!Number.isSafeInteger(p) || p < 0 || !Number.isSafeInteger(s) || s < 1
    || program.length !== p + FINAL_KCC20_STATE_BYTES + s) fail("KCC-20 Final state-view lengths do not match the program");
  const prefix = program.subarray(0, p), suffix = program.subarray(p + FINAL_KCC20_STATE_BYTES);
  if (kcc1TemplateHash(prefix, suffix) !== finalHex(descriptor.templateHash, 32)) fail("KCC-1 BLAKE3 template hash mismatch", "KCC20_TEMPLATE_HASH_MISMATCH");
  if (finalHex(descriptor.templateHash, 32) !== FINAL_KCC20_REFERENCE_VIEW_HASH) fail("This Final token implementation is not supported by Kas Will's pinned reference profile", "KCC20_FINAL_TEMPLATE_UNSUPPORTED");
  const state = decodeFinalState(program.subarray(p, p + FINAL_KCC20_STATE_BYTES));
  if (state.amount === 0n) fail("Receiving seeds are not funded inheritance assets");
  if (descriptor.extensionCommitment && state.extension_commitment !== finalHex(descriptor.extensionCommitment, 32)) fail("Token extension commitment differs from the registered fungibility domain", "KCC20_EXTENSION_MISMATCH");
  return { ...state, protocol: FINAL_KCC20_PROTOCOL, prefix, suffix,
    // Compatibility aliases are internal only, never serialized as Final state.
    ownerIdentifier: state.owner, identifierType: state.owner_scheme, isMinter: false };
}
export function encodeFinalTokenProgram(template, owner, owner_scheme, amount) {
  const prefix = template.prefix || Buffer.from(finalHex(template.prefixHex), "hex");
  const suffix = template.suffix || Buffer.from(finalHex(template.suffixHex), "hex");
  const state = { amount, owner, owner_scheme, borrow_scheme: 0, borrow_guard: ZERO32,
    extension_commitment: template.extension_commitment || template.extensionCommitment };
  return Buffer.concat([prefix, encodeFinalState(state), suffix]).toString("hex");
}
export function finalStateArgument(state) {
  const s = checkedState(state);
  return { fields: { amount: { kind: "int", data: String(s.amount) }, owner: { kind: "bytes32", hex: s.owner },
    owner_scheme: { kind: "byte", data: s.owner_scheme }, borrow_scheme: { kind: "byte", data: s.borrow_scheme },
    borrow_guard: { kind: "bytes32", hex: s.borrow_guard }, extension_commitment: { kind: "bytes32", hex: s.extension_commitment } } };
}
