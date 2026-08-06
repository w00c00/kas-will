const MAX_METADATA_BYTES = 64 * 1024;

function metadataError(message) {
  throw new Error(message);
}

function cleanText(value, label, maximum, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) metadataError(`${label} is required`);
  if (text.length > maximum) metadataError(`${label} exceeds ${maximum} characters`);
  return text;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

export function canonicalKcc721Metadata(value) {
  const input = typeof value === "string" ? JSON.parse(value) : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) metadataError("KCC721 metadata must be an object");
  const name = cleanText(input.name, "NFT name", 120, true);
  const description = cleanText(input.description, "NFT description", 2_000);
  const image = cleanText(input.image, "NFT image URI", 2_048);
  const externalUrl = cleanText(input.externalUrl ?? input.external_url, "NFT external URL", 2_048);
  let attributes = input.attributes ?? [];
  if (typeof attributes === "string") {
    const source = attributes.trim();
    attributes = source ? JSON.parse(source) : [];
  }
  if (!Array.isArray(attributes) || attributes.length > 100) metadataError("NFT attributes must be an array with at most 100 entries");
  attributes = attributes.map((attribute, index) => {
    if (!attribute || typeof attribute !== "object" || Array.isArray(attribute)) metadataError(`NFT attribute ${index + 1} must be an object`);
    const traitType = cleanText(attribute.trait_type ?? attribute.traitType, `NFT attribute ${index + 1} trait_type`, 120, true);
    const rawValue = attribute.value;
    if (!["string", "number", "boolean"].includes(typeof rawValue)) metadataError(`NFT attribute ${index + 1} value must be text, number, or boolean`);
    if (typeof rawValue === "string" && rawValue.length > 500) metadataError(`NFT attribute ${index + 1} value exceeds 500 characters`);
    return { trait_type: traitType, value: rawValue };
  });
  const metadata = {
    name,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(externalUrl ? { external_url: externalUrl } : {}),
    ...(attributes.length ? { attributes } : {})
  };
  const canonicalJson = JSON.stringify(stable(metadata));
  if (new TextEncoder().encode(canonicalJson).byteLength > MAX_METADATA_BYTES) metadataError("KCC721 metadata exceeds 64 KiB");
  return { metadata, canonicalJson };
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function kcc721MetadataDigest(value) {
  const canonical = canonicalKcc721Metadata(value);
  return { ...canonical, digest: await sha256Hex(canonical.canonicalJson) };
}
