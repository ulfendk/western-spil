"""
The other animals: bison, longhorn cattle, vultures and prairie dogs, sculpted
to replace the primitive ones in apps/client/src/game/world/animals.ts (and the
prairie dogs in regions/fortet.ts). They face +Y here (glTF −Z), feet at z = 0.
Bison, cattle and prairie dogs move as a whole; the vultures flap their wings
(parts wing_l and wing_r, hinged at the shoulders).
"""
import numpy as np

from characters import INK, cone_fn, ell_fn, intersect, minus, plane_fn, shade, shape
from sdf import V, rot


def animal_eye(s, c, r, look, lids, lid_color, side, iris="#2a1a10"):
    """An eyeball (built as a real sphere) with a lid of fur/skin coming down over it."""
    look = V(look).normalized()
    s.eyes.append(dict(center=V(c), radius=r, iris=iris, side=side, style="round", look=look))
    R = r * 1.12
    n = (V((0, 0, 1)) - look * 0.3).normalized()
    h = R * (0.62 - lids * 1.25)
    shell = minus(ell_fn(c, (R, R, R)), ell_fn(c, (r * 0.96,) * 3))
    shape(s, intersect(shell, plane_fn(V(c) + n * h, n)), V(c) - V((R, R, R)), V(c) + V((R, R, R)), color=lid_color, k=0.001)
    u = n.cross(V((1, 0, 0))).normalized()
    if u.dot(look) < 0:
        u = -u
    w = n.cross(u).normalized()
    rho = np.sqrt(max(R * R - h * h, 1e-8))
    arc = [V(c) + n * h + (u * np.cos(p) + w * np.sin(p)) * (rho + 0.0008) for p in np.linspace(-1.3, 1.3, 7)]
    for a, b in zip(arc, arc[1:]):
        s.capsule(a, b, r * 0.13, color=INK, k=0.0005)


def bison(s):
    """A big, shaggy, sleepy-eyed plains bison."""
    fur, shag, horn = "#6a4428", "#3d2614", "#e8dcc0"
    s.part = "body"
    s.color = fur
    s.k = 0.12
    # Hindquarters, a huge shaggy front and the hump over the shoulders.
    s.ellipsoid(V((0, -0.55, 1.2)), (0.55, 0.7, 0.55))
    s.color = shag
    s.ellipsoid(V((0, 0.45, 1.4)), (0.72, 0.8, 0.85))
    s.sphere(V((0, 0.25, 2.05)), 0.55, k=0.25)
    rng = np.random.default_rng(7)
    for _ in range(26):
        a = rng.uniform(-1.3, 1.3)
        p = V((np.sin(a) * 0.62, 0.4 + rng.uniform(-0.4, 0.5), 1.3 + np.cos(a) * 0.62 + rng.uniform(-0.2, 0.3)))
        s.sphere(p, rng.uniform(0.14, 0.22), k=0.08)
    # Legs: short and sturdy, shaggy "trousers" on the front ones.
    s.k = 0.05
    for x, y, front in ((-0.3, 0.55, True), (0.3, 0.55, True), (-0.28, -0.75, False), (0.28, -0.75, False)):
        s.capsule(V((x, y, 1.0)), V((x, y + 0.02, 0.45)), 0.2 if front else 0.18, 0.1, color=shag if front else fur)
        s.capsule(V((x, y + 0.02, 0.45)), V((x, y + 0.03, 0.1)), 0.09, 0.085, color=fur)
        shape(s, cone_fn(x, y + 0.05, 0.0, 0.12, 0.12, 0.095, rnd=0.015), (x - 0.14, y - 0.1, -0.01), (x + 0.14, y + 0.2, 0.13),
              color="#2a1a10", k=0.01)
    # Head held low, a thick beard, small curved horns.
    s.color = shag
    s.k = 0.08
    head = V((0, 1.3, 1.05))
    s.ellipsoid(head, (0.36, 0.42, 0.4))
    s.ellipsoid(head + V((0, 0.28, -0.12)), (0.25, 0.22, 0.24), color=fur, k=0.08)
    s.sphere(head + V((0, 0.38, -0.2)), 0.16, color="#4a3222", k=0.06)
    for sx in (-1, 1):
        s.carve("sphere", head + V((sx * 0.07, 0.53, -0.22)), 0.035, k=0.01)
    s.capsule(head + V((0, 0.1, -0.35)), head + V((0, 0.15, -0.72)), 0.2, 0.08, k=0.08)
    for sx in (-1, 1):
        base = head + V((sx * 0.3, -0.02, 0.22))
        s.capsule(base, base + V((sx * 0.14, 0.05, 0.1)), 0.06, 0.045, color=horn, k=0.02)
        s.capsule(base + V((sx * 0.14, 0.05, 0.1)), base + V((sx * 0.16, 0.12, 0.24)), 0.045, 0.015, color=horn, k=0.01)
        animal_eye(s, head + V((sx * 0.25, 0.28, 0.06)), 0.045, (sx * 0.7, 0.7, 0.05), 0.4, shag, sx)
    # A short tail with a tuft.
    s.capsule(V((0, -1.2, 1.45)), V((0, -1.3, 0.95)), 0.05, 0.04, color=fur, k=0.03)
    s.sphere(V((0, -1.31, 0.9)), 0.08, color=shag, k=0.03)
    return dict(pivots=dict(body=V((0, 0, 0))), parents={}, voxel=dict(body=0.012), tris=dict(body=(6000, 800)),
                preview_face=(head + V((0, 0.3, 0)), 2.2), preview_body=(V((0, 0, 1.2)), 6.5))


def cow(s, coat, patch):
    """A Texas longhorn: wide horns, a pink muzzle and a patchy coat."""
    s.part = "body"
    s.color = coat
    s.k = 0.08
    s.capsule(V((0, -0.55, 1.1)), V((0, 0.55, 1.12)), 0.45, 0.42)
    s.ellipsoid(V((0, 0.05, 0.92)), (0.4, 0.6, 0.28), k=0.12)
    s.sphere(V((0, 0.55, 1.45)), 0.2, k=0.2)
    if patch:
        for p, r in ((V((0.32, 0.25, 1.3)), 0.28), (V((-0.3, -0.35, 1.2)), 0.3), (V((0.1, -0.6, 1.5)), 0.22)):
            s.paint("sphere", p, r, color=patch)
    s.k = 0.04
    for x, y in ((-0.24, 0.5), (0.24, 0.5), (-0.24, -0.55), (0.24, -0.55)):
        s.capsule(V((x, y, 0.95)), V((x, y, 0.1)), 0.1, 0.065)
        shape(s, cone_fn(x, y + 0.02, 0.0, 0.1, 0.085, 0.07, rnd=0.012), (x - 0.1, y - 0.08, -0.01), (x + 0.1, y + 0.12, 0.11),
              color="#2a1a10", k=0.008)
    # Head with a long face, pink wet muzzle, big sleepy eyes and ears out sideways.
    head = V((0, 1.05, 1.25))
    s.k = 0.06
    s.capsule(head, head + V((0, 0.36, -0.14)), 0.2, 0.15)
    s.ellipsoid(head + V((0, 0.44, -0.18)), (0.16, 0.12, 0.13), color="#e0b8a0", k=0.05)
    for sx in (-1, 1):
        s.carve("sphere", head + V((sx * 0.06, 0.55, -0.16)), 0.028, k=0.008)
        s.ellipsoid(head + V((sx * 0.24, -0.02, 0.05)), (0.12, 0.05, 0.06), R=rot(0, sx * 20, 0), k=0.03)
        animal_eye(s, head + V((sx * 0.14, 0.1, 0.09)), 0.042, (sx * 0.8, 0.6, 0.0), 0.38, coat, sx)
        # The famous horns: out, then up at the tips.
        base = head + V((sx * 0.15, -0.05, 0.16))
        mid = base + V((sx * 0.45, 0.02, 0.02))
        tip = mid + V((sx * 0.3, 0.05, 0.2))
        s.capsule(base, mid, 0.05, 0.035, color="#efe6cf", k=0.02)
        s.capsule(mid, tip, 0.035, 0.01, color="#efe6cf", k=0.01)
    s.capsule(V((0, -0.95, 1.3)), V((0, -1.02, 0.6)), 0.03, color=coat, k=0.02)
    s.sphere(V((0, -1.02, 0.55)), 0.06, color=shade(coat, 0.6), k=0.02)
    return dict(pivots=dict(body=V((0, 0, 0))), parents={}, voxel=dict(body=0.01), tris=dict(body=(4500, 650)),
                preview_face=(head + V((0, 0.25, 0)), 2.0), preview_body=(V((0, 0, 1.0)), 5.0))


def vulture(s):
    """A turkey vulture: black feathers, a bald red head, wings hinged at the shoulders."""
    dark, head_c = "#1f1a17", "#b8483a"
    s.part = "body"
    s.color = dark
    s.k = 0.03
    s.ellipsoid(V((0, 0, 0)), (0.13, 0.32, 0.12))
    s.capsule(V((0, 0.25, 0.02)), V((0, 0.36, 0.06)), 0.07, 0.05)
    s.sphere(V((0, 0.42, 0.07)), 0.055, color=head_c, k=0.02)
    s.capsule(V((0, 0.46, 0.07)), V((0, 0.52, 0.04)), 0.022, 0.01, color="#f0e0c0", k=0.008)
    for sx in (-1, 1):
        animal_eye(s, V((sx * 0.035, 0.44, 0.09)), 0.012, (sx * 0.8, 0.6, 0.0), 0.3, head_c, sx)
    # A fanned tail.
    shape(s, intersect(ell_fn(V((0, -0.38, 0)), (0.16, 0.16, 0.02)), plane_fn(V((0, -0.3, 0)), (0, -1, 0))),
          (-0.17, -0.55, -0.03), (0.17, -0.3, 0.03), color=dark, k=0.02)
    # Wings: long, flat, with "fingers" at the tips.
    for sx, side in ((-1, "l"), (1, "r")):
        s.part = f"wing_{side}"
        s.color = dark
        s.k = 0.02
        s.ellipsoid(V((sx * 0.45, 0.0, 0.0)), (0.42, 0.17, 0.025))
        for i in range(4):
            s.capsule(V((sx * 0.8, 0.08 - i * 0.05, 0)), V((sx * (1.0 - i * 0.02), 0.1 - i * 0.07, 0.0)), 0.02, 0.012,
                      color=shade(dark, 1.3), k=0.01)
    s.part = "body"
    return dict(
        pivots=dict(body=V((0, 0, 0)), wing_l=V((-0.1, 0, 0)), wing_r=V((0.1, 0, 0))),
        parents=dict(wing_l="body", wing_r="body"),
        voxel=dict(body=0.006, wing_l=0.008, wing_r=0.008),
        tris=dict(body=(1800, 300), wing_l=(700, 120), wing_r=(700, 120)),
        preview_face=(V((0, 0.4, 0.07)), 0.6), preview_body=(V((0, 0, 0)), 3.0),
    )


def prairie_dog(s):
    """A prairie dog standing up to look around: big eyes, tiny paws, buck teeth."""
    fur, belly = "#c49a62", "#e8d6b0"
    s.part = "body"
    s.color = fur
    s.k = 0.03
    s.ellipsoid(V((0, 0, 0.2)), (0.12, 0.11, 0.2))
    s.paint("ellipsoid", V((0, 0.07, 0.2)), (0.08, 0.06, 0.15), color=belly)
    s.sphere(V((0, 0.01, 0.44)), 0.1, k=0.05)
    s.sphere(V((0, 0.08, 0.42)), 0.055, color=belly, k=0.03)
    s.sphere(V((0, 0.125, 0.43)), 0.018, color="#3a2218", k=0.005)
    s.box(V((0, 0.12, 0.385)), (0.014, 0.006, 0.014), rnd=0.003, color="#f7f3ea", k=0.002)
    for sx in (-1, 1):
        animal_eye(s, V((sx * 0.05, 0.07, 0.47)), 0.022, (sx * 0.6, 0.8, 0.0), 0.05, fur, sx)
        s.sphere(V((sx * 0.07, -0.02, 0.52)), 0.025, k=0.01)
        s.capsule(V((sx * 0.05, 0.08, 0.3)), V((sx * 0.03, 0.12, 0.26)), 0.022, 0.018, k=0.015)
    return dict(pivots=dict(body=V((0, 0, 0))), parents={}, voxel=dict(body=0.004), tris=dict(body=(1500, 250)),
                preview_face=(V((0, 0.05, 0.44)), 0.5), preview_body=(V((0, 0, 0.25)), 1.4))


def coyote(s):
    """A lean, big-eared, cheeky coyote. Parts split like the horse (legs, head, tail) so it can trot and howl."""
    fur, back, rust, pale, dark = "#9c8062", "#5e4a38", "#b8703a", "#eadcc0", "#3a2a1e"
    s.part = "body"
    s.color = fur
    s.k = 0.05
    # A long, lean body, deeper at the chest, with a darker saddle along the back.
    s.capsule(V((0, -0.36, 0.56)), V((0, 0.32, 0.6)), 0.14, 0.17)
    s.sphere(V((0, 0.36, 0.62)), 0.15, k=0.08)
    s.capsule(V((0, 0.4, 0.66)), V((0, 0.5, 0.8)), 0.1, 0.08, k=0.06)
    s.paint("ellipsoid", V((0, -0.02, 0.76)), (0.12, 0.46, 0.08), color=back)
    s.paint("ellipsoid", V((0, 0.3, 0.46)), (0.1, 0.2, 0.1), color=pale)
    s.paint("ellipsoid", V((0, 0.46, 0.7)), (0.07, 0.07, 0.1), color=pale)
    legs = [(-0.09, 0.3), (0.09, 0.3), (-0.09, -0.34), (0.09, -0.34)]
    for i, (x, y) in enumerate(legs):
        s.part = f"leg_{i}"
        s.color = rust
        s.k = 0.02
        top = V((x, y, 0.5))
        if y > 0:
            s.capsule(top, V((x, y + 0.02, 0.22)), 0.055, 0.032, color=fur)
            s.capsule(V((x, y + 0.02, 0.22)), V((x, y + 0.03, 0.03)), 0.032, 0.027)
        else:
            hock = V((x, y - 0.08, 0.24))
            s.capsule(top + V((0, 0.03, 0.02)), hock, 0.075, 0.032, color=fur)
            s.capsule(hock, V((x, y - 0.04, 0.03)), 0.03, 0.027)
        s.ellipsoid(V((x, y + 0.045, 0.022)), (0.032, 0.05, 0.022), color=dark, k=0.01)
    # Head: a long, pointed muzzle, big rusty ears, amber eyes with a sly lid.
    s.part = "head"
    s.color = fur
    s.k = 0.03
    H = V((0, 0.55, 0.88))
    s.sphere(H, 0.09)
    s.capsule(H + V((0, 0.04, -0.02)), H + V((0, 0.24, -0.06)), 0.058, 0.022)
    s.paint("ellipsoid", H + V((0, 0.14, -0.075)), (0.05, 0.12, 0.035), color=pale)
    s.paint("sphere", H + V((0, -0.02, 0.07)), 0.07, color=back)
    s.sphere(H + V((0, 0.255, -0.055)), 0.014, color="#1b1410", k=0.004)
    for sx in (-1, 1):
        base = H + V((sx * 0.05, -0.02, 0.06))
        tip = base + V((sx * 0.045, -0.025, 0.16))
        s.capsule(base, tip, 0.045, 0.008, color=rust, k=0.015)
        s.carve("capsule", base + V((0, 0.02, 0.01)), tip + V((0, 0.012, -0.01)), 0.024, 0.004, color=pale, k=0.005)
        animal_eye(s, H + V((sx * 0.045, 0.07, 0.025)), 0.02, (sx * 0.45, 0.9, 0.05), 0.32, fur, sx, iris="#c8902a")
    # A bushy tail with a black tip, held low.
    s.part = "tail"
    s.color = fur
    s.k = 0.03
    base = V((0, -0.48, 0.6))
    s.capsule(base, base + V((0, -0.14, -0.14)), 0.045, 0.07)
    s.capsule(base + V((0, -0.14, -0.14)), base + V((0, -0.2, -0.32)), 0.07, 0.045)
    s.sphere(base + V((0, -0.21, -0.35)), 0.045, color=dark)
    pivots = dict(body=V((0, 0, 0)), head=H + V((0, -0.08, -0.06)), tail=base)
    parents = dict(head="body", tail="body")
    for i, (x, y) in enumerate(legs):
        pivots[f"leg_{i}"] = V((x, y, 0.5))
        parents[f"leg_{i}"] = "body"
    return dict(pivots=pivots, parents=parents,
                voxel=dict(body=0.006, head=0.003, tail=0.005, **{f"leg_{i}": 0.004 for i in range(4)}),
                tris=dict(body=(2200, 350), head=(2600, 400), tail=(700, 120), **{f"leg_{i}": (500, 100) for i in range(4)}),
                preview_face=(H + V((0, 0.1, 0)), 0.8), preview_body=(V((0, 0, 0.5)), 2.2))


ANIMALS = {
    "coyote": coyote,
    "bison": bison,
    "cow-a": lambda s: cow(s, "#b5652b", "#f3ecdc"),
    "cow-b": lambda s: cow(s, "#e9dfc4", "#3d2614"),
    "cow-c": lambda s: cow(s, "#5b3a22", None),
    "vulture": vulture,
    "prairie-dog": prairie_dog,
}
