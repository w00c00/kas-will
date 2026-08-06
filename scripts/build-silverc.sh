#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
latest_commit="4b0e1cd69739934f92c3ac4df1bb13d912418b2b"
legacy_commit="2a3961cadc76bb16a425042172ffe32481da89b5"
work="$(mktemp -d "${TMPDIR:-/tmp}/silverstudio-silverc.XXXXXX")"
mkdir -p "$root/bin" "$root/config"

build_profile() {
  local id="$1"
  local commit="$2"
  local output="$3"
  local configured_source="$4"
  local repo="$work/$id"
  local target="$work/target-$id"
  if [[ -n "$configured_source" ]]; then
    repo="$(cd "$configured_source" && pwd)"
    local actual
    actual="$(git -C "$repo" rev-parse HEAD)"
    if [[ "$actual" != "$commit" ]]; then
      printf 'local SilverScript source for %s is at %s, expected %s\n' "$id" "$actual" "$commit" >&2
      exit 1
    fi
  else
    git clone --filter=blob:none --no-checkout https://github.com/kaspanet/silverscript.git "$repo"
    git -C "$repo" checkout --detach "$commit"
  fi
  CARGO_TARGET_DIR="$target" cargo build --manifest-path "$repo/Cargo.toml" -p silverscript-lang --bin silverc --release
  install -m 0755 "$target/release/silverc" "$root/bin/$output"
}

build_profile "latest-4b0e1cd" "$latest_commit" "silverc-latest" "${SILVERSCRIPT_LATEST_SOURCE:-${SILVERSCRIPT_SOURCE:-}}"
build_profile "legacy-2a3961c" "$legacy_commit" "silverc-legacy" "${SILVERSCRIPT_LEGACY_SOURCE:-}"

latest_sha="$(shasum -a 256 "$root/bin/silverc-latest" | awk '{print $1}')"
legacy_sha="$(shasum -a 256 "$root/bin/silverc-legacy" | awk '{print $1}')"
node - "$root" "$latest_commit" "$latest_sha" "$legacy_commit" "$legacy_sha" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [root, latestCommit, latestSha256, legacyCommit, legacySha256] = process.argv.slice(2);
fs.writeFileSync(path.join(root, "config", "compiler.json"), `${JSON.stringify({
  defaultProfileId: "latest-4b0e1cd",
  profiles: {
    "latest-4b0e1cd": {
      bin: path.join(root, "bin", "silverc-latest"),
      sha256: latestSha256,
      upstreamCommit: latestCommit,
      builtAt: new Date().toISOString()
    },
    "legacy-2a3961c": {
      bin: path.join(root, "bin", "silverc-legacy"),
      sha256: legacySha256,
      upstreamCommit: legacyCommit,
      builtAt: new Date().toISOString()
    }
  }
}, null, 2)}\n`, { mode: 0o600 });
NODE

"$root/bin/silverc-latest" --help >/dev/null
"$root/bin/silverc-legacy" --help >/dev/null
printf 'latest silverc commit: %s\n' "$latest_commit"
printf 'latest silverc sha256: %s\n' "$latest_sha"
printf 'legacy silverc commit: %s\n' "$legacy_commit"
printf 'legacy silverc sha256: %s\n' "$legacy_sha"
printf 'manifest: %s\n' "$root/config/compiler.json"
