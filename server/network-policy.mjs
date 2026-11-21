import { config, NETWORKS } from "./config.mjs";

export function requireNetwork(id, { spend = false, legacy = false } = {}) {
  const network = NETWORKS[id];
  if (!network) throw Object.assign(new Error("Unsupported network"), { status: 400, code: "WRONG_NETWORK" });
  if (network.id === "mainnet" && legacy) throw Object.assign(new Error("Legacy four-field KCC20 is restricted to TN10"), { status: 400, code: "LEGACY_TOKEN_MAINNET_DISABLED" });
  if (network.id === "mainnet" && spend && !config.allowMainnet) throw Object.assign(new Error("Mainnet operations are disabled by ALLOW_MAINNET=false"), { status: 403, code: "MAINNET_DISABLED" });
  return network;
}
