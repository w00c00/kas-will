import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { safeId } from "./security.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const scrypt = promisify(crypto.scrypt);
const VERSION = 1;

function networkOf(id) {
  const network = NETWORKS[id];
  if (!network) throw new Error(`Unsupported network: ${id}`);
  return network;
}

function publicKeyOf(privateKey) {
  return String(privateKey.toKeypair().xOnlyPublicKey);
}

async function encryptionKey(secret, salt) {
  if (String(secret || "").length < 10) throw new Error("Wallet password must contain at least 10 characters");
  return scrypt(String(secret), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

async function encryptPhrase(phrase, secret, walletId) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await encryptionKey(secret, salt);
  try {
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`silverstudio-wallet:${VERSION}:${walletId}`));
    const ciphertext = Buffer.concat([cipher.update(phrase, "utf8"), cipher.final()]);
    return {
      algorithm: "aes-256-gcm+scrypt",
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      ciphertext: ciphertext.toString("hex")
    };
  } finally { key.fill(0); }
}

async function decryptPhrase(record, secret) {
  const salt = Buffer.from(record.encryption.salt, "hex");
  const key = await encryptionKey(secret, salt);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(record.encryption.iv, "hex"));
    decipher.setAAD(Buffer.from(`silverstudio-wallet:${record.version}:${record.id}`));
    decipher.setAuthTag(Buffer.from(record.encryption.tag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(record.encryption.ciphertext, "hex")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw Object.assign(new Error("Wallet password is incorrect or the keystore is damaged"), { status: 401 });
  } finally { key.fill(0); }
}

function derive(phrase, networkId, accountIndex = 0, receiveIndex = 0, paymentSecret = "") {
  const mnemonic = new kaspa.Mnemonic(phrase);
  const seedHex = mnemonic.toSeed(paymentSecret || undefined);
  const seed = Buffer.from(seedHex, "hex");
  let xprv;
  let generator;
  try {
    xprv = new kaspa.XPrv(seedHex);
    generator = new kaspa.PrivateKeyGenerator(xprv, false, BigInt(accountIndex));
    const privateKey = generator.receiveKey(receiveIndex);
    const network = networkOf(networkId);
    return {
      privateKey,
      address: privateKey.toAddress(network.kaspaNetworkId).toString(),
      publicKey: publicKeyOf(privateKey)
    };
  } finally {
    seed.fill(0);
    try { generator?.free(); } catch {}
    try { xprv?.free(); } catch {}
    try { mnemonic.free(); } catch {}
  }
}

export class WalletService {
  constructor(dataDir) {
    this.directory = path.join(dataDir, "wallets");
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  file(id) {
    return path.join(this.directory, `${safeId(id, "wallet id")}.json`);
  }

  read(id) {
    try { return JSON.parse(fs.readFileSync(this.file(id), "utf8")); } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  metadata(record) {
    return {
      id: record.id,
      title: record.title,
      accountIndex: record.accountIndex,
      receiveIndex: record.receiveIndex,
      publicKey: record.publicKey,
      paymentSecretProtected: Boolean(record.paymentSecretProtected),
      createdAt: record.createdAt,
      encryption: record.encryption.algorithm
    };
  }

  list() {
    return fs.readdirSync(this.directory).filter((name) => name.endsWith(".json")).map((name) => {
      try { return this.metadata(JSON.parse(fs.readFileSync(path.join(this.directory, name), "utf8"))); } catch { return null; }
    }).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async create({ title, walletSecret, mnemonic, paymentSecret = "" }) {
    const generated = !String(mnemonic || "").trim();
    const phrase = generated ? kaspa.Mnemonic.random(12).phrase : String(mnemonic).trim().toLowerCase();
    if (!kaspa.Mnemonic.validate(phrase)) throw new Error("Mnemonic must be a valid 12- or 24-word BIP39 phrase");
    const id = safeId(`wallet-${crypto.randomBytes(8).toString("hex")}`, "wallet id");
    const identity = derive(phrase, "tn10", 0, 0, paymentSecret);
    const publicKey = identity.publicKey;
    try { identity.privateKey.free(); } catch {}
    const record = {
      version: VERSION,
      id,
      title: String(title || "Studio Wallet").trim().slice(0, 80) || "Studio Wallet",
      accountIndex: 0,
      receiveIndex: 0,
      paymentSecretProtected: Boolean(paymentSecret),
      publicKey,
      createdAt: new Date().toISOString(),
      encryption: await encryptPhrase(phrase, walletSecret, id)
    };
    fs.writeFileSync(this.file(id), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return { wallet: this.metadata(record), recoveryPhrase: generated ? phrase : undefined };
  }

  async unlock({ walletId, walletSecret, network = "tn10", paymentSecret = "" }) {
    const record = this.read(walletId);
    if (!record) throw Object.assign(new Error("Wallet not found"), { status: 404 });
    const phrase = await decryptPhrase(record, walletSecret);
    let privateKey;
    try {
      const derived = derive(phrase, network, record.accountIndex, record.receiveIndex, paymentSecret);
      privateKey = derived.privateKey;
      if (record.publicKey && derived.publicKey !== record.publicKey) throw Object.assign(new Error("Wallet payment secret is incorrect"), { status: 401 });
      return { ...this.metadata(record), network, address: derived.address, publicKey: derived.publicKey, provider: "Studio encrypted wallet" };
    } finally {
      try { privateKey?.free(); } catch {}
    }
  }

  async signTransaction({ walletId, walletSecret, paymentSecret = "", network = "tn10", transactionSafeJson, expectedAddress }) {
    const record = this.read(walletId);
    if (!record) throw Object.assign(new Error("Wallet not found"), { status: 404 });
    const phrase = await decryptPhrase(record, walletSecret);
    let privateKey;
    try {
      const derived = derive(phrase, network, record.accountIndex, record.receiveIndex, paymentSecret);
      privateKey = derived.privateKey;
      if (record.publicKey && derived.publicKey !== record.publicKey) throw Object.assign(new Error("Wallet payment secret is incorrect"), { status: 401 });
      if (derived.address !== expectedAddress) throw new Error("Selected wallet does not own the deployment input address");
      const transaction = kaspa.Transaction.deserializeFromSafeJSON(String(transactionSafeJson));
      const signed = kaspa.signTransaction(transaction, [privateKey], true);
      return signed.serializeToSafeJSON();
    } finally {
      try { privateKey?.free(); } catch {}
    }
  }

  async createCovenantInputSignature({ walletId, walletSecret, paymentSecret = "", network = "tn10", transactionSafeJson, inputIndex, expectedPublicKey }) {
    const record = this.read(walletId);
    if (!record) throw Object.assign(new Error("Wallet not found"), { status: 404 });
    const phrase = await decryptPhrase(record, walletSecret);
    let privateKey;
    try {
      const derived = derive(phrase, network, record.accountIndex, record.receiveIndex, paymentSecret);
      privateKey = derived.privateKey;
      if (record.publicKey && derived.publicKey !== record.publicKey) throw Object.assign(new Error("Wallet payment secret is incorrect"), { status: 401 });
      if (derived.publicKey !== String(expectedPublicKey || "").toLowerCase()) throw new Error("Selected wallet does not match this covenant signature slot");
      const transaction = kaspa.Transaction.deserializeFromSafeJSON(String(transactionSafeJson));
      if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= transaction.inputs.length) throw new Error("Covenant input index is invalid");
      const encoded = String(kaspa.createInputSignature(transaction, inputIndex, privateKey, 1)).toLowerCase();
      if (/^41[0-9a-f]{130}$/.test(encoded)) return encoded.slice(2);
      if (/^[0-9a-f]{130}$/.test(encoded)) return encoded;
      throw new Error("Kaspa signer returned an invalid covenant input signature");
    } finally {
      try { privateKey?.free(); } catch {}
    }
  }

  async signP2pkInput({ walletId, walletSecret, paymentSecret = "", network = "tn10", transactionSafeJson, inputIndex, expectedAddress }) {
    const record = this.read(walletId);
    if (!record) throw Object.assign(new Error("Wallet not found"), { status: 404 });
    const phrase = await decryptPhrase(record, walletSecret);
    let privateKey;
    try {
      const derived = derive(phrase, network, record.accountIndex, record.receiveIndex, paymentSecret);
      privateKey = derived.privateKey;
      if (record.publicKey && derived.publicKey !== record.publicKey) throw Object.assign(new Error("Wallet payment secret is incorrect"), { status: 401 });
      if (derived.address !== expectedAddress) throw new Error("Selected wallet does not own the P2PK authorization input");
      const transaction = kaspa.Transaction.deserializeFromSafeJSON(String(transactionSafeJson));
      if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= transaction.inputs.length) throw new Error("P2PK authorization input index is invalid");
      const target = transaction.inputs[inputIndex];
      if (!target.utxo || target.utxo.scriptPublicKey.script !== kaspa.payToAddressScript(expectedAddress).script) {
        throw new Error("P2PK authorization input does not belong to the selected wallet");
      }
      const signatureScript = String(kaspa.createInputSignature(transaction, inputIndex, privateKey, 1)).toLowerCase();
      if (!/^41[0-9a-f]{130}$/.test(signatureScript)) throw new Error("Kaspa signer returned an invalid P2PK signature script");
      const inputs = transaction.inputs;
      inputs[inputIndex].signatureScript = signatureScript;
      transaction.inputs = inputs;
      transaction.finalize();
      return transaction.serializeToSafeJSON();
    } finally {
      try { privateKey?.free(); } catch {}
    }
  }
}
