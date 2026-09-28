import { parseDialogue, randomNickname } from '@western/shared';
import titleScript from '../../../../content/story/titel.yaml?raw';
import { narrator } from '../audio/narrator.js';
import { updater } from '../pwa/updater.js';
import { store } from '../save/store.js';
import { saveSettings, settings } from '../settings.js';
import { speak } from './bubble.js';
import { h } from './dom.js';
import { toast } from './toast.js';

const title = parseDialogue(titleScript);

export interface ScreenActions {
  play(): void;
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
    const toTitle = h('button', { class: 'btn' }, 'Til titelskærmen');
    toTitle.onclick = () => this.title();
    this.show(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Pause'),
        h('div', { class: 'menu' }, resume, toTitle),
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
    const back = h('button', { class: 'btn btn-small' }, '← Tilbage');
    back.onclick = () => this.title();
    this.show(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Indstillinger'),
        h('label', { class: 'setting' }, narration, ' Læs teksten højt'),
        h('label', { class: 'setting' }, 'Lydstyrke ', volume),
        h('label', { class: 'setting' }, 'Kigge-følsomhed ', look),
        back,
      ),
    );
  }
}
