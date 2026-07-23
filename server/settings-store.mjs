import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const VERSION = 1;
const PROVIDER_IDS = new Set(["openai", "anthropic", "gemini", "openrouter", "ollama", "compatible"]);
const AUTO_LOCK_MINUTES = new Set([5, 15, 30, 60]);

function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function secretKey(secret, salt) {
  if (String(secret || "").length < 10) throw new Error("Vault password must contain at least 10 characters");
  return scrypt(String(secret), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function text(value, max) {
  return String(value || "").trim().slice(0, max);
}

function safeBaseUrl(value, required = false) {
  const raw = text(value, 500).replace(/\/$/, "");
  if (!raw && !required) return "";
  let url;
  try { url = new URL(raw); } catch { throw new Error("AI base URL is invalid"); }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("AI base URL must use HTTPS; HTTP is allowed only for a local provider");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function safeRpcUrl(value) {
  const raw = text(value, 500);
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { throw new Error("Kaspa wRPC URL is invalid"); }
  if (!["ws:", "wss:"].includes(url.protocol)) throw new Error("Kaspa node must use a ws:// or wss:// wRPC URL");
  if (url.username || url.password) throw new Error("Credentials must not be embedded in the Kaspa node URL");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export class AppSettingsStore {
  constructor(dataDir) {
    this.directory = path.join(dataDir, "settings");
    this.file = path.join(this.directory, "app.json");
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.value = this.read();
  }

  defaults() {
    return { defaultNetwork: "tn10", defaultWalletId: "", aiAutoLockMinutes: 15, tn10RpcUrl: "", mainnetRpcUrl: "" };
  }

  read() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return {
        defaultNetwork: ["tn10", "mainnet"].includes(stored.defaultNetwork) ? stored.defaultNetwork : "tn10",
        defaultWalletId: typeof stored.defaultWalletId === "string" ? stored.defaultWalletId.slice(0, 64) : "",
        aiAutoLockMinutes: AUTO_LOCK_MINUTES.has(Number(stored.aiAutoLockMinutes)) ? Number(stored.aiAutoLockMinutes) : 15,
        tn10RpcUrl: safeRpcUrl(stored.tn10RpcUrl),
        mainnetRpcUrl: safeRpcUrl(stored.mainnetRpcUrl),
        ...(typeof stored.updatedAt === "string" ? { updatedAt: stored.updatedAt } : {})
      };
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      return this.defaults();
    }
  }

  public() { return { ...this.value }; }

  save(input = {}) {
    const next = { ...this.value };
    if (input.defaultNetwork !== undefined) {
      if (!["tn10", "mainnet"].includes(input.defaultNetwork)) throw new Error("Unsupported default network");
      next.defaultNetwork = input.defaultNetwork;
    }
    if (input.defaultWalletId !== undefined) next.defaultWalletId = text(input.defaultWalletId, 64);
    if (input.tn10RpcUrl !== undefined) next.tn10RpcUrl = safeRpcUrl(input.tn10RpcUrl);
    if (input.mainnetRpcUrl !== undefined) next.mainnetRpcUrl = safeRpcUrl(input.mainnetRpcUrl);
    if (input.aiAutoLockMinutes !== undefined) {
      const minutes = Number(input.aiAutoLockMinutes);
      if (!AUTO_LOCK_MINUTES.has(minutes)) throw new Error("Unsupported AI vault auto-lock interval");
      next.aiAutoLockMinutes = minutes;
    }
    next.updatedAt = new Date().toISOString();
    atomicWrite(this.file, next);
    this.value = next;
    return this.public();
  }
}

export class AiSettingsStore {
  constructor(dataDir, environmentProviders, getAutoLockMinutes = () => 15) {
    this.directory = path.join(dataDir, "settings");
    this.file = path.join(this.directory, "ai-vault.json");
    this.environmentProviders = environmentProviders;
    this.getAutoLockMinutes = getAutoLockMinutes;
    this.unlockedProviders = null;
    this.timer = null;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  record() {
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async encrypt(providers, vaultSecret) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = await secretKey(vaultSecret, salt);
    try {
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`silverstudio-ai-vault:${VERSION}`));
      const plaintext = Buffer.from(JSON.stringify({ providers }), "utf8");
      try {
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return {
          version: VERSION,
          providerIds: Object.keys(providers),
          metadata: Object.fromEntries(Object.entries(providers).map(([id, provider]) => [id, { model: provider.model || "", baseUrl: provider.baseUrl || "" }])),
          updatedAt: new Date().toISOString(),
          encryption: {
            algorithm: "aes-256-gcm+scrypt",
            salt: salt.toString("hex"), iv: iv.toString("hex"),
            tag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("hex")
          }
        };
      } finally { plaintext.fill(0); }
    } finally { key.fill(0); }
  }

  async decrypt(record, vaultSecret) {
    const key = await secretKey(vaultSecret, Buffer.from(record.encryption.salt, "hex"));
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(record.encryption.iv, "hex"));
      decipher.setAAD(Buffer.from(`silverstudio-ai-vault:${record.version}`));
      decipher.setAuthTag(Buffer.from(record.encryption.tag, "hex"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(record.encryption.ciphertext, "hex")), decipher.final()
      ]);
      try { return JSON.parse(plaintext.toString("utf8")).providers || {}; }
      finally { plaintext.fill(0); }
    } catch {
      throw Object.assign(new Error("AI vault password is incorrect or the vault is damaged"), { status: 401 });
    } finally { key.fill(0); }
  }

  touch() {
    clearTimeout(this.timer);
    if (!this.unlockedProviders) return;
    this.timer = setTimeout(() => this.lock(), Number(this.getAutoLockMinutes()) * 60_000);
    this.timer.unref?.();
  }

  lock() {
    if (this.unlockedProviders) {
      for (const provider of Object.values(this.unlockedProviders)) provider.apiKey = "";
    }
    this.unlockedProviders = null;
    clearTimeout(this.timer);
    this.timer = null;
  }

  async unlock(vaultSecret) {
    const record = this.record();
    if (!record) throw Object.assign(new Error("AI vault has not been created"), { status: 404 });
    this.unlockedProviders = await this.decrypt(record, vaultSecret);
    this.touch();
    return this.publicStatus();
  }

  validateProvider(id, input, previous = {}) {
    if (!PROVIDER_IDS.has(id)) throw new Error(`Unsupported AI provider: ${id}`);
    const model = text(input.model, 200);
    if (!model) throw new Error("AI model is required");
    const needsBaseUrl = id === "compatible" || id === "ollama";
    const baseUrl = needsBaseUrl ? safeBaseUrl(input.baseUrl, true) : "";
    let apiKey = input.clearApiKey ? "" : text(input.apiKey, 4096) || previous.apiKey || "";
    if (id !== "ollama" && !apiKey) throw new Error("API key is required");
    if (id === "ollama") apiKey = "";
    return { model, baseUrl, apiKey };
  }

  async save(input = {}) {
    const vaultSecret = String(input.vaultSecret || "");
    const record = this.record();
    const providers = record ? await this.decrypt(record, vaultSecret) : {};
    const id = String(input.providerId || "").toLowerCase();
    providers[id] = this.validateProvider(id, input, providers[id]);
    const encrypted = await this.encrypt(providers, vaultSecret);
    atomicWrite(this.file, encrypted);
    this.unlockedProviders = providers;
    this.touch();
    return this.publicStatus();
  }

  async remove(input = {}) {
    const vaultSecret = String(input.vaultSecret || "");
    const record = this.record();
    if (!record) return this.publicStatus();
    const providers = await this.decrypt(record, vaultSecret);
    const id = String(input.providerId || "").toLowerCase();
    if (!PROVIDER_IDS.has(id)) throw new Error(`Unsupported AI provider: ${id}`);
    delete providers[id];
    const encrypted = await this.encrypt(providers, vaultSecret);
    atomicWrite(this.file, encrypted);
    this.unlockedProviders = providers;
    this.touch();
    return this.publicStatus();
  }

  envConfigured(id, provider) {
    return id === "ollama" || Boolean(provider.apiKey && provider.model && (id !== "compatible" || provider.baseUrl));
  }

  publicStatus() {
    const record = this.record();
    const stored = new Set(record?.providerIds || []);
    const metadata = record?.metadata || {};
    const locked = Boolean(record) && !this.unlockedProviders;
    const providers = Object.fromEntries(Object.entries(this.environmentProviders).map(([id, env]) => {
      const local = this.unlockedProviders?.[id];
      const effective = local || env;
      const available = Boolean(local) || this.envConfigured(id, env);
      return [id, {
        id,
        configured: available,
        stored: stored.has(id),
        source: local ? "vault" : this.envConfigured(id, env) ? "environment" : "none",
        defaultModel: local?.model || metadata[id]?.model || env.model || "",
        baseUrl: local?.baseUrl || metadata[id]?.baseUrl || env.baseUrl || "",
        local: id === "ollama"
      }];
    }));
    return { exists: Boolean(record), locked, autoLockMinutes: Number(this.getAutoLockMinutes()), providers };
  }

  provider(id) {
    const providerId = String(id || "openai").toLowerCase();
    if (!PROVIDER_IDS.has(providerId)) throw new Error(`Unsupported AI provider: ${providerId}`);
    const local = this.unlockedProviders?.[providerId];
    if (local) { this.touch(); return { ...local }; }
    const env = this.environmentProviders[providerId];
    if (this.record()?.providerIds?.includes(providerId) && !this.envConfigured(providerId, env)) {
      throw Object.assign(new Error("AI vault is locked. Unlock it in Settings before using this provider"), { status: 423 });
    }
    return { ...env };
  }
}
