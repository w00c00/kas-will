import { config, NETWORKS } from "./config.mjs";

function tokenId(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw Object.assign(new Error("KCC20 Covenant ID must contain exactly 64 hexadecimal characters"), { status: 400 });
  }
  return normalized;
}

function metadataText(value, maximum = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximum);
}

export async function fetchKascovTokenMetadata(networkId, covenantId, fetchImpl = globalThis.fetch) {
  const network = NETWORKS[networkId];
  if (!network) throw Object.assign(new Error(`Unsupported network: ${networkId}`), { status: 400 });
  const id = tokenId(covenantId);
  const endpoint = `${config.kascovBaseUrl}/data/${network.kascovNetworkId}/token/${id}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(endpoint, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (response.status === 404) {
      return { found: false, network: network.id, covenantId: id, source: "kascov", endpoint };
    }
    if (!response.ok) throw Object.assign(new Error(`Kascov token lookup failed with HTTP ${response.status}`), { status: 502 });
    const payload = await response.json();
    const token = payload?.token;
    if (!token || String(token.covenant_id || "").toLowerCase() !== id) {
      throw Object.assign(new Error("Kascov returned token metadata for a different Covenant ID"), { status: 502 });
    }
    const validation = payload?.validation || {};
    return {
      found: true,
      network: network.id,
      covenantId: id,
      name: metadataText(token.name),
      ticker: metadataText(token.fields?.tick || token.fields?.ticker || token.ticker, 32),
      template: metadataText(token.template),
      status: metadataText(token.status, 40),
      validationStatus: metadataText(validation.status || token.status, 40),
      validationReason: metadataText(validation.reason, 240),
      supply: token.supply == null ? null : String(token.supply),
      holders: Number.isSafeInteger(Number(token.holders)) ? Number(token.holders) : null,
      source: "kascov",
      advisoryOnly: true,
      endpoint,
      explorerUrl: `${config.kascovBaseUrl}/#/${network.kascovNetworkId}/token/${id}`
    };
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("Kascov token lookup timed out"), { status: 504 });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

