#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KASCOV_REPOSITORY="${KASCOV_REPOSITORY:-https://github.com/Knitser/kascov.git}"
KASCOV_COMMIT="${KASCOV_COMMIT:-b64d6b4114df324f899783080371f26b619b19d0}"
WORK="${KASCOV_BUILD_DIR:-$ROOT/.build/kascov-$KASCOV_COMMIT}"
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/.build/kascov-target}"
OUTPUT="$ROOT/bin/kascov-preflight"

if [ ! -d "$WORK/.git" ]; then
  rm -rf "$WORK"
  mkdir -p "$(dirname "$WORK")"
  git clone --filter=blob:none --no-checkout "$KASCOV_REPOSITORY" "$WORK"
fi

git -C "$WORK" fetch --depth 1 origin "$KASCOV_COMMIT"
git -C "$WORK" checkout --detach --force "$KASCOV_COMMIT"
mkdir -p "$WORK/crates/kascov/src/bin"
cp "$ROOT/native/kascov-preflight-main.rs" "$WORK/crates/kascov/src/bin/kascov-preflight.rs"

CARGO_TARGET_DIR="$TARGET_DIR" cargo build \
  --manifest-path "$WORK/Cargo.toml" \
  --locked \
  --release \
  -p kascov \
  --bin kascov-preflight

cp "$TARGET_DIR/release/kascov-preflight" "$OUTPUT"
chmod 755 "$OUTPUT"
node "$ROOT/scripts/write-kascov-preflight-manifest.mjs"
