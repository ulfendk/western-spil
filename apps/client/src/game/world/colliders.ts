export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Simple circle colliders on the ground plane that keep the player out of things. */
export class Colliders {
  private circles: Circle[] = [];

  add(x: number, z: number, r: number) {
    this.circles.push({ x, z, r });
  }

  /** Pushes a point (with the given radius) out of every static and moving circle it overlaps. */
  resolve(pos: { x: number; z: number }, radius: number, dynamic: readonly Circle[] = []) {
    pushOut(pos, radius, this.circles);
    pushOut(pos, radius, dynamic);
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
