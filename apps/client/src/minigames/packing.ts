import { h } from '../ui/dom.js';

type Cell = [col: number, row: number];

interface PieceDef {
  name: string;
  icon: string;
  color: string;
  cells: Cell[];
}

const COLS = 6;
const ROWS = 4;

/**
 * The cargo exactly fills the 6×4 wagon bed (one known solution), so the
 * puzzle is always solvable. Pieces start rotated and shuffled in the tray.
 */
const PIECES: PieceDef[] = [
  {
    name: 'Melsække',
    icon: '🌾',
    color: '#e9dfc4',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  },
  {
    name: 'Kiste',
    icon: '📦',
    color: '#b07a42',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
    ],
  },
  {
    name: 'Tønde',
    icon: '🛢️',
    color: '#8a5a2b',
    cells: [
      [0, 0],
      [0, 1],
    ],
  },
  {
    name: 'Kaffe',
    icon: '☕',
    color: '#6b4423',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  },
  {
    name: 'Bønner',
    icon: '🫘',
    color: '#c8553d',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  },
  {
    name: 'Værktøj',
    icon: '🔨',
    color: '#6f7479',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    name: 'Tæpper',
    icon: '🧶',
    color: '#3d6b8a',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  },
  {
    name: 'Lanterne',
    icon: '🏮',
    color: '#d9a441',
    cells: [
      [0, 0],
      [1, 0],
    ],
  },
];

interface Piece {
  def: PieceDef;
  cells: Cell[];
  el: HTMLElement;
  /** Grid position of the piece's (0,0) when placed, else null. */
  at: Cell | null;
}

export interface PackingResult {
  seconds: number;
}

function normalize(cells: Cell[]): Cell[] {
  const minC = Math.min(...cells.map((c) => c[0]));
  const minR = Math.min(...cells.map((c) => c[1]));
  return cells.map(([c, r]) => [c - minC, r - minR]);
}

function rotate(cells: Cell[]): Cell[] {
  return normalize(cells.map(([c, r]) => [-r, c]));
}

/** Runs the wagon-packing puzzle as a full-screen overlay. Resolves when the wagon is full. */
export function playPacking(): Promise<PackingResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const cellPx = () =>
      Math.min(64, Math.floor(Math.min(window.innerWidth * 0.85, 700) / (COLS + 1)));

    const board = h('div', { class: 'pack-board' });
    const tray = h('div', { class: 'pack-tray' });
    const status = h('p', { class: 'pack-status' });
    const root = h(
      'div',
      { class: 'pack' },
      h('h2', {}, 'Pak vognen'),
      h(
        'p',
        { class: 'pack-help' },
        'Træk tingene op i vognen, så bunden bliver fyldt. Tryk på en ting for at vende den.',
      ),
      board,
      status,
      tray,
    );
    document.body.append(root);

    const occupied = (): (Piece | null)[][] => {
      const grid: (Piece | null)[][] = Array.from({ length: ROWS }, () =>
        Array<Piece | null>(COLS).fill(null),
      );
      for (const p of pieces) {
        if (!p.at) continue;
        for (const [c, r] of p.cells) grid[p.at[1] + r]![p.at[0] + c] = p;
      }
      return grid;
    };

    const fits = (piece: Piece, at: Cell): boolean => {
      const grid = occupied();
      return piece.cells.every(([c, r]) => {
        const col = at[0] + c;
        const row = at[1] + r;
        return (
          col >= 0 &&
          row >= 0 &&
          col < COLS &&
          row < ROWS &&
          (!grid[row]![col] || grid[row]![col] === piece)
        );
      });
    };

    const render = (piece: Piece) => {
      const size = cellPx();
      const w = Math.max(...piece.cells.map((c) => c[0])) + 1;
      const hgt = Math.max(...piece.cells.map((c) => c[1])) + 1;
      piece.el.style.width = `${w * size}px`;
      piece.el.style.height = `${hgt * size}px`;
      piece.el.replaceChildren(
        ...piece.cells.map(([c, r], i) => {
          const cell = h('div', { class: 'pack-cell' }, i === 0 ? piece.def.icon : '');
          cell.style.cssText = `left:${c * size}px;top:${r * size}px;width:${size}px;height:${size}px;background:${piece.def.color}`;
          return cell;
        }),
      );
      piece.el.title = piece.def.name;
      if (piece.at) {
        piece.el.classList.add('placed');
        board.append(piece.el);
        piece.el.style.left = `${piece.at[0] * size}px`;
        piece.el.style.top = `${piece.at[1] * size}px`;
      } else {
        piece.el.classList.remove('placed');
        tray.append(piece.el);
        piece.el.style.left = piece.el.style.top = '';
      }
    };

    const layout = () => {
      const size = cellPx();
      board.style.width = `${COLS * size}px`;
      board.style.height = `${ROWS * size}px`;
      board.style.backgroundSize = `${size}px ${size}px`;
      pieces.forEach(render);
    };

    const pieces: Piece[] = PIECES.map((def) => {
      let cells = normalize(def.cells);
      for (let i = Math.floor(Math.random() * 4); i > 0; i--) cells = rotate(cells);
      return { def, cells, el: h('div', { class: 'pack-piece' }), at: null };
    }).sort(() => Math.random() - 0.5);

    const updateStatus = () => {
      const filled = occupied().flat().filter(Boolean).length;
      status.textContent = `${filled} af ${COLS * ROWS} pladser fyldt`;
      if (filled === COLS * ROWS) {
        status.textContent = 'Vognen er pakket! 🎉';
        root.classList.add('done');
        window.removeEventListener('resize', layout);
        setTimeout(() => {
          root.remove();
          resolve({ seconds: (performance.now() - started) / 1000 });
        }, 1400);
      }
    };

    for (const piece of pieces) {
      piece.el.addEventListener('pointerdown', (down) => {
        down.preventDefault();
        const size = cellPx();
        const rect = piece.el.getBoundingClientRect();
        const offX = down.clientX - rect.left;
        const offY = down.clientY - rect.top;
        const startX = down.clientX;
        const startY = down.clientY;
        let ghost: HTMLElement | null = null;
        piece.el.setPointerCapture(down.pointerId);

        const move = (e: PointerEvent) => {
          if (!ghost && Math.hypot(e.clientX - startX, e.clientY - startY) < 8) return;
          if (!ghost) {
            // Drag a copy; the original stays put (faded) so nothing reflows under the finger.
            ghost = piece.el.cloneNode(true) as HTMLElement;
            ghost.classList.add('dragging');
            ghost.classList.remove('placed');
            ghost.style.position = 'fixed';
            document.body.append(ghost);
            piece.el.classList.add('lifted');
          }
          ghost.style.left = `${e.clientX - offX}px`;
          ghost.style.top = `${e.clientY - offY}px`;
        };
        const up = (e: PointerEvent) => {
          piece.el.removeEventListener('pointermove', move);
          piece.el.removeEventListener('pointerup', up);
          piece.el.removeEventListener('pointercancel', up);
          piece.el.classList.remove('lifted');
          if (!ghost) {
            // A tap rotates the piece (taking it out of the wagon if it no longer fits).
            piece.cells = rotate(piece.cells);
            if (piece.at && !fits(piece, piece.at)) piece.at = null;
          } else {
            ghost.remove();
            const b = board.getBoundingClientRect();
            const border = board.clientLeft;
            const col = Math.round((e.clientX - offX - b.left - border) / size);
            const row = Math.round((e.clientY - offY - b.top - border) / size);
            // Snap into the wagon if it fits there; otherwise it goes back to the tray.
            piece.at = null;
            piece.at = fits(piece, [col, row]) ? [col, row] : null;
          }
          render(piece);
          updateStatus();
        };
        piece.el.addEventListener('pointermove', move);
        piece.el.addEventListener('pointerup', up);
        piece.el.addEventListener('pointercancel', up);
      });
    }

    window.addEventListener('resize', layout);
    layout();
    updateStatus();
  });
}
