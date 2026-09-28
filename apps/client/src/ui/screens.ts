import { parseDialogue, randomNickname, REGIONS, type RegionId } from '@western/shared';
import titleScript from '../../../../content/story/titel.yaml?raw';
import { narrator } from '../audio/narrator.js';
import { updater } from '../pwa/updater.js';
import { store } from '../save/store.js';
import { saveSettings, settings } from '../settings.js';
import { HAT_COLORS } from '../game/avatars.js';
import { script } from '../story/scripts.js';
import { speak } from './bubble.js';
import { h } from './dom.js';
import { toast } from './toast.js';

const title = parseDialogue(titleScript);

export interface ScreenActions {
  play(): void;
  /** Start the current chapter over. */
  restartChapter(): void;
  /** Regions the player can travel to, and where they are now. */
  regions(): RegionId[];
  currentRegion(): RegionId;
  /** The player put on another hat (shown to others from the next town join). */
  hatChanged(hat: number): void;
  travel(region: RegionId): void;
}

export class Screens {
  private root: HTMLElement;
  private greeted = false;

  constructor(
    mount: HTMLElement,
    private actions: ScreenActions,
  ) {
    this.root = mount;
  }

  private show(...children: HTMLElement[]) {
    this.root.replaceChildren(...children);
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /** First tap unlocks audio on mobile browsers. */
  splash() {
    updater.setSafe(true);
    const btn = h('button', { class: 'btn btn-big' }, 'Tryk for at begynde 🤠');
    btn.onclick = () => this.title();
    this.show(
      h(
        'div',
        { class: 'panel panel-title' },
        h('h1', { class: 'logo' }, 'Kanel og', h('br'), 'Grønskollingen'),
        btn,
      ),
    );
  }

  title() {
    updater.setSafe(true);
    const started =
      store.save.chapter > 1 || store.save.dollars > 0 || localStorage.getItem('kanel.started');
    const name = h('span', { class: 'nickname' }, store.save.nickname);
    const reroll = h(
      'button',
      { class: 'btn btn-small', title: 'Nyt navn', ariaLabel: 'Nyt navn' },
      '🎲',
    );
    reroll.onclick = () => {
      store.update({ nickname: randomNickname() });
      name.textContent = store.save.nickname;
    };
    const play = h('button', { class: 'btn btn-big' }, started ? 'Fortsæt rejsen' : 'Start rejsen');
    play.onclick = () => {
      narrator.stop();
      try {
        localStorage.setItem('kanel.started', '1');
      } catch {
        /* ignore */
      }
      this.actions.play();
    };
    const backup = h('button', { class: 'btn' }, 'Sikkerhedskopi');
    backup.onclick = () => this.backup();
    const opts = h('button', { class: 'btn' }, 'Indstillinger');
    opts.onclick = () => this.settings();

    const bubbles = h('div', { class: 'bubbles' });
    this.show(
      h(
        'div',
        { class: 'panel panel-title' },
        h('h1', { class: 'logo' }, 'Kanel og', h('br'), 'Grønskollingen'),
        h('p', { class: 'who' }, 'Du er: ', name, ' ', reroll),
        h('div', { class: 'menu' }, play, backup, opts),
        h('p', { class: 'version' }, `v${__APP_VERSION__}`),
      ),
      bubbles,
    );
    if (!this.greeted) {
      this.greeted = true;
      void (async () => {
        for (const line of title.lines) await speak(bubbles, line);
      })();
    }
  }

  pause(onResume: () => void) {
    updater.setSafe(true);
    const resume = h('button', { class: 'btn btn-big' }, 'Fortsæt');
    resume.onclick = () => onResume();
    const map = h('button', { class: 'btn' }, '🗺️ Rejsekort');
    map.onclick = () => this.travelMap(onResume);
    const shop = h('button', { class: 'btn' }, '🤠 Hattebutik');
    shop.onclick = () => this.hatShop(onResume);
    const journal = h('button', { class: 'btn' }, '📖 Kanels dagbog');
    journal.onclick = () => this.journal(onResume);
    const toTitle = h('button', { class: 'btn' }, 'Til titelskærmen');
    toTitle.onclick = () => this.title();
    this.show(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Pause'),
        h('p', { class: 'chapter-stats' }, `⭐ ${store.save.stars}   💲 ${store.save.dollars}`),
        h('div', { class: 'menu' }, resume, map, shop, journal, toTitle),
      ),
    );
  }

  /** Buy hats with the dollars earned in minigames. Others see the new hat in the next town. */
  hatShop(onBack: () => void) {
    updater.setSafe(true);
    const owned = (i: number) => i === 0 || store.save.progress.flags.includes(`hat-${i}`);
    const wallet = h('p', { class: 'chapter-stats' });
    const grid = h('div', { class: 'hat-grid' });
    const render = () => {
      wallet.textContent = `💲 ${store.save.dollars}`;
      grid.replaceChildren(
        ...HATS.map((hat, i) => {
          const have = owned(i);
          const worn = store.save.hat === i;
          const b = h(
            'button',
            {
              class: `hat-item${worn ? ' worn' : ''}`,
              disabled: !have && store.save.dollars < hat.price,
            },
            hatIcon(HAT_COLORS[i]!),
            h('span', {}, hat.name),
            h('small', {}, worn ? 'På hovedet' : have ? 'Tag på' : `💲 ${hat.price}`),
          );
          b.onclick = () => {
            if (!have) {
              if (store.save.dollars < hat.price) return;
              store.update({
                dollars: store.save.dollars - hat.price,
                progress: {
                  ...store.save.progress,
                  flags: [...store.save.progress.flags, `hat-${i}`],
                },
              });
              toast(`Du købte ${hat.name.toLowerCase()} 🤠`);
            }
            store.update({ hat: i });
            this.actions.hatChanged(i);
            render();
          };
          return b;
        }),
      );
    };
    render();
    const back = h('button', { class: 'btn btn-small' }, '← Tilbage');
    back.onclick = () => this.pause(onBack);
    this.show(
      h(
        'div',
        { class: 'panel panel-wide' },
        h('h2', {}, 'Hattebutik'),
        h(
          'p',
          {},
          'Køb en ny hat for dine dollars. Dine venner ser den, næste gang du kommer til en by.',
        ),
        wallet,
        grid,
        back,
      ),
    );
  }

  /** Kanel's journal: a true bit of history for every chapter you have finished. */
  journal(onBack: () => void) {
    updater.setSafe(true);
    const entries = script('dagbog').lines;
    let playing: HTMLElement | null = null;
    const list = h(
      'div',
      { class: 'journal' },
      ...REGIONS.map((r) => {
        const line = entries.find((l) => l.id === `dagbog.k${r.chapter}`);
        const open = store.save.chapter > r.chapter && line;
        if (!open) {
          return h(
            'div',
            { class: 'journal-entry locked' },
            h('h3', {}, `🔒 Kapitel ${r.chapter}`),
            h('p', {}, 'Klar kapitlet for at læse, hvad Kanel skrev.'),
          );
        }
        const listen = h('button', { class: 'btn btn-small' }, '🔊 Hør');
        const entry = h(
          'div',
          { class: 'journal-entry' },
          h('h3', {}, `Kapitel ${r.chapter}: ${r.name}`),
          h('p', {}, line.text),
          listen,
        );
        listen.onclick = async () => {
          narrator.stop();
          playing?.classList.remove('playing');
          playing = entry;
          entry.classList.add('playing');
          await narrator.play(line);
          entry.classList.remove('playing');
        };
        return entry;
      }),
    );
    const back = h('button', { class: 'btn btn-small' }, '← Tilbage');
    back.onclick = () => {
      narrator.stop();
      this.pause(onBack);
    };
    this.show(h('div', { class: 'panel panel-wide' }, h('h2', {}, 'Kanels dagbog'), list, back));
  }

  /** The travel map: the journey east to west, with the stops reached so far. */
  travelMap(onBack: () => void) {
    updater.setSafe(true);
    const unlocked = new Set(this.actions.regions());
    const here = this.actions.currentRegion();
    const stops = REGIONS.map((r) => {
      const open = unlocked.has(r.id);
      const b = h(
        'button',
        { class: `map-stop${r.id === here ? ' here' : ''}`, disabled: !open || r.id === here },
        h('span', { class: 'map-dot' }, r.id === here ? '🐴' : open ? '⭐' : '🔒'),
        h('span', {}, `Kapitel ${r.chapter}: ${r.name}`),
      );
      b.onclick = () => this.actions.travel(r.id);
      return b;
    });
    const back = h('button', { class: 'btn btn-small' }, '← Tilbage');
    back.onclick = () => this.pause(onBack);
    this.show(
      h(
        'div',
        { class: 'panel panel-wide' },
        h('h2', {}, 'Rejsekort'),
        h('p', {}, 'Fra øst mod vest. Rejs tilbage for at møde venner i de andre byer.'),
        h('div', { class: 'map-route' }, ...stops),
        back,
      ),
    );
  }

  /** Backup & restore: rejsekode, download file, restore from file or code. */
  backup() {
    updater.setSafe(true);
    const codeBox = h('p', { class: 'rejsekode' }, store.rejsekode?.replaceAll('-', ' ') ?? '…');
    if (!store.rejsekode) {
      void store.sync().then(() => {
        codeBox.textContent =
          store.rejsekode?.replaceAll('-', ' ') ?? 'Ingen forbindelse – prøv igen senere';
      });
    }

    const download = h('button', { class: 'btn' }, '💾 Gem sikkerhedskopi');
    download.onclick = () => {
      store.downloadBackup();
      toast('Sikkerhedskopien er gemt');
    };

    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        await store.restoreFromFile(f);
        toast(`Velkommen tilbage, ${store.save.nickname}!`);
        this.title();
      } catch (err) {
        toast((err as Error).message);
      }
    };
    const upload = h('button', { class: 'btn' }, '📂 Indlæs sikkerhedskopi');
    upload.onclick = () => file.click();

    const input = h('input', {
      class: 'code-input',
      placeholder: 'fx hest kaktus sadel lasso vogn tog',
      autocapitalize: 'off',
      spellcheck: false,
    });
    const restore = h('button', { class: 'btn' }, 'Hent med rejsekode');
    restore.onclick = async () => {
      try {
        await store.restoreFromCode(input.value);
        toast(`Velkommen tilbage, ${store.save.nickname}!`);
        this.title();
      } catch (err) {
        toast((err as Error).message);
      }
    };

    const back = h('button', { class: 'btn btn-small' }, '← Tilbage');
    back.onclick = () => this.title();

    this.show(
      h(
        'div',
        { class: 'panel panel-wide' },
        h('h2', {}, 'Sikkerhedskopi'),
        h('p', {}, 'Din rejsekode – skriv den ned, så kan du altid fortsætte din rejse:'),
        codeBox,
        h('div', { class: 'menu menu-row' }, download, upload, file),
        h('h3', {}, 'Fortsæt en rejse'),
        h('div', { class: 'menu menu-row' }, input, restore),
        back,
      ),
    );
  }

  settings() {
    updater.setSafe(true);
    const narration = h('input', { type: 'checkbox', checked: settings.narration });
    narration.onchange = () => {
      settings.narration = narration.checked;
      saveSettings();
    };
    const volume = h('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.05',
      value: String(settings.volume),
    });
    volume.oninput = () => {
      settings.volume = Number(volume.value);
      saveSettings();
    };
    const look = h('input', {
      type: 'range',
      min: '0.3',
      max: '2',
      step: '0.1',
      value: String(settings.lookSensitivity),
    });
    look.oninput = () => {
      settings.lookSensitivity = Number(look.value);
      saveSettings();
    };
    const quality = h('select', { class: 'select' });
    for (const [value, label] of [
      ['auto', 'Automatisk'],
      ['high', 'Høj'],
      ['medium', 'Mellem'],
      ['low', 'Lav (hurtigst)'],
    ] as const) {
      quality.append(h('option', { value, selected: settings.quality === value }, label));
    }
    quality.onchange = () => {
      settings.quality = quality.value as typeof settings.quality;
      saveSettings();
      toast('Grafikken skifter, når spillet genstarter');
      setTimeout(() => window.location.reload(), 1200);
    };
    const replay = h('button', { class: 'btn btn-small' }, '↺ Spil kapitlet igen');
    replay.onclick = () => {
      this.actions.restartChapter();
      toast('Kapitlet starter forfra næste gang du spiller');
    };
    const back = h('button', { class: 'btn btn-small' }, '← Tilbage');
    back.onclick = () => this.title();
    this.show(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Indstillinger'),
        replay,
        h('label', { class: 'setting' }, 'Grafik ', quality),
        h('label', { class: 'setting' }, narration, ' Læs teksten højt'),
        h('label', { class: 'setting' }, 'Lydstyrke ', volume),
        h('label', { class: 'setting' }, 'Kigge-følsomhed ', look),
        back,
      ),
    );
  }
}

const HATS = [
  { name: 'Brun hat', price: 0 },
  { name: 'Sort hat', price: 10 },
  { name: 'Hvid hat', price: 15 },
  { name: 'Rød hat', price: 20 },
  { name: 'Blå hat', price: 20 },
  { name: 'Grøn hat', price: 25 },
  { name: 'Lilla hat', price: 30 },
  { name: 'Guldhat', price: 50 },
];

/** A little cowboy-hat drawing in the given colour. */
function hatIcon(color: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 40');
  svg.setAttribute('class', 'hat-icon');
  svg.innerHTML =
    `<path d="M4 30 Q32 40 60 30 Q58 24 50 26 L46 8 Q40 2 32 6 Q24 2 18 8 L14 26 Q6 24 4 30 Z" fill="${color}" stroke="#2a2320" stroke-width="2.5" stroke-linejoin="round"/>` +
    '<path d="M15 22 Q32 27 49 22 L48 18 Q32 23 16 18 Z" fill="#2a2320" opacity="0.55"/>';
  return svg;
}
