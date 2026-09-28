export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Rotated rectangle on the ground (buildings, troughs…). */
interface Box {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  cos: number;
  sin: number;
}

/** Simple circle and box colliders on the ground plane that keep the player out of things. */
export class Colliders {
  private circles: Circle[] = [];
  private boxes: Box[] = [];

  add(x: number, z: number, r: number) {
    this.circles.push({ x, z, r });
  }

  /** A w×d rectangle centred on (x, z), rotated by `rotY` (same as Object3D.rotation.y). */
  addBox(x: number, z: number, w: number, d: number, rotY: number) {
    this.boxes.push({ x, z, halfW: w / 2, halfD: d / 2, cos: Math.cos(rotY), sin: Math.sin(rotY) });
  }

  /** Pushes a point (with the given radius) out of every static and moving collider it overlaps. */
  resolve(pos: { x: number; z: number }, radius: number, dynamic: readonly Circle[] = []) {
    pushOut(pos, radius, this.circles);
    pushOut(pos, radius, dynamic);
    for (const b of this.boxes) pushOutOfBox(pos, radius, b);
  }
}

function pushOut(pos: { x: number; z: number }, radius: number, circles: readonly Circle[]) {
  for (const c of circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const min = c.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
}

function pushOutOfBox(pos: { x: number; z: number }, radius: number, b: Box) {
  // Into the box's local frame (inverse of a rotation about y).
  const dx = pos.x - b.x;
  const dz = pos.z - b.z;
  const lx = dx * b.cos - dz * b.sin;
  const lz = dx * b.sin + dz * b.cos;
  const ex = b.halfW + radius;
  const ez = b.halfD + radius;
  if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return;
  // Leave through the nearest side.
  let nx = lx;
  let nz = lz;
  if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex;
  else nz = Math.sign(lz || 1) * ez;
  // Back to world space.
  pos.x = b.x + nx * b.cos + nz * b.sin;
  pos.z = b.z - nx * b.sin + nz * b.cos;
}
