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

Run `npm run tts` once to copy the committed narration into the dev client. Add `?debug` to the URL to expose `window.game`, e.g. `game.debugView(x, z, yaw)` or `game.time = 29` (to see the train).

## Writing story content

Each conversation is a YAML file in `content/story/`. The quest logic that decides _when_ each one plays lives in `apps/client/src/story/` (chapter 1: `chapter1.ts`).

```yaml
id: k1-pind # line ids become "k1-pind.<id>"
lines:
  - id: hej
    speaker: pind # fortaeller | kanel | pind | spiller
    text: Nå, der er du! # shown on screen
  - id: kasse
    speaker: fortaeller
    text: Pind rækker dig en lille, tung kasse.
    say: Pind rækker dig en lille tung kasse. # optional: what the voice reads
    choices: # optional: answer buttons after this line
      - text: Hvem er de?
        flag: spurgte-om-broedrene # saved in progress.flags
        lines:
          - { id: boevl, speaker: pind, text: Bøvl-brødrene! }
      - text: Jeg passer på den!
```

After editing, run `npm run voice` to voice new or changed lines, then commit `content/narration`.

## Narration (Danish voices)

Story lines are voiced offline with [Røst-v3](https://huggingface.co/CoRal-project/roest-v3-chatterbox-500m). It's the CoRal project's Danish Chatterbox model, and it runs in its own Docker image (`tools/voice`), so the game image never needs PyTorch.

```sh
npm run voice                             # voice new or changed lines into content/narration
npm run voice -- --only k1-intro.         # just some lines
npm run voice -- --force --only k1-pind.  # re-roll takes you don't like
```

- **Output:** MP3s plus `content/narration/manifest.json`. They are **committed**, and the Docker build copies them.
- **Voices:** each speaker's voice is set in `content/voices.yaml`: CoRal's `mic`/`nic` speakers, pitch, tempo and expressiveness. You can also clone a consenting speaker from a 10–20 s WAV in `content/voices/`.
- **Pronunciation:** add tricky names and abbreviations to `lexicon` in `content/voices.yaml` (e.g. `St. Louis: Sænt Luis`). Only the voice sees the respelling.
- **Speed:** CPU-only rendering takes about 30–60 s per sentence. The ~3 GB model is cached in the `western-voice-models` Docker volume, and progress is saved after every line.
- **Fallbacks:** lines that aren't voiced yet (or whose text changed since) fall back to Piper at build time. Dynamic runtime lines use Piper via `/api/tts`.

## Docker

```sh
docker compose up --build   # http://localhost:2567
```

Deployment with Portainer + nginx, backups and restore are covered in [docs/deploy.md](docs/deploy.md).
