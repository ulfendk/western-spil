# syntax=docker/dockerfile:1.7
# Kanel og Grønskollingen — game server + PWA client + Danish narration (Piper TTS)

ARG NODE_VERSION=24
ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_VOICE=da_DK-talesyntese-medium

# ---------- deps: install all workspace dependencies ----------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY tools/tts/package.json tools/tts/
RUN npm ci --no-audit --no-fund

# ---------- build: client (PWA) + server bundle ----------
FROM deps AS build
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY . .
RUN npm run build

# ---------- runtime-base: node + piper + danish voice + lame ----------
FROM node:${NODE_VERSION}-slim AS runtime-base
ARG PIPER_VERSION
ARG PIPER_VOICE
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl lame \
 && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) PIPER_ARCH=x86_64 ;; \
      arm64) PIPER_ARCH=aarch64 ;; \
      *) echo "unsupported arch ${TARGETARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_${PIPER_ARCH}.tar.gz" \
      | tar -xz -C /opt; \
    mkdir -p /opt/piper/voices; \
    base="https://huggingface.co/rhasspy/piper-voices/resolve/main/da/da_DK/talesyntese/medium"; \
    curl -fsSL -o "/opt/piper/voices/${PIPER_VOICE}.onnx" "${base}/${PIPER_VOICE}.onnx"; \
    curl -fsSL -o "/opt/piper/voices/${PIPER_VOICE}.onnx.json" "${base}/${PIPER_VOICE}.onnx.json"; \
    echo "Hej" | /opt/piper/piper --model "/opt/piper/voices/${PIPER_VOICE}.onnx" --output_file /tmp/t.wav; \
    rm /tmp/t.wav
ENV PIPER_BIN=/opt/piper/piper \
    PIPER_VOICE=/opt/piper/voices/${PIPER_VOICE}.onnx

# ---------- narration: pre-render all dialogue lines ----------
# Only depends on dialogue content + the renderer, so it stays cached unless the story changes.
FROM runtime-base AS narration
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared packages/shared
COPY tools/tts tools/tts
COPY content content
RUN OUT_DIR=/narration node_modules/.bin/tsx tools/tts/src/render.ts

# ---------- runtime ----------
FROM runtime-base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=2567 \
    DATA_DIR=/data \
    CLIENT_DIR=/app/client \
    NARRATION_DIR=/app/narration
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY tools/tts/package.json tools/tts/
RUN npm ci --omit=dev --no-audit --no-fund --workspace @western/server --include-workspace-root=false \
 && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/client/dist client
COPY --from=narration /narration narration
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
RUN mkdir -p /data && chown node:node /data
USER node
# Saves (SQLite), nightly backups and the runtime TTS cache live here. Mount a volume!
VOLUME ["/data"]
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:2567/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
