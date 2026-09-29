import '@fontsource/rye/400.css';
import '@fontsource/patrick-hand/400.css';
import './style.css';
import { Game } from './game/game.js';
import { loadModels } from './game/models.js';
import { updater } from './pwa/updater.js';
import { store } from './save/store.js';
import { PHRASES } from '@western/shared';
import { narrator } from './audio/narrator.js';
import { Director } from './story/director.js';
import { script } from './story/scripts.js';
import { ChatMenu } from './ui/chat.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';

updater.start();
void store.sync();
// The sculpted people must be ready before the first region is built.
await loadModels();

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

const game = new Game(
  canvas,
  {
    onPause: () => pause(),
    onPlayers: (count, online) => hud.setPlayers(count, online),
    onFrame: () => director.update(),
    onSaid: (phrase, distance) => {
      const line = phraseLine(phrase);
      if (distance === null) {
        showOwnBubble(PHRASES[phrase]!.text);
        void narrator.playExtra(line);
      } else if (distance < 30) {
        void narrator.playExtra(line, 1 - distance / 30);
      }
    },
  },
  store.save.region,
);

// ?debug exposes the game for automated screenshots and poking around in devtools.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { game, store });

const screens = new Screens(ui, {
  play: () => play(),
  restartChapter: () => director.restartChapter(),
  regions: () => director.unlockedRegions(),
  currentRegion: () => game.region,
  hatChanged: (hat) => game.setHat(hat),
  travel: async (region) => {
    play();
    await director.travel(region);
  },
});
const hud = new Hud(
  () => pause(),
  () => chat.toggle(),
);
const director = new Director(game, hud);
const chat = new ChatMenu(
  (phrase) => game.say(phrase),
  (emote) => game.emote(emote),
);
chat.setEnabled(() => game.isPlaying && !director.isBusy);

/** Our own phrase as a bubble above the HUD (we can't see our own avatar). */
function showOwnBubble(text: string) {
  document.querySelector('.own-bubble')?.remove();
  const bubble = document.createElement('div');
  bubble.className = 'own-bubble';
  bubble.textContent = text;
  document.body.append(bubble);
  setTimeout(() => bubble.remove(), 3500);
}

function phraseLine(phrase: number) {
  return script('fraser').lines.find((l) => l.id === `fraser.${PHRASES[phrase]!.id}`)!;
}

function play() {
  screens.hide();
  hud.show(true);
  // In-game is not a safe point for applying updates.
  updater.setSafe(false);
  game.start(store.save.nickname, store.save.hat);
  director.start();
}

function pause() {
  chat.toggle(false);
  game.pause();
  hud.show(false);
  screens.pause(() => play());
}

screens.splash();
