import * as THREE from 'three';
import { character } from '../models.js';
import type { Npc } from './npc.js';

/** How far a head may turn towards you before the whole body has to follow (radians). */
const HEAD_TURN = 0.6;

/**
 * A sculpted character (tools/models) as an NPC: breathes, turns towards the
 * player with the head first and the body after, and wiggles its beard if it has
 * one. Null when the models aren't loaded, so callers can fall back.
 */
export function sculptedNpc(name: string, turnSpeed = 4): Npc | null {
  const model = character(name);
  if (!model) return null;
  const npc = new THREE.Group() as Npc;
  npc.add(model);
  const body = model.getObjectByName('body') ?? model;
  const head = model.getObjectByName('head');
  const beard = model.getObjectByName('beard');
  const phase = Math.random() * 10;
  let target: THREE.Vector3 | null = null;
  /** When the parade last moved the limbs (then the idle breathing stays out of it). */
  let lastStep = -Infinity;
  npc.lookAtPlayer = (p) => (target = p);
  // Figures sculpted with separate limbs (soldiers) can march in step.
  const legs = ['leg_l', 'leg_r'].map((n) => model.getObjectByName(n));
  const arms = ['arm_l', 'arm_r'].map((n) => model.getObjectByName(n));
  if (legs[0] && legs[1] && arms[0] && arms[1]) {
    const [legL, legR, armL, armR] = [legs[0], legs[1], arms[0], arms[1]];
    (npc as Npc & { step(phase: number): void }).step = (p) => {
      lastStep = performance.now();
      const swing = Math.sin(p) * 0.5;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      body.position.y = Math.abs(Math.sin(p)) * 0.05;
    };
  }
  npc.update = (dt, time) => {
    if (performance.now() - lastStep > 250) body.position.y = Math.sin(time * 1.3 + phase) * 0.008;
    if (beard) beard.rotation.z = Math.sin(time * 0.8 + phase) * 0.04;
    let desired = 0;
    if (target) {
      const local = npc.worldToLocal(target.clone());
      desired = Math.atan2(-local.x, -local.z);
    }
    const ease = (speed: number) => 1 - Math.exp(-dt * speed);
    const bodyDiff = wrap(desired - body.rotation.y);
    // The head looks first; the body follows more slowly.
    body.rotation.y += bodyDiff * ease(turnSpeed * 0.6);
    if (head) {
      const want = THREE.MathUtils.clamp(wrap(desired - body.rotation.y), -HEAD_TURN, HEAD_TURN);
      head.rotation.y += (want - head.rotation.y) * ease(turnSpeed * 2);
      // A little nod now and then while listening.
      head.rotation.x = target ? Math.sin(time * 0.9 + phase) * 0.03 : 0;
    }
  };
  return npc;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
