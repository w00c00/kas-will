#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
commit="2a3961cadc76bb16a425042172ffe32481da89b5"
work="$(mktemp -d "${TMPDIR:-/tmp}/silverstudio-silverc.XXXXXX")"
repo="$work/silverscript"
target="$work/target"

if [[ -n "${SILVERSCRIPT_SOURCE:-}" ]]; then
  repo="$(cd "$SILVERSCRIPT_SOURCE" && pwd)"
  actual="$(git -C "$repo" rev-parse HEAD)"
  if [[ "$actual" != "$commit" ]]; then
    printf 'local SilverScript source is at %s, expected %s\n' "$actual" "$commit" >&2
    exit 1
  fi
else
  git clone --filter=blob:none --no-checkout https://github.com/kaspanet/silverscript.git "$repo"
  git -C "$repo" checkout --detach "$commit"
fi
CARGO_TARGET_DIR="$target" cargo build --manifest-path "$repo/Cargo.toml" -p silverscript-lang --bin silverc --release

mkdir -p "$root/bin" "$root/config"
install -m 0755 "$target/release/silverc" "$root/bin/silverc"
sha="$(shasum -a 256 "$root/bin/silverc" | awk '{print $1}')"
node - "$root" "$commit" "$sha" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [root, upstreamCommit, sha256] = process.argv.slice(2);
fs.writeFileSync(path.join(root, "config", "compiler.json"), `${JSON.stringify({
  bin: path.join(root, "bin", "silverc"),
  sha256,
  upstreamCommit,
  builtAt: new Date().toISOString()
}, null, 2)}\n`, { mode: 0o600 });
NODE

"$root/bin/silverc" --help >/dev/null
printf 'silverc commit: %s\n' "$commit"
printf 'silverc sha256: %s\n' "$sha"
printf 'manifest: %s\n' "$root/config/compiler.json"
