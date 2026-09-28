/** Simple circle colliders on the ground plane that keep the player out of props. */
export class Colliders {
  private circles: { x: number; z: number; r: number }[] = [];

  add(x: number, z: number, r: number) {
    this.circles.push({ x, z, r });
  }

  /** Pushes a point (with the given radius) out of every static circle it overlaps. */
  resolve(
    pos: { x: number; z: number },
    radius: number,
    dynamic: { x: number; z: number; r: number }[] = [],
  ) {
    for (const c of [...this.circles, ...dynamic]) {
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
}
