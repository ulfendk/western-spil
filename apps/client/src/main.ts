import '@fontsource/rye/400.css';
import '@fontsource/patrick-hand/400.css';
import './style.css';
import { Game } from './game/game.js';
import { updater } from './pwa/updater.js';
import { store } from './save/store.js';
import { Chapter1 } from './story/chapter1.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';

updater.start();
void store.sync();

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

const game = new Game(canvas, {
  onPause: () => pause(),
  onPlayers: (count, online) => hud.setPlayers(count, online),
  onFrame: () => story.update(),
});

// ?debug exposes the game for automated screenshots and poking around in devtools.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { game });

const screens = new Screens(ui, { play: () => play(), restartChapter: () => story.restart() });
const hud = new Hud(
  () => pause(),
  (emote) => game.emote(emote),
);
const story = new Chapter1(game, hud);

function play() {
  screens.hide();
  hud.show(true);
  // In-game is not a safe point for applying updates.
  updater.setSafe(false);
  game.start(store.save.nickname, store.save.hat);
  story.start();
}

function pause() {
  game.pause();
  hud.show(false);
  screens.pause(() => play());
}

screens.splash();
