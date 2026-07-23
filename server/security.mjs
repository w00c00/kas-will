import crypto from "node:crypto";

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomId(prefix = "id") {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

export function transactionCommitment(transactionJson) {
  const value = typeof transactionJson === "string" ? JSON.parse(transactionJson) : structuredClone(transactionJson);
  return sha256(JSON.stringify(stable({
    version: value.version,
    inputs: (value.inputs || []).map(({ signatureScript: _signatureScript, ...input }) => input),
    outputs: value.outputs || [],
    subnetworkId: value.subnetworkId,
    lockTime: value.lockTime,
    gas: value.gas,
    storageMass: value.storageMass,
    payload: value.payload
  })));
}

export function safeId(value, label = "id") {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error(`${label} must contain 3-64 lowercase letters, digits, or hyphens`);
  return id;
}

export function boundedText(value, label, max = 200_000) {
  const text = String(value || "");
  if (!text.trim()) throw new Error(`${label} is required`);
  if (Buffer.byteLength(text, "utf8") > max) throw new Error(`${label} exceeds ${max} bytes`);
  return text;
}

export function requireLocalOrigin(req, _res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    const url = new URL(origin);
    if (["127.0.0.1", "localhost", "::1", "tauri.localhost"].includes(url.hostname)) return next();
    if (url.protocol === "tauri:") return next();
  } catch {}
  const error = new Error("Only local browser origins are allowed");
  error.status = 403;
  next(error);
}

export function localCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    try {
      const url = new URL(origin);
      if (["127.0.0.1", "localhost", "::1", "tauri.localhost"].includes(url.hostname) || url.protocol === "tauri:") {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "Origin");
        res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
        res.setHeader("access-control-allow-headers", "content-type,x-studio-token");
        if (req.method === "OPTIONS") return res.status(204).end();
      }
    } catch {}
  }
  next();
}
