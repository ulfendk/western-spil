import * as THREE from 'three';
import { pickPosters } from '@western/shared';
import { beep } from '../audio/sfx.js';
import { wantedPosterMesh } from '../game/world/contestCorner.js';
import { h } from '../ui/dom.js';
import type { ContestContext } from './contest.js';

/**
 * How close you must be to tear a poster down. The posters hang on the front
 * walls, and the porches keep you about 3 m away from those.
 */
const REACH = 4.2;

/**
 * Efterlyst!: wanted posters of the Bøvl brothers hang on the town's walls (the
 * same walls for everyone). Walk around and tear them down with E or a tap.
 */
export async function playPosters(ctx: ContestContext): Promise<void> {
  const { game } = ctx;
  const spots = game.world.town.posterSpots ?? [];
  const picked = pickPosters(ctx.seed, spots.length);
  const group = new THREE.Group();
  group.name = 'wanted-posters';
  const posters = picked.map((spotIndex, i) => {
    const spot = spots[spotIndex]!;
    const mesh = wantedPosterMesh(i);
    mesh.scale.setScalar(1.3);
    mesh.position.copy(spot.pos);
    mesh.rotation.y = spot.ry;
    group.add(mesh);
    return { index: i, mesh, found: false };
  });
  game.addToScene(group);

  const touch = matchMedia('(pointer: coarse)').matches;
  const prompt = h(
    'button',
    { class: 'interact-prompt', hidden: true },
    `📜 Riv plakaten ned${touch ? '' : '  [E]'}`,
  );
  const hint = h(
    'div',
    { class: 'contest-hint' },
    `Find ${posters.length} efterlysninger på husenes mure!`,
  );
  document.body.append(prompt, hint);
  let near: (typeof posters)[number] | null = null;
  let found = 0;
  const tear = () => {
    if (!near || near.found) return;
    near.found = true;
    near.mesh.removeFromParent();
    found++;
    ctx.send({ type: 'found', poster: near.index });
    beep(900, 0.08, 0.12, 0, 'triangle');
    beep(1300, 0.12, 0.12, 0.08, 'triangle');
    hint.textContent =
      found >= posters.length ? 'Du fandt dem alle! 🎉' : `📜 ${found} af ${posters.length} fundet`;
    near = null;
    prompt.hidden = true;
  };
  prompt.onclick = tear;
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyE') tear();
  };
  window.addEventListener('keydown', onKey);
  game.lockInput(false);

  await new Promise<void>((resolve) => {
    const frame = () => {
      if (ctx.ended()) return resolve();
      const p = game.playerPosition;
      near = null;
      let best = REACH;
      for (const poster of posters) {
        if (poster.found) continue;
        const d = Math.hypot(poster.mesh.position.x - p.x, poster.mesh.position.z - p.z);
        if (d < best) {
          best = d;
          near = poster;
        }
      }
      prompt.hidden = !near;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  window.removeEventListener('keydown', onKey);
  game.lockInput(true);
  group.removeFromParent();
  prompt.remove();
  hint.remove();
}
