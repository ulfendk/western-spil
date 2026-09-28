# Kanel og Grønskollingen 🤠🐴

A Danish first-person Wild West adventure for kids aged 8–12, in a comic-book style.

- **The journey:** the player travels from St. Louis to Promontory in 1869, together with Kanel, the cleverest horse on the prairie.
- **Narration:** all story text is read aloud in Danish (Piper TTS).
- **Multiplayer:** frontier towns are shared meeting places.
- **Delivery:** it runs as a PWA from one self-hosted Docker image.

## Structure

| Path                  | What                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `packages/shared`     | Protocol, dialogue format, saves and backups, rejsekode (shared by client and server)       |
| `apps/client`         | Three.js + Vite + PWA (service worker with safe-point auto-update)                          |
| `apps/server`         | Colyseus (town rooms) + Express (static files, `/api/saves`, `/api/tts`), SQLite in `/data` |
| `tools/voice`         | Offline Røst-v3 narration renderer (Python/Docker) → `content/narration`                    |
| `tools/tts`           | Collects narration for the build; Piper fallback for unvoiced lines                         |
| `content/story`       | Dialogue scripts (Danish)                                                                   |
| `content/narration`   | Voiced lines (committed)                                                                    |
| `content/voices.yaml` | Voice per speaker + pronunciation lexicon                                                   |

## Development

```sh
npm install
npm run dev        # server on :2567 (tsx watch) + Vite on :5173
npm test           # vitest
npm run lint && npm run typecheck
```

Run `npm run tts` once to copy the committed narration into the dev client. Add `?debug` to the URL to expose `window.game`, e.g. `game.debugView(x, z, yaw)` or `game.time = 29` (to see the train).

## Regions and chapters

The journey runs east to west. Each region has its own map, chapter and shared town:

| Region         | Chapter                  | Town            | Code                                                                                |
| -------------- | ------------------------ | --------------- | ----------------------------------------------------------------------------------- |
| St. Louis      | 1 – Afsked ved St. Louis | St. Louis       | `game/world/regions/stLouis.ts`, `story/chapter1.ts`                                |
| Prærien        | 2 – Prærien              | Støvby          | `game/world/regions/praerien.ts`, `story/chapter2.ts`                               |
| Fortet         | 3 – Fortet               | Fort Kearny     | `game/world/regions/fortet.ts`, `game/world/fort.ts`, `story/chapter3.ts`           |
| Lejren         | 4 – Lejren               | The Lakota camp | `game/world/regions/lejren.ts`, `game/world/camp4.ts`, `story/chapter4.ts`          |
| Klippebjergene | 5 – Klippebjergene       | Sølvkløften     | `game/world/regions/bjergene.ts`, `game/world/mountain.ts`, `story/chapter5.ts`     |
| Promontory     | 6 – Promontory           | Promontory      | `game/world/regions/promontory.ts`, `game/world/promontory.ts`, `story/chapter6.ts` |

- **Regions:** they are listed in `packages/shared/src/regions.ts`. Each region builder sets its own `TerrainProfile` (hills, trail, levelled towns, river) and adds its landmarks, camp and town (`TownConfig`).
- **Chapters:** each chapter extends `story/chapterBase.ts`. It provides quest steps (saved per chapter in `progress.steps`), the objective line, the "!" marker, the "Tal med…" prompt, voiced conversations and the chapter card.
- **Weather and time of day:** `world.setMood('day' | 'storm' | 'night' | 'sunset')` changes the sky, light, fog, rain and lightning (with thunder), and the ambience (`audio/ambience.ts`: wind, birds, crickets, rain; it ducks under narration).
- **Hat shop and journal:** the pause menu has 🤠 Hattebutik (hats bought with dollars, owned hats stored as `hat-N` flags) and 📖 Kanels dagbog (one voiced history fact per finished chapter, in `content/story/dagbog.yaml`).
- **Travel:** `story/director.ts` swaps region, chapter and town. The player travels onward from a chapter card, or back and forth with the 🗺️ travel map in the pause menu.

## Multiplayer

- **Town:** St. Louis, east of the starting camp, is a shared town. Everyone online sees each other there.
- **Safe chat:** players talk with preset Danish phrases and emotes only (the 💬 button, or T). There's no free text. Phrases live in `packages/shared/src/phrases.ts` and are voiced in `content/story/fraser.yaml`. Only ever append new phrases, because the index is sent over the network.
- **Hestesko:** the horseshoe toss (`HorseshoeRoom`) is for 1–4 players at the pit on the square. The server decides every throw using the shared rules in `packages/shared/src/horseshoe.ts`.
- **Protocol version:** when messages or room state change incompatibly, bump `PROTOCOL_VERSION` in `packages/shared/src/protocol.ts`. Older clients are then told to update.

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
