#!/usr/bin/env sh
# Renders narration with Røst-v3 into content/narration (commit the result).
# The ~3 GB model is cached in the "western-voice-models" Docker volume.
set -e
cd "$(dirname "$0")/../.."
docker build -q -t western-voice tools/voice >/dev/null
exec docker run --rm \
  -v "$PWD/content:/content" \
  -v western-voice-models:/models \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  western-voice --content /content "$@"
