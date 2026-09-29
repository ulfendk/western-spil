"""
Signed-distance sculpting for the game's people: shapes are added, carved and
painted in code, smoothly blended (smin) and meshed with marching cubes.

Every shape carries a colour and belongs to a part ("head", "body", "arm_l" …).
Parts are meshed separately (each with its own voxel size), so the game can
animate them. After meshing, each vertex takes the colour of the shape that
owns its surface; "paint" shapes only recolour (irises, lips, stripes).

Coordinates are Blender's: metres, Z up, the character faces +Y.
"""
import math

import numpy as np
from mathutils import Matrix, Vector

V = Vector


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def hex_rgb(h):
    """'#rrggbb' → (r, g, b) in 0..1 (sRGB, as painted)."""
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def rot(x=0.0, y=0.0, z=0.0):
    """Rotation matrix from Euler angles in degrees (XYZ)."""
    from mathutils import Euler

    return Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ").to_matrix()


def along(a, b):
    """Rotation taking local +Z onto a→b."""
    return V((0, 0, 1)).rotation_difference((V(b) - V(a)).normalized()).to_matrix()


class Prim:
    __slots__ = ("fn", "lo", "hi", "k", "op", "color", "part")

    def __init__(self, fn, lo, hi, k, op, color, part):
        self.fn, self.lo, self.hi, self.k, self.op = fn, V(lo), V(hi), k, op
        self.color = color
        self.part = part


def _local(X, Y, Z, c, R):
    """World → primitive-local coordinates (R maps local → world)."""
    px, py, pz = X - c.x, Y - c.y, Z - c.z
    return (
        R[0][0] * px + R[1][0] * py + R[2][0] * pz,
        R[0][1] * px + R[1][1] * py + R[2][1] * pz,
        R[0][2] * px + R[1][2] * py + R[2][2] * pz,
    )


def _bounds(c, R, half):
    corners = [R @ V((sx * half[0], sy * half[1], sz * half[2])) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    lo = V((min(p.x for p in corners), min(p.y for p in corners), min(p.z for p in corners)))
    hi = V((max(p.x for p in corners), max(p.y for p in corners), max(p.z for p in corners)))
    return c + lo, c + hi


class Sculpt:
    """Collects shapes. Set `part`, `color` and `k` (blend radius) before adding."""

    def __init__(self):
        self.prims = []
        self.part = "body"
        self.color = "#ff00ff"
        self.k = 0.01
        #: Eyeballs are built as real spheres (see build.py): round irises, crisp pupils.
        self.eyes = []
        #: Thin rings and rods (spectacles), also built as real meshes.
        self.rings = []
        #: Small round studs (buttons): real spheres, joined into their part.
        self.studs = []

    def _add(self, fn, lo, hi, op="add", k=None, color=None):
        self.prims.append(Prim(fn, lo, hi, self.k if k is None else k, op, color or self.color, self.part))

    # ------------------------------------------------------------ shapes

    def sphere(self, c, r, **kw):
        c = V(c)

        def fn(X, Y, Z):
            return np.sqrt((X - c.x) ** 2 + (Y - c.y) ** 2 + (Z - c.z) ** 2) - r

        self._add(fn, c - V((r, r, r)), c + V((r, r, r)), **kw)

    def ellipsoid(self, c, radii, R=None, **kw):
        c, R = V(c), R or Matrix.Identity(3)
        rx, ry, rz = radii

        def fn(X, Y, Z):
            x, y, z = _local(X, Y, Z, c, R)
            k0 = np.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2)
            k1 = np.sqrt((x / rx**2) ** 2 + (y / ry**2) ** 2 + (z / rz**2) ** 2)
            return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

        lo, hi = _bounds(c, R, radii)
        self._add(fn, lo, hi, **kw)

    def capsule(self, a, b, r1, r2=None, **kw):
        """A cone with rounded ends from a (radius r1) to b (radius r2)."""
        a, b = V(a), V(b)
        r2 = r1 if r2 is None else r2
        ba = b - a
        l2 = max(ba.dot(ba), 1e-12)
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2

        def fn(X, Y, Z):
            px, py, pz = X - a.x, Y - a.y, Z - a.z
            y = px * ba.x + py * ba.y + pz * ba.z
            z = y - l2
            xx = (px * l2 - ba.x * y) ** 2 + (py * l2 - ba.y * y) ** 2 + (pz * l2 - ba.z * y) ** 2
            y2 = y * y * l2
            z2 = z * z * l2
            k = np.sign(rr) * rr * rr * xx
            d_mid = (np.sqrt(xx * a2 * il2) + y * rr) * il2 - r1
            d_a = np.sqrt(xx + y2) * il2 - r1
            d_b = np.sqrt(xx + z2) * il2 - r2
            out = np.where(np.sign(z) * a2 * z2 > k, d_b, np.where(np.sign(y) * a2 * y2 < k, d_a, d_mid))
            return out

        r = max(r1, r2)
        lo = V((min(a.x, b.x) - r, min(a.y, b.y) - r, min(a.z, b.z) - r))
        hi = V((max(a.x, b.x) + r, max(a.y, b.y) + r, max(a.z, b.z) + r))
        self._add(fn, lo, hi, **kw)

    def box(self, c, half, R=None, rnd=0.004, **kw):
        c, R = V(c), R or Matrix.Identity(3)
        hx, hy, hz = (h - rnd for h in half)

        def fn(X, Y, Z):
            x, y, z = _local(X, Y, Z, c, R)
            qx, qy, qz = np.abs(x) - hx, np.abs(y) - hy, np.abs(z) - hz
            outside = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2 + np.maximum(qz, 0) ** 2)
            inside = np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0)
            return outside + inside - rnd

        lo, hi = _bounds(c, R, half)
        self._add(fn, lo, hi, **kw)

    def cylinder(self, a, b, r, rnd=0.003, **kw):
        """A capped cylinder from a to b with slightly rounded rims."""
        a, b = V(a), V(b)
        R = along(a, b)
        c = (a + b) / 2
        h = (b - a).length / 2 - rnd
        rr = r - rnd

        def fn(X, Y, Z):
            x, y, z = _local(X, Y, Z, c, R)
            dx = np.sqrt(x * x + y * y) - rr
            dz = np.abs(z) - h
            return np.minimum(np.maximum(dx, dz), 0) + np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dz, 0) ** 2) - rnd

        lo, hi = _bounds(c, R, (r, r, (b - a).length / 2))
        self._add(fn, lo, hi, **kw)

    def torus(self, c, major, minor, R=None, scale=(1, 1, 1), **kw):
        """A ring around local Z; `scale` stretches it into an oval."""
        c, R = V(c), R or Matrix.Identity(3)
        sx, sy, sz = scale

        def fn(X, Y, Z):
            x, y, z = _local(X, Y, Z, c, R)
            x, y, z = x / sx, y / sy, z / sz
            q = np.sqrt(x * x + y * y) - major
            return (np.sqrt(q * q + z * z) - minor) * min(scale)

        e = major + minor
        lo, hi = _bounds(c, R, (e * sx, e * sy, minor * sz))
        self._add(fn, lo, hi, **kw)

    def plane_cut(self, point, normal, lo, hi, **kw):
        """Removes everything on the `normal` side of a plane (within the box lo..hi)."""
        p, n = V(point), V(normal).normalized()

        def fn(X, Y, Z):
            return -((X - p.x) * n.x + (Y - p.y) * n.y + (Z - p.z) * n.z)

        self._add(fn, lo, hi, op="sub", **kw)

    # ------------------------------------------------------------ operations

    def carve(self, shape, *args, color=None, **kw):
        """Cut a shape away (eye sockets, mouth). Its surface gets `color` if given."""
        getattr(self, shape)(*args, op="sub", color=color or "", **kw)

    def paint(self, shape, *args, color, **kw):
        """Recolour whatever surface lies inside the shape; the geometry is unchanged."""
        getattr(self, shape)(*args, op="paint", color=color, k=0, **kw)

    # ------------------------------------------------------------ meshing

    def parts(self):
        seen = []
        for p in self.prims:
            if p.part not in seen:
                seen.append(p.part)
        return seen

    def field(self, part, voxel):
        prims = [p for p in self.prims if p.part == part and p.op != "paint"]
        adds = [p for p in prims if p.op == "add"]
        pad = 3 * voxel + max(p.k for p in prims)
        lo = V((min(p.lo.x for p in adds), min(p.lo.y for p in adds), min(p.lo.z for p in adds))) - V((pad,) * 3)
        hi = V((max(p.hi.x for p in adds), max(p.hi.y for p in adds), max(p.hi.z for p in adds))) + V((pad,) * 3)
        n = [int(math.ceil((hi[i] - lo[i]) / voxel)) + 1 for i in range(3)]
        axes = [np.float32(lo[i]) + np.arange(n[i], dtype=np.float32) * np.float32(voxel) for i in range(3)]
        D = np.full(n, 1.0, dtype=np.float32)
        for p in prims:
            m = p.k + 2 * voxel
            sl = []
            for i in range(3):
                i0 = max(0, int((p.lo[i] - m - lo[i]) / voxel))
                i1 = min(n[i], int((p.hi[i] + m - lo[i]) / voxel) + 2)
                sl.append(slice(i0, i1))
            if any(s.stop <= s.start for s in sl):
                continue
            X = axes[0][sl[0]][:, None, None]
            Y = axes[1][sl[1]][None, :, None]
            Z = axes[2][sl[2]][None, None, :]
            d = p.fn(X, Y, Z).astype(np.float32)
            block = D[sl[0], sl[1], sl[2]]
            D[sl[0], sl[1], sl[2]] = smax(block, -d, p.k) if p.op == "sub" else smin(block, d, p.k)
        return D, lo

    def colors(self, part, verts):
        """sRGB colour per vertex: the shape owning the surface, then carves, then paint."""
        P = np.asarray(verts, dtype=np.float64)
        X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
        prims = [p for p in self.prims if p.part == part]
        best = np.full(len(P), np.inf)
        col = np.zeros((len(P), 3))
        inside_any = np.full(len(P), np.inf)
        for p in prims:
            if p.op != "add":
                continue
            d = p.fn(X, Y, Z)
            better = d < best
            best = np.where(better, d, best)
            col[better] = hex_rgb(p.color)
            inside_any = np.minimum(inside_any, d)
        for p in prims:
            if p.op == "sub" and p.color:
                d = p.fn(X, Y, Z)
                # On the carved surface: at the cut, and inside the solid it was cut from.
                on_cut = (d > -0.004) & (d < 0.003) & (inside_any < -0.001)
                col[on_cut] = hex_rgb(p.color)
        for p in prims:
            if p.op == "paint":
                d = p.fn(X, Y, Z)
                col[d < 0] = hex_rgb(p.color)
        return col
