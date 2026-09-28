# Kanel og Grønskollingen 🤠🐴

A Danish first-person Wild West adventure for kids aged 8–12, in a comic-book style.

- **The journey:** the player travels from St. Louis to Promontory in 1869, together with Kanel, the cleverest horse on the prairie.
- **Narration:** all story text is read aloud in Danish (Piper TTS).
- **Multiplayer:** frontier towns are shared meeting places.
- **Delivery:** it runs as a PWA from one self-hosted Docker image.

## Structure

| Path              | What                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `packages/shared` | Protocol, dialogue format, saves and backups, rejsekode (shared by client and server)       |
| `apps/client`     | Three.js + Vite + PWA (service worker with safe-point auto-update)                          |
| `apps/server`     | Colyseus (town rooms) + Express (static files, `/api/saves`, `/api/tts`), SQLite in `/data` |
| `tools/tts`       | Renders `content/story/*.yaml` to MP3 with Piper                                            |
| `content/story`   | Dialogue scripts (Danish)                                                                   |

## Development

```sh
npm install
npm run dev        # server on :2567 (tsx watch) + Vite on :5173
npm test           # vitest
npm run lint && npm run typecheck
```

Narration in dev:

- Without Piper installed locally, the title-screen line shows as text only.
- To get audio, install [Piper](https://github.com/rhasspy/piper), set `PIPER_BIN`/`PIPER_VOICE`, and run `npm run tts`.
- Or run everything in Docker.

## Docker

```sh
docker compose up --build   # http://localhost:2567
```

Deployment with Portainer + nginx, backups and restore are covered in [docs/deploy.md](docs/deploy.md).
