import '@fontsource/rye/400.css';
import '@fontsource/patrick-hand/400.css';
import './style.css';
import { Game } from './game/game.js';
import { updater } from './pwa/updater.js';
import { store } from './save/store.js';
import { PHRASES } from '@western/shared';
import { narrator } from './audio/narrator.js';
import { Chapter1 } from './story/chapter1.js';
import { script } from './story/scripts.js';
import { StLouis } from './town/stLouis.js';
import { ChatMenu } from './ui/chat.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';

updater.start();
void store.sync();

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

const game = new Game(canvas, {
  onPause: () => pause(),
  onPlayers: (count, online) => hud.setPlayers(count, online),
  onFrame: () => {
    story.update();
    town.update();
  },
  onSaid: (phrase, distance) => {
    const line = phraseLine(phrase);
    if (distance === null) {
      showOwnBubble(PHRASES[phrase]!.text);
      void narrator.playExtra(line);
    } else if (distance < 30) {
      void narrator.playExtra(line, 1 - distance / 30);
    }
  },
});

// ?debug exposes the game for automated screenshots and poking around in devtools.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { game });

const screens = new Screens(ui, { play: () => play(), restartChapter: () => story.restart() });
const hud = new Hud(
  () => pause(),
  () => chat.toggle(),
);
const story = new Chapter1(game, hud);
const town = new StLouis(game, hud, () => story.isBusy);
const chat = new ChatMenu(
  (phrase) => game.say(phrase),
  (emote) => game.emote(emote),
);
chat.setEnabled(() => game.isPlaying && !story.isBusy && !town.busy);

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
  story.start();
}

function pause() {
  chat.toggle(false);
  game.pause();
  hud.show(false);
  screens.pause(() => play());
}

screens.splash();
