import { beep } from '../audio/sfx.js';
import { h } from '../ui/dom.js';

type Piece = 'svelle' | 'skinne' | 'soem';
const LABEL: Record<Piece, string> = { svelle: '🪵 Svelle', skinne: '➖ Skinne', soem: '📌 Søm' };
const ROUNDS = 6;

export interface TrackResult {
  seconds: number;
  mistakes: number;
}

/**
 * Lay the last stretch of track: the board shows an order of sleeper, rail and
 * nail; tap the three buttons in that order. Each correct round adds a length of
 * track to the drawing. A wrong tap only costs a buzz and a mistake.
 */
export function playTrackLaying(): Promise<TrackResult> {
  return new Promise((resolve) => {
    const width = Math.min(460, Math.floor(window.innerWidth * 0.9));
    const canvas = h('canvas', { width: width * 2, height: 160, class: 'track-canvas' });
    canvas.style.width = `${width}px`;
    canvas.style.height = '80px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    const board = h('div', { class: 'track-board' });
    const status = h('p', { class: 'pack-status' });
    const buttons = h('div', { class: 'track-buttons' });
    const root = h(
      'div',
      { class: 'pack track' },
      h('h2', {}, 'Læg skinner'),
      h('p', { class: 'pack-help' }, 'Tryk på tingene i samme rækkefølge som på tavlen.'),
      board,
      canvas,
      buttons,
      status,
    );
    document.body.append(root);
    const started = performance.now();
    let mistakes = 0;
    let round = 0;
    let index = 0;
    let order: Piece[] = [];

    const newRound = () => {
      // Early rounds follow the natural order; later ones mix it up (and get longer).
      const base: Piece[] = ['svelle', 'skinne', 'soem'];
      order =
        round < 2
          ? base
          : [...base, ...(round >= 4 ? [base[round % 3]!] : [])].sort(() => Math.random() - 0.5);
      index = 0;
      renderBoard();
    };
    const renderBoard = () => {
      board.replaceChildren(
        ...order.map((p, i) =>
          h('span', { class: i < index ? 'done' : i === index ? 'next' : '' }, LABEL[p]),
        ),
      );
      status.textContent = `🛤️ ${round} af ${ROUNDS} stykker spor`;
    };
    for (const piece of ['svelle', 'skinne', 'soem'] as Piece[]) {
      const btn = h('button', { class: 'btn btn-big' }, LABEL[piece]);
      btn.addEventListener('click', () => press(piece));
      buttons.append(btn);
    }
    const onKey = (e: KeyboardEvent) => {
      const piece = (
        { Digit1: 'svelle', Digit2: 'skinne', Digit3: 'soem' } as Record<string, Piece>
      )[e.code];
      if (piece) press(piece);
    };
    window.addEventListener('keydown', onKey);

    function press(piece: Piece) {
      if (round >= ROUNDS) return;
      if (order[index] !== piece) {
        mistakes++;
        beep(160, 0.18, 0.12, 0, 'square');
        root.classList.remove('shake');
        void root.offsetWidth;
        root.classList.add('shake');
        return;
      }
      index++;
      beep(
        piece === 'soem' ? 1400 : 700 + index * 120,
        0.08,
        0.12,
        0,
        piece === 'soem' ? 'triangle' : 'sine',
      );
      if (index >= order.length) {
        round++;
        draw();
        if (round >= ROUNDS) return finish();
        newRound();
      } else renderBoard();
    }

    function draw() {
      ctx.clearRect(0, 0, width, 80);
      ctx.fillStyle = '#d9b77e';
      ctx.fillRect(0, 30, width, 50);
      const seg = width / ROUNDS;
      for (let r = 0; r < round; r++) {
        for (let s = 0; s < 4; s++) {
          ctx.fillStyle = '#5e4128';
          ctx.fillRect(r * seg + s * (seg / 4) + 3, 40, 8, 30);
        }
        ctx.fillStyle = '#6a6e75';
        ctx.fillRect(r * seg, 46, seg + 1, 4);
        ctx.fillRect(r * seg, 60, seg + 1, 4);
      }
      // The locomotive waiting at the end of the finished track.
      ctx.font = '26px sans-serif';
      ctx.fillText('🚂', Math.max(0, round * seg - 34), 32);
    }

    function finish() {
      status.textContent = 'Sporet er færdigt! 🎉';
      board.replaceChildren();
      setTimeout(() => {
        window.removeEventListener('keydown', onKey);
        root.remove();
        resolve({ seconds: (performance.now() - started) / 1000, mistakes });
      }, 1200);
    }

    newRound();
    draw();
  });
}
