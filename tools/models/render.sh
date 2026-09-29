#!/usr/bin/env sh
# Sculpts the game's people with headless Blender, then compresses them (meshopt) into
# apps/client/public/models (commit the result).
#   npm run models                         # build new/changed characters
#   npm run models -- --only pind,morten   # only some
#   npm run models -- --preview            # also render preview PNGs to tools/models/.cache
set -e
cd "$(dirname "$0")/../.."
OUT=apps/client/public/models
RAW=tools/models/.cache/raw
docker build -q -t western-models tools/models >/dev/null
mkdir -p "$OUT" "$RAW"
docker run --rm \
  -v "$PWD/$RAW:/out" \
  -v "$PWD/tools/models/.cache:/cache" \
  -v "$PWD/tools/models:/app:ro" \
  --user "$(id -u):$(id -g)" \
  western-models --out /out --cache /cache "$@"

for f in "$RAW"/*.glb; do
  dst="$OUT/$(basename "$f")"
  if [ ! -f "$dst" ] || [ "$f" -nt "$dst" ]; then
    npx --no-install gltf-transform meshopt "$f" "$dst" --level medium >/dev/null
    echo "[models] compressed $(basename "$f")"
  fi
done
cp "$RAW/manifest.json" "$OUT/manifest.json"
