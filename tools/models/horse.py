"""
Kanel and the other horses, sculpted to fit the game's horse rig (buildHorse in
apps/client/src/game/world/animals.ts): the parts split at the same joints, so
the game's walking, grazing and tail swishes keep working.

Blender coordinates: metres, Z up, the horse faces +Y (glTF −Z), hooves at z = 0.
The rig's pivots (three.js → Blender: (x, y, z) → (x, −z, y)):
  body (0, 0, 1.45) · legs (±0.26, ±0.72, 1.2) · neck (0, 0.8, 1.62)
  head (0, 1.38, 2.44), tilted 0.75 rad nose-down · tail (0, −0.95, 1.62) · saddle at the origin
"""
import numpy as np
from mathutils import Vector

from characters import INK, ell_fn, intersect, minus, plane_fn, shade, shape
from sdf import V, rot

HEAD = V((0, 1.38, 2.44))
TILT = 0.75
#: The head's own axes: forward along the face, up over the forehead.
FWD = V((0, np.cos(TILT), -np.sin(TILT)))
UP = V((0, np.sin(TILT), np.cos(TILT)))
X = V((1, 0, 0))
LEGS = [(-0.26, 0.72), (0.26, 0.72), (-0.26, -0.7), (0.26, -0.7)]


def hp(x, f, u):
    """A point in the head's frame (x sideways, f along the face, u up)."""
    return HEAD + X * x + FWD * f + UP * u


def horse(s, coat, mane, muzzle, blaze=True, socks=True, saddle=True, sardonic=False, bridle="#8a2a22"):
    hoof = "#3a2a1a"
    # ---- body: barrel, deep chest, round rump, a hint of withers.
    s.part = "body"
    s.color = coat
    s.k = 0.06
    s.capsule(V((0, -0.55, 1.46)), V((0, 0.55, 1.47)), 0.43)
    s.sphere(V((0, 0.62, 1.52)), 0.46)
    s.sphere(V((0, -0.62, 1.55)), 0.47)
    s.ellipsoid(V((0, 0.05, 1.3)), (0.4, 0.62, 0.3), k=0.08)
    s.sphere(V((0, 0.5, 1.82)), 0.18, k=0.12)

    # ---- legs: the front ones straight, the hind ones with a hock bending back.
    for i, (x, y) in enumerate(LEGS):
        s.part = f"leg_{i}"
        s.color = coat
        s.k = 0.03
        front = y > 0
        top = V((x, y, 1.28))
        if front:
            knee = V((x, y + 0.02, 0.66))
            fet = V((x, y + 0.01, 0.2))
            s.capsule(top, knee, 0.15, 0.085)
            s.sphere(knee, 0.09)
        else:
            hock = V((x, y - 0.14, 0.7))
            fet = V((x, y - 0.06, 0.2))
            s.capsule(top + V((0, 0.05, 0)), hock, 0.17, 0.08)
            s.sphere(hock + V((0, -0.02, 0.02)), 0.085)
            knee = hock
        s.capsule(knee, fet, 0.07, 0.065)
        s.sphere(fet, 0.085)
        # Hoof: a short, flared cone.
        from characters import cone_fn

        s.k = 0.01
        shape(s, cone_fn(fet.x, fet.y + 0.02, 0.0, 0.15, 0.115, 0.085, rnd=0.015), (fet.x - 0.13, fet.y - 0.11, -0.01),
              (fet.x + 0.13, fet.y + 0.15, 0.16), color=hoof)
        if socks and front:
            s.paint("box", V((x, y, 0.3)), (0.13, 0.13, 0.15), color="#f5efe2")

    # ---- neck with a lumpy mane along the top.
    s.part = "neck"
    s.color = coat
    s.k = 0.08
    s.capsule(V((0, 0.62, 1.55)), V((0, 1.2, 2.3)), 0.3, 0.17)
    s.k = 0.03
    for t in np.linspace(0, 1, 9):
        p = V((0, 0.42 + t * 0.78, 1.88 + t * 0.62))
        s.sphere(p + V((0.02 * np.sin(t * 9), -0.06, 0.04)), 0.085 - t * 0.02, color=mane)

    # ---- head
    s.part = "head"
    s.color = coat
    s.k = 0.04
    s.ellipsoid(hp(0, 0.02, 0.02), (0.17, 0.22, 0.2), R=rot(np.degrees(-TILT), 0, 0))
    s.capsule(hp(0, 0.1, 0.0), hp(0, 0.5, -0.03), 0.16, 0.12)
    # The soft muzzle, lighter, with big nostrils and a crooked grin.
    s.sphere(hp(0, 0.58, -0.05), 0.145, color=muzzle, k=0.05)
    s.ellipsoid(hp(0, 0.56, -0.13), (0.12, 0.1, 0.06), color=muzzle, k=0.04)
    for sx in (-1, 1):
        s.carve("sphere", hp(sx * 0.065, 0.7, 0.0), 0.028, k=0.01)
    grin = [hp(x, 0.62 + abs(x) * -0.3, -0.13 + (0.02 if (x > 0 and sardonic) else 0) * (x / 0.1)) for x in (-0.1, -0.05, 0, 0.05, 0.1)]
    for a, b in zip(grin, grin[1:]):
        s.carve("capsule", a, b, 0.009, k=0.004)
        s.capsule(a + FWD * -0.005, b + FWD * -0.005, 0.006, color="#3a1a10", k=0)
    # Cheeks (the jaw) and a brow ridge over each eye.
    for sx in (-1, 1):
        s.sphere(hp(sx * 0.1, 0.0, -0.1), 0.1, k=0.05)
        s.capsule(hp(sx * 0.1, 0.1, 0.18), hp(sx * 0.15, 0.02, 0.16), 0.03, k=0.03)
    # Eyes: big, a little to the front, with lids (heavy when Kanel is being Kanel).
    # Cartoon horse eyes: big, bulging from the front of the face, close to the top.
    eye_r = 0.058
    lids = 0.3 if sardonic else 0.08
    for sx in (-1, 1):
        c = hp(sx * 0.108, 0.14, 0.115)
        look = (X * sx * 0.3 + FWD * 0.9 + UP * 0.12).normalized()
        s.eyes.append(dict(center=c, radius=eye_r, iris="#3a2214", side=sx, style="round", look=look))
        R = eye_r + 0.005
        n = (UP * 1.0 - look * 0.3 + X * sx * 0.1).normalized()
        h = R * (0.62 - lids * 1.25)
        shell = minus(ell_fn(c, (R, R, R)), ell_fn(c, (eye_r * 0.96,) * 3))
        shape(s, intersect(shell, plane_fn(c + n * h, n)), c - V((R, R, R)), c + V((R, R, R)), color=coat, k=0.002)
        u = n.cross(X).normalized()
        if u.dot(look) < 0:
            u = -u
        w = n.cross(u).normalized()
        rho = np.sqrt(max(R * R - h * h, 1e-8))
        arc = [c + n * h + (u * np.cos(p) + w * np.sin(p)) * (rho + 0.001) for p in np.linspace(-1.35, 1.35, 9)]
        for a, b in zip(arc, arc[1:]):
            s.capsule(a, b, 0.0065, color=INK, k=0.001)
        # Ears: leaf shapes, pricked up and a little back, hollow inside.
        base = hp(sx * 0.1, -0.08, 0.2)
        tip = base + UP * 0.2 + X * sx * 0.06 - FWD * 0.06
        s.capsule(base, tip, 0.055, 0.012, color=coat, k=0.02)
        s.carve("capsule", base + FWD * 0.03 + UP * 0.03, tip + FWD * 0.01 - UP * 0.02, 0.028, 0.006, color=shade(coat, 0.7), k=0.006)
    # Forelock tufts falling over the forehead.
    for i, (x, f, u) in enumerate(((0, 0.02, 0.22), (-0.05, 0.08, 0.19), (0.05, 0.07, 0.19), (0, 0.13, 0.17))):
        s.sphere(hp(x, f, u), 0.06 - i * 0.006, color=mane, k=0.02)
    if blaze:
        s.paint("capsule", hp(0, 0.1, 0.19), hp(0, 0.58, 0.07), 0.045, 0.06, color="#f5efe2")
    # Bridle (Kanel) or a rope halter: a noseband and cheek straps.
    s.k = 0.004
    band = hp(0, 0.4, -0.02)
    s.torus(band, 0.145, 0.016, R=rot(np.degrees(-TILT) - 90, 0, 0), scale=(1.0, 1.05, 1.0), color=bridle)
    for sx in (-1, 1):
        s.capsule(hp(sx * 0.14, 0.4, 0.0), hp(sx * 0.15, -0.05, 0.12), 0.014, color=bridle)

    # ---- tail: a dock, then long hair falling to the hocks.
    s.part = "tail"
    s.color = mane
    s.k = 0.04
    s.capsule(V((0, -0.95, 1.62)), V((0, -1.08, 1.45)), 0.08, 0.075)
    for t in np.linspace(0, 1, 7):
        s.sphere(V((0.02 * np.sin(t * 7), -1.1 - t * 0.08, 1.4 - t * 0.62)), 0.08 + t * 0.04)

    # ---- saddle: blanket draped over the back, seat, horn, stirrups.
    if saddle:
        s.part = "saddle"
        barrel = ell_fn(V((0, 0.02, 1.47)), (0.46, 0.56, 0.46))
        blanket = intersect(
            minus(ell_fn(V((0, 0.02, 1.47)), (0.49, 0.59, 0.49)), barrel),
            lambda X_, Y, Z: np.abs(Y - 0.02) - 0.34,
            plane_fn(V((0, 0, 1.36)), (0, 0, 1)),
        )
        shape(s, blanket, (-0.5, -0.35, 1.3), (0.5, 0.4, 1.98), color="#c8553d", k=0.004)
        edge = lambda X_, Y, Z: np.maximum(np.abs(np.abs(Y - 0.02) - 0.31) - 0.025, -(Z - 1.36))  # noqa: E731
        shape(s, intersect(edge, lambda X_, Y, Z: blanket(X_, Y, Z) - 0.012), (-0.5, -0.35, 1.3), (0.5, 0.4, 1.98),
              op="paint", color="#f3ecdc", k=0)
        s.k = 0.02
        s.ellipsoid(V((0, 0.02, 1.95)), (0.24, 0.3, 0.07), color="#6b3a1a")
        s.ellipsoid(V((0, -0.2, 2.0)), (0.2, 0.08, 0.09), color="#6b3a1a")
        s.cylinder(V((0, 0.26, 1.95)), V((0, 0.28, 2.1)), 0.035, rnd=0.01, color="#6b3a1a", k=0.01)
        s.sphere(V((0, 0.28, 2.11)), 0.05, color="#5a2e14", k=0.005)
        for sx in (-1, 1):
            s.capsule(V((sx * 0.4, 0.02, 1.8)), V((sx * 0.47, 0.02, 1.34)), 0.02, color="#4a2a14", k=0.004)
            s.torus(V((sx * 0.48, 0.02, 1.3)), 0.06, 0.016, R=rot(0, 90, 0), color="#3a3330", k=0.003)

    pivots = dict(body=V((0, 0, 1.45)), neck=V((0, 0.8, 1.62)), head=HEAD, tail=V((0, -0.95, 1.62)), saddle=V((0, 0, 0)))
    parents = dict(head="neck")
    for i, (x, y) in enumerate(LEGS):
        pivots[f"leg_{i}"] = V((x, y, 1.2))
    return dict(
        pivots=pivots,
        parents=parents,
        preview_face=(hp(0, 0.3, 0.05), 1.7),
        preview_body=(V((0, 0.2, 1.3)), 5.2),
        voxel=dict(head=0.003, body=0.009, neck=0.008, tail=0.007, saddle=0.006,
                   **{f"leg_{i}": 0.006 for i in range(4)}),
        tris=dict(head=(7000, 1000), body=(3000, 500), neck=(2000, 350), tail=(1200, 200), saddle=(2400, 400),
                  **{f"leg_{i}": (1300, 250) for i in range(4)}),
    )


HORSES = {
    "kanel": lambda s: horse(s, "#b5652b", "#4a2a14", "#d9a070", sardonic=True),
    "horse-bay": lambda s: horse(s, "#6b4423", "#2a1a10", "#8a6040", blaze=False, socks=False, saddle=False, bridle="#c8b890"),
    "horse-white": lambda s: horse(s, "#e9dfc4", "#c8c0a8", "#d8c8b0", blaze=False, socks=False, saddle=False, bridle="#8a6a44"),
    "horse-black": lambda s: horse(s, "#3a2a1e", "#1a1210", "#5a4638", blaze=True, socks=True, saddle=False, bridle="#c8b890"),
    "horse-dun": lambda s: horse(s, "#a0703a", "#3a2a1a", "#c89a68", blaze=False, socks=True, saddle=False, bridle="#8a6a44"),
}
