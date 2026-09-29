# Headless Blender that sculpts the game's people (tools/models/build.py).
# Ubuntu's blender package exists for both amd64 and arm64 (official builds are x64 only).
#
#   npm run models            (see tools/models/render.sh)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends blender python3 python3-numpy python3-skimage \
 && rm -rf /var/lib/apt/lists/*

ENV HOME=/tmp PYTHONUNBUFFERED=1
WORKDIR /app
ENTRYPOINT ["blender", "--background", "--factory-startup", "--python", "build.py", "--"]
