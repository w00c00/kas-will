function stateError(message, code = "COVENANT_STATE_INVALID", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function hex64(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(text) ? text : "";
}

function normalizedCandidate(raw) {
  const entry = raw?.entry || raw?.utxoEntry || raw?.utxo || raw;
  const outpoint = raw?.outpoint || entry?.outpoint || {};
  const scriptPublicKey = raw?.scriptPublicKey || entry?.scriptPublicKey || {};
  return {
    raw,
    entry,
    outpoint: {
      transactionId: hex64(outpoint.transactionId || raw?.transactionId),
      index: Number(outpoint.index ?? raw?.index ?? -1)
    },
    covenantId: hex64(entry?.covenantId || raw?.covenantId),
    script: String(scriptPublicKey.script || scriptPublicKey.scriptPublicKey || "").replace(/^0x/, "").toLowerCase(),
    amount: BigInt(entry?.amount ?? raw?.amount ?? 0),
    isCoinbase: Boolean(entry?.isCoinbase ?? raw?.isCoinbase)
  };
}

export function verifyCovenantStateCandidate(raw, request = {}) {
  const candidate = normalizedCandidate(raw);
  if (!candidate.outpoint.transactionId || !Number.isSafeInteger(candidate.outpoint.index) || candidate.outpoint.index < 0) {
    throw stateError("Covenant state candidate has an invalid outpoint");
  }
  if (!candidate.covenantId) throw stateError("Covenant state candidate has no covenant ID");
  if (!candidate.script) throw stateError("Covenant state candidate has no script public key");
  if (candidate.amount <= 0n) throw stateError("Covenant state candidate has no positive sompi value");
  const expectedId = hex64(request.covenantId);
  if (request.covenantId && !expectedId) throw stateError("Expected covenant ID must be 32-byte hexadecimal data");
  if (expectedId && candidate.covenantId !== expectedId) throw stateError("Covenant state candidate has the wrong covenant ID", "COVENANT_ID_MISMATCH");
  const expectedScript = String(request.script || "").replace(/^0x/, "").toLowerCase();
  if (expectedScript && candidate.script !== expectedScript) throw stateError("Covenant state candidate has the wrong script", "COVENANT_SCRIPT_MISMATCH");
  const expectedTxid = hex64(request.outpoint?.transactionId);
  if (request.outpoint?.transactionId && !expectedTxid) throw stateError("Expected covenant outpoint transaction ID is invalid");
  if (expectedTxid && (candidate.outpoint.transactionId !== expectedTxid || candidate.outpoint.index !== Number(request.outpoint.index))) {
    throw stateError("Covenant state candidate has the wrong outpoint", "COVENANT_OUTPOINT_MISMATCH");
  }
  return candidate;
}

export class CovenantStateSource {
  constructor(providers = []) {
    this.providers = providers.filter((provider) => provider && typeof provider.query === "function");
  }

  async resolve(request = {}) {
    const attempts = [];
    for (const provider of this.providers) {
      if (typeof provider.supports === "function" && !provider.supports(request)) continue;
      let candidates;
      try {
        candidates = await provider.query(request);
      } catch (error) {
        attempts.push({ provider: provider.id, error: String(error.message || error) });
        continue;
      }
      const verified = [];
      for (const raw of Array.isArray(candidates) ? candidates : []) {
        try { verified.push(verifyCovenantStateCandidate(raw, request)); }
        catch (error) { attempts.push({ provider: provider.id, rejected: error.code, error: error.message }); }
      }
      const unique = new Map(verified.map((candidate) => [`${candidate.outpoint.transactionId}:${candidate.outpoint.index}`, candidate]));
      if (unique.size > 1) {
        throw stateError("Multiple verified unspent outputs match this covenant state request", "AMBIGUOUS_COVENANT_UTXO", 409);
      }
      if (unique.size === 1) {
        const candidate = [...unique.values()][0];
        return {
          entry: candidate.raw,
          covenantId: candidate.covenantId,
          outpoint: candidate.outpoint,
          amountSompi: candidate.amount.toString(),
          provider: provider.id,
          verified: true,
          attempts
        };
      }
      attempts.push({ provider: provider.id, result: "no-match" });
    }
    throw Object.assign(new Error("The covenant output is not unspent or is not visible through the configured state sources"), {
      status: 404,
      code: "COVENANT_UTXO_NOT_FOUND",
      attempts
    });
  }
}

export function covenantStateProvider(id, query, supports = null) {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(id || ""))) throw stateError("Covenant state provider ID is invalid");
  if (typeof query !== "function") throw stateError("Covenant state provider query must be a function");
  return Object.freeze({ id, query, ...(typeof supports === "function" ? { supports } : {}) });
}
