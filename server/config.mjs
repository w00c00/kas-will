import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true });

export const SILVERSCRIPT_COMMIT = "2a3961cadc76bb16a425042172ffe32481da89b5";

export const NETWORKS = Object.freeze({
  tn10: Object.freeze({
    id: "tn10",
    kaspaNetworkId: "testnet-10",
    kascovNetworkId: "testnet-10",
    prefix: "kaspatest",
    symbol: "TKAS",
    daaPerSecond: 10,
    labelZh: "Kaspa 测试网 TN10",
    labelEn: "Kaspa Testnet 10"
  }),
  mainnet: Object.freeze({
    id: "mainnet",
    kaspaNetworkId: "mainnet",
    kascovNetworkId: "mainnet",
    prefix: "kaspa",
    symbol: "KAS",
    daaPerSecond: 10,
    labelZh: "Kaspa 主网",
    labelEn: "Kaspa Mainnet"
  })
});

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function loadCompilerConfig() {
  const file = path.join(ROOT, "config", "compiler.json");
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  return {
    bin: process.env.SILVERC_BIN || stored.bin || path.join(ROOT, "bin", "silverc"),
    sha256: String(process.env.SILVERC_SHA256 || stored.sha256 || "").toLowerCase(),
    upstreamCommit: stored.upstreamCommit || SILVERSCRIPT_COMMIT,
    manifestFile: file
  };
}

function loadPreflightConfig() {
  const file = path.join(ROOT, "config", "kascov-preflight.json");
  const localFile = path.join(ROOT, "config", "kascov-preflight.local.json");
  let stored = {};
  let local = {};
  try { stored = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  try { local = JSON.parse(fs.readFileSync(localFile, "utf8")); } catch {}
  return {
    bin: path.resolve(process.env.KASCOV_PREFLIGHT_BIN || path.join(ROOT, local.binary || stored.binary || "bin/kascov-preflight")),
    sha256: String(process.env.KASCOV_PREFLIGHT_SHA256 || local.sha256 || "").toLowerCase(),
    upstreamCommit: stored.upstreamCommit || "",
    rustyKaspaCommit: stored.rustyKaspaCommit || "",
    manifestFile: file,
    localManifestFile: localFile
  };
}

function binaryMatches(file, expectedSha256) {
  if (!fs.existsSync(file) || !/^[0-9a-f]{64}$/.test(expectedSha256)) return false;
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === expectedSha256;
  } catch {
    return false;
  }
}

export const config = Object.freeze({
  root: ROOT,
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4310),
  dataDir: path.resolve(process.env.STUDIO_DATA_DIR || path.join(ROOT, "data")),
  kascovBaseUrl: String(process.env.KASCOV_BASE_URL || "https://kascov.io").replace(/\/$/, ""),
  preflightEngine: Object.freeze(loadPreflightConfig()),
  rpcUrls: Object.freeze({
    tn10: String(process.env.KASPA_TN10_RPC_URL || "").trim(),
    mainnet: String(process.env.KASPA_MAINNET_RPC_URL || "").trim()
  }),
  allowMainnet: bool(process.env.ALLOW_MAINNET),
  mainnetMaxDeployKas: String(process.env.MAINNET_MAX_DEPLOY_KAS || "1"),
  compiler: loadCompilerConfig(),
  providers: Object.freeze({
    openai: { model: process.env.OPENAI_MODEL || "gpt-5.6-sol", apiKey: process.env.OPENAI_API_KEY || "" },
    anthropic: { model: process.env.ANTHROPIC_MODEL || "", apiKey: process.env.ANTHROPIC_API_KEY || "" },
    gemini: { model: process.env.GEMINI_MODEL || "gemini-3.5-flash", apiKey: process.env.GEMINI_API_KEY || "" },
    openrouter: { model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest", apiKey: process.env.OPENROUTER_API_KEY || "" },
    ollama: { model: process.env.OLLAMA_MODEL || "qwen3-coder", baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434" },
    compatible: {
      model: process.env.COMPATIBLE_MODEL || "",
      apiKey: process.env.COMPATIBLE_API_KEY || "",
      baseUrl: process.env.COMPATIBLE_BASE_URL || ""
    }
  })
});

export function publicConfig() {
  const localPreflightReady = binaryMatches(config.preflightEngine.bin, config.preflightEngine.sha256);
  const providers = Object.fromEntries(Object.entries(config.providers).map(([id, provider]) => [id, {
    id,
    configured: id === "ollama" || Boolean(
      provider.apiKey
      && provider.model
      && (id !== "compatible" || provider.baseUrl)
    ),
    defaultModel: provider.model,
    local: id === "ollama"
  }]));
  return {
    networks: NETWORKS,
    defaultNetwork: "tn10",
    allowMainnet: config.allowMainnet,
    mainnetMaxDeployKas: config.mainnetMaxDeployKas,
    nodeAccess: {
      customTn10Configured: Boolean(config.rpcUrls.tn10),
      customMainnetConfigured: Boolean(config.rpcUrls.mainnet),
      resolverFallback: true
    },
    preflight: {
      localEngineConfigured: localPreflightReady,
      kascovPreferred: true,
      offlineCapable: localPreflightReady,
      upstreamCommit: config.preflightEngine.upstreamCommit,
      rustyKaspaCommit: config.preflightEngine.rustyKaspaCommit
    },
    providers,
    compiler: {
      configured: fs.existsSync(config.compiler.bin) && /^[0-9a-f]{64}$/.test(config.compiler.sha256),
      upstreamCommit: config.compiler.upstreamCommit,
      expectedCommit: SILVERSCRIPT_COMMIT
    },
    silverscriptStatus: "experimental",
    recommendedNetwork: "testnet-10"
  };
}
