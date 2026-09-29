"""
The game's people, sculpted from code: a parametric comic head and a few body
types (coat, dress, uniform …). Each character is a function that fills a
Sculpt and returns its rig: where each part pivots and what it hangs from.

Blender coordinates: metres, Z up, the character faces +Y, feet at z = 0.
"""
import numpy as np
from mathutils import Matrix, Vector

from sdf import Sculpt, V, rot

INK = "#1e140c"
WHITE_EYE = "#f7f4ec"


def shade(hex_color, f):
    """Darker (f < 1) or lighter (f > 1) version of a colour."""
    h = hex_color.lstrip("#")
    rgb = [int(h[i : i + 2], 16) for i in (0, 2, 4)]
    if f < 1:
        rgb = [int(c * f) for c in rgb]
    else:
        rgb = [int(c + (255 - c) * (f - 1)) for c in rgb]
    return "#" + "".join(f"{max(0, min(255, c)):02x}" for c in rgb)


def clipped_ellipsoid(s, c, radii, keep_point, keep_normal, R=None, **kw):
    """An ellipsoid cut by a plane: only the part on the `keep_normal` side remains."""
    c, R = V(c), R or Matrix.Identity(3)
    p, n = V(keep_point), V(keep_normal).normalized()
    rx, ry, rz = radii

    def fn(X, Y, Z):
        px, py, pz = X - c.x, Y - c.y, Z - c.z
        x = R[0][0] * px + R[1][0] * py + R[2][0] * pz
        y = R[0][1] * px + R[1][1] * py + R[2][1] * pz
        z = R[0][2] * px + R[1][2] * py + R[2][2] * pz
        k0 = np.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2)
        k1 = np.sqrt((x / rx**2) ** 2 + (y / ry**2) ** 2 + (z / rz**2) ** 2)
        ell = k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
        plane = -((X - p.x) * n.x + (Y - p.y) * n.y + (Z - p.z) * n.z)
        return np.maximum(ell, plane)

    e = max(radii)
    s._add(fn, c - V((e, e, e)), c + V((e, e, e)), **kw)


# ---------------------------------------------------------------------------- composable shapes
# Functions of (X, Y, Z) → signed distance, for shells and cut-outs that must not
# carve anything else (a bonnet's opening, a hat's hollow, a blanket's front).


def ell_fn(c, radii, R=None):
    c, R = V(c), R or Matrix.Identity(3)
    rx, ry, rz = radii

    def fn(X, Y, Z):
        px, py, pz = X - c.x, Y - c.y, Z - c.z
        x = R[0][0] * px + R[1][0] * py + R[2][0] * pz
        y = R[0][1] * px + R[1][1] * py + R[2][1] * pz
        z = R[0][2] * px + R[1][2] * py + R[2][2] * pz
        k0 = np.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2)
        k1 = np.sqrt((x / rx**2) ** 2 + (y / ry**2) ** 2 + (z / rz**2) ** 2)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

    return fn


def plane_fn(point, normal):
    """Negative on the side the normal points to (that side is kept)."""
    p, n = V(point), V(normal).normalized()
    return lambda X, Y, Z: -((X - p.x) * n.x + (Y - p.y) * n.y + (Z - p.z) * n.z)


def cone_fn(cx, cy, z0, z1, r0, r1, rnd=0.0):
    """An upright capped cone: radius r0 at height z0, r1 at z1, rounded edges."""
    h = (z1 - z0) / 2 - rnd
    zc = (z0 + z1) / 2
    ra, rb = r0 - rnd, r1 - rnd
    k2x, k2y = rb - ra, 2 * h

    def fn(X, Y, Z):
        qx = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        qy = Z - zc
        cax = qx - np.minimum(qx, np.where(qy < 0, ra, rb))
        cay = np.abs(qy) - h
        t = np.clip(((rb - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y), 0, 1)
        cbx = qx - rb + k2x * t
        cby = qy - h + k2y * t
        sgn = np.where((cbx < 0) & (cay < 0), -1.0, 1.0)
        return sgn * np.sqrt(np.minimum(cax * cax + cay * cay, cbx * cbx + cby * cby)) - rnd

    return fn


def intersect(*fns):
    def fn(X, Y, Z):
        d = fns[0](X, Y, Z)
        for g in fns[1:]:
            d = np.maximum(d, g(X, Y, Z))
        return d

    return fn


def minus(a, b):
    return lambda X, Y, Z: np.maximum(a(X, Y, Z), -b(X, Y, Z))


def shape(s, fn, lo, hi, **kw):
    s._add(fn, V(lo), V(hi), **kw)


# ---------------------------------------------------------------------------- heads


def head(s, H, f):
    """
    A comic head centred at H. `f` holds the face:
      skin, size
      shape      skull (width, depth, height) multipliers, e.g. (1.08, 1, 0.94) for a wide head
      face_len   lower face length (1 = normal, 1.25 = long, 0.85 = short)
      jaw        jaw width;  chin ('round' | 'square' | 'pointy' | 'double'), chin_size
      cheekbones 0..1 high, wide cheekbones
      nose       'round' | 'long' | 'button' | 'hook';  nose_size, nose_tint
      eyes       iris colour;  eye_size, eye_gap (spacing), eye_style ('round' | 'dot')
      lids       0..0.7 how far the upper eyelids come down (sleepy, wise, sceptical)
      lid_tilt   -1..1 outer corners down (sad, kind) or up (sly)
      lower_lid  0..0.3;  bags (age);  lashes (bool);  gaze (x, z) where the eyes look
      brows      colour;  brow_w (thickness), brow_tilt (+ angry, - worried), brow_lift
      hair, hair_style ('short' | 'fringe' | 'bun' | 'braids' | 'long' | 'bald' | 'none')
      beard ('full' | 'short' | 'goatee'), beard_color, beard_part
      moustache ('walrus' | 'handlebar' | 'thin'), moustache_color
      glasses, cheeks (blush colour), freckles, lips, smile (-1..1), age (0..1), ears (size)
    """
    z = f.get("size", 1.0)
    skin = f["skin"]
    hair = f.get("hair", "#5e3a1a")
    jaw = f.get("jaw", 1.0)
    L = f.get("face_len", 1.0)
    sw, sd, sh = f.get("shape", (1.0, 1.0, 1.0))

    def P(x, y, zz):
        return V(H) + V((x * z, y * z, zz * z))

    s.part = "head"
    s.color = skin
    s.k = 0.02 * z
    # Cranium, lower face, cheeks, chin and neck, softly blended.
    s.ellipsoid(P(0, -0.008, 0.02), (0.104 * z * sw, 0.114 * z * sd, 0.124 * z * sh))
    s.ellipsoid(P(0, 0.024, -0.052 * L), (0.086 * z * jaw, 0.088 * z, 0.072 * z * L))
    cb = f.get("cheekbones", 0.0)
    for sx in (-1, 1):
        s.sphere(P(sx * (0.054 + cb * 0.012), 0.066, -0.028 + cb * 0.012), (0.037 + cb * 0.004) * z, k=0.025 * z)
    chin = f.get("chin", "round")
    cs = f.get("chin_size", 1.0)
    cz = -0.098 * L
    if chin == "square":
        s.box(P(0, 0.066, cz), (0.045 * z * cs * jaw, 0.03 * z, 0.026 * z * cs), rnd=0.018 * z, k=0.02 * z)
    elif chin == "pointy":
        s.capsule(P(0, 0.06, cz + 0.02), P(0, 0.082, cz - 0.012), 0.03 * z * cs, 0.015 * z * cs, k=0.02 * z)
    else:
        s.sphere(P(0, 0.07, cz), 0.031 * z * cs)
        if chin == "double":
            s.ellipsoid(P(0, 0.05, cz - 0.03), (0.06 * z, 0.05 * z, 0.03 * z), k=0.025 * z)
    s.capsule(P(0, -0.012, -0.07 * L), P(0, -0.022, -0.21 * L), 0.05 * z, 0.056 * z, k=0.03 * z)
    # Brow ridge.
    s.capsule(P(-0.048, 0.094, 0.036), P(0.048, 0.094, 0.036), 0.017 * z, k=0.018 * z)

    # Eyes: sockets carved into the face with real eyeballs set in (see build.py),
    # eyelids of skin that can come down over them, and a dark lid line on the edge.
    style = f.get("eye_style", "round")
    eye_r = (0.0125 if style == "dot" else 0.0225) * z * f.get("eye_size", 1.0)
    gap = f.get("eye_gap", 1.0)
    lids = f.get("lids", 0.0)
    tilt = f.get("lid_tilt", 0.0)
    gx, gz = f.get("gaze", (0.0, 0.0))
    for sx in (-1, 1):
        ex = sx * 0.041 * gap
        # (No tint in the socket: the baked occlusion shades it more cleanly.)
        s.carve("sphere", P(ex, 0.108, 0.008), 0.028 * z, k=0.01 * z)
        c = P(ex, 0.108 - eye_r / z, 0.008)
        s.eyes.append(dict(center=c, radius=eye_r, iris=f.get("eyes", "#4a3322"), side=sx, style=style,
                           look=V((gx, 1.0, gz)).normalized()))
        # The upper lid: a shell over the eyeball, cut by a plane that comes down
        # with `lids` and tilts with `lid_tilt` (outer corner up or down).
        R = eye_r + 0.003 * z  # a lid thick enough to survive the 2 mm meshing
        n = V((sx * tilt * 0.35, -0.25, 1.0)).normalized()
        h = R * (0.62 - lids * 1.25)
        shell = minus(ell_fn(c, (R, R, R)), ell_fn(c, (eye_r * 0.96,) * 3))
        lid_fn = intersect(shell, plane_fn(c + n * h, n))
        shape(s, lid_fn, c - V((R, R, R)), c + V((R, R, R)), color=skin, k=0.0015 * z)
        # The dark line along the lid's edge (thicker with lashes, flicked at the outer corner).
        u = n.cross(V((1, 0, 0))).normalized()
        if u.y < 0:
            u = -u
        w = n.cross(u).normalized()
        rho = np.sqrt(max(R * R - h * h, 1e-8))
        lash = f.get("lashes", False)
        arc = []
        for t in np.linspace(-1, 1, 9):
            phi = t * np.radians(80)
            arc.append(c + n * h + (u * np.cos(phi) + w * np.sin(phi)) * (rho + 0.0008 * z))
        lid_color = f.get("lid", INK)
        for a, b in zip(arc, arc[1:]):
            s.capsule(a, b, (0.0042 if lash else 0.0032) * z, color=lid_color, k=0.001 * z)
        if lash:
            outer = arc[0] if (arc[0].x - c.x) * sx > 0 else arc[-1]
            s.capsule(outer, outer + V((sx * 0.007 * z, 0.002 * z, 0.004 * z)), 0.0028 * z, color=lid_color, k=0.001 * z)
        if f.get("lower_lid", 0) > 0 or f.get("bags", 0) > 0:
            lower = f.get("lower_lid", 0.0)
            hl = -R * (0.75 - lower * 1.4)
            lo_fn = intersect(shell, plane_fn(c + V((0, 0, hl)), (0, 0, -1)))
            shape(s, lo_fn, c - V((R, R, R)), c + V((R, R, R)), color=skin, k=0.0015 * z)
            if f.get("bags", 0) > 0:
                s.capsule(P(ex - sx * 0.012, 0.098, -0.016), P(ex + sx * 0.014, 0.094, -0.014), 0.006 * z * f["bags"], k=0.008 * z)
        # Eyebrows.
        bw = f.get("brow_w", 0.0075) * z
        btilt = f.get("brow_tilt", 0.0)
        lift = f.get("brow_lift", 0.0) * 0.01
        inner = P(ex - sx * 0.018, 0.108, 0.048 - btilt * 0.01 + lift)
        mid = P(ex + sx * 0.002, 0.112, 0.056 + lift)
        outer = P(ex + sx * 0.024, 0.104, 0.05 + btilt * 0.006 + lift * 0.6)
        brows = f.get("brows", hair)
        s.capsule(inner, mid, bw, color=brows, k=0.003 * z)
        s.capsule(mid, outer, bw * 0.85, color=brows, k=0.003 * z)
        # Ears with a hollow.
        ear = f.get("ears", 1.0)
        s.ellipsoid(P(sx * 0.1 * sw, -0.004, 0.0), (0.016 * z, 0.028 * z * ear, 0.04 * z * ear), R=rot(0, sx * -12, 0), k=0.01 * z)
        s.carve("sphere", P(sx * 0.114 * sw, 0.002, 0.002), 0.013 * z * ear, k=0.004 * z)

    # Nose: the comic heart of the face.
    nose = f.get("nose", "round")
    ns = f.get("nose_size", 1.0)
    tint = f.get("nose_tint", skin)
    root = P(0, 0.104, 0.018)
    if nose == "round":
        s.capsule(root, P(0, 0.132, -0.022), 0.015 * z * ns, 0.022 * z * ns, color=tint, k=0.012 * z)
        s.sphere(P(0, 0.142 + 0.01 * (ns - 1), -0.03), 0.027 * z * ns, color=tint, k=0.01 * z)
    elif nose == "long":
        s.capsule(root, P(0, 0.158 * ns, -0.036), 0.013 * z, 0.019 * z * ns, color=tint, k=0.01 * z)
    elif nose == "hook":
        s.capsule(root, P(0, 0.14 * ns, -0.004), 0.013 * z, 0.016 * z, color=tint, k=0.01 * z)
        s.capsule(P(0, 0.14 * ns, -0.004), P(0, 0.136 * ns, -0.036), 0.016 * z, 0.014 * z, color=tint, k=0.008 * z)
    else:  # button
        s.capsule(root, P(0, 0.122, -0.02), 0.012 * z * ns, 0.016 * z * ns, color=tint, k=0.01 * z)
    for sx in (-1, 1):
        s.carve("sphere", P(sx * 0.012 * ns, 0.128 + 0.01 * (ns - 1), -0.046), 0.0055 * z, k=0.002 * z)

    # Mouth: a carved smile (a frown when negative) and a lower lip.
    smile = f.get("smile", 0.5)
    mouth_y, mouth_z = 0.101, -0.066 * L
    pts = [P(x, mouth_y - abs(x) * 0.45, mouth_z + (x / 0.028) ** 2 * 0.016 * smile) for x in (-0.028, -0.014, 0.0, 0.014, 0.028)]
    for a, b in zip(pts, pts[1:]):
        # A groove with a dark shape set into it: reads by its shape and stays crisp.
        s.carve("capsule", a, b, 0.0066 * z, k=0.003 * z)
        s.capsule(a - V((0, 0.0045 * z, 0)), b - V((0, 0.0045 * z, 0)), 0.0046 * z, color="#3a1410", k=0)
    s.capsule(P(-0.014, 0.1, mouth_z - 0.012), P(0.014, 0.1, mouth_z - 0.012), 0.0068 * z, color=f.get("lips", skin), k=0.006 * z)
    if f.get("freckles"):
        for sx in (-1, 1):
            for fx, fz in ((0.045, -0.018), (0.058, -0.028), (0.052, -0.04), (0.068, -0.02), (0.035, -0.03)):
                s.paint("sphere", P(sx * fx, 0.104, fz), 0.0038 * z, color=f["freckles"])
    if f.get("cheeks"):
        for sx in (-1, 1):
            s.paint("sphere", P(sx * 0.058, 0.098, -0.03), 0.02 * z, color=f["cheeks"])
    if f.get("age", 0) > 0.3:
        # Crow's feet and a line from the nose to the mouth.
        for sx in (-1, 1):
            s.carve("capsule", P(sx * 0.07, 0.088, 0.012), P(sx * 0.078, 0.082, 0.0), 0.0022 * z, k=0.002 * z)
            s.carve("capsule", P(sx * 0.026, 0.118, -0.04), P(sx * 0.036, 0.104, -0.068), 0.0025 * z, k=0.003 * z)

    hair_style(s, P, z, f.get("hair_style", "short"), hair)
    if f.get("moustache"):
        moustache(s, P, z, f["moustache"], f.get("moustache_color", f.get("beard_color", hair)))
    if f.get("beard"):
        beard(s, P, z, f["beard"], f.get("beard_color", hair), f.get("beard_part", "head"))
    if f.get("glasses"):
        glasses(s, P, z, f["glasses"])
    s.part = "head"


def hair_style(s, P, z, style, color):
    s.part = "head"
    if style in ("none", "bald"):
        if style == "bald":
            # A horseshoe of hair round the back.
            clipped_ellipsoid(s, P(0, -0.018, 0.0), (0.109 * z, 0.114 * z, 0.1 * z), P(0, 0.04, 0.0), (0, -1, 0.2), color=color, k=0.004 * z)
        return
    # The main cap of hair: a shell over the cranium, open towards the face.
    clipped_ellipsoid(
        s, P(0, -0.014, 0.03), (0.116 * z, 0.126 * z, 0.137 * z), P(0, 0.06, 0.02), (0, -1, 0.45), color=color, k=0.003 * z
    )
    if style == "short":
        s.ellipsoid(P(0, 0.05, 0.1), (0.09 * z, 0.05 * z, 0.035 * z), R=rot(-20, 0, 0), color=color, k=0.01 * z)
    if style in ("bun",):
        s.sphere(P(0, -0.1, 0.07), 0.045 * z, color=color, k=0.012 * z)
    if style in ("braids", "long"):
        for sx in (-1, 1):
            top = P(sx * 0.08, -0.04, -0.02)
            if style == "braids":
                prev = top
                for i in range(1, 6):
                    nxt = P(sx * (0.09 + i * 0.004), -0.03 + i * 0.012, -0.02 - i * 0.045)
                    s.sphere(nxt, 0.021 * z, color=color, k=0.006 * z)
                    s.capsule(prev, nxt, 0.017 * z, color=color, k=0.006 * z)
                    prev = nxt
            else:
                s.capsule(top, P(sx * 0.07, -0.07, -0.24), 0.04 * z, 0.03 * z, color=color, k=0.02 * z)
    if style == "long":
        s.ellipsoid(P(0, -0.08, -0.1), (0.1 * z, 0.05 * z, 0.16 * z), color=color, k=0.03 * z)


def moustache(s, P, z, style, color):
    s.part = "head"
    s.k = 0.006 * z
    if style == "walrus":
        for sx in (-1, 1):
            s.capsule(P(sx * 0.004, 0.126, -0.05), P(sx * 0.03, 0.112, -0.064), 0.013 * z, 0.009 * z, color=color)
            s.capsule(P(sx * 0.03, 0.112, -0.064), P(sx * 0.042, 0.1, -0.084), 0.009 * z, 0.006 * z, color=color)
    elif style == "handlebar":
        for sx in (-1, 1):
            s.capsule(P(sx * 0.004, 0.126, -0.052), P(sx * 0.036, 0.114, -0.058), 0.009 * z, 0.006 * z, color=color)
            s.capsule(P(sx * 0.036, 0.114, -0.058), P(sx * 0.054, 0.104, -0.04), 0.006 * z, 0.004 * z, color=color)
    else:
        for sx in (-1, 1):
            s.capsule(P(sx * 0.004, 0.124, -0.054), P(sx * 0.03, 0.114, -0.06), 0.006 * z, 0.004 * z, color=color)


def beard(s, P, z, style, color, part):
    s.part = part
    s.color = color
    if style == "full":
        # Fluffy lumps along the jaw from ear to ear, below the mouth, ending in a point.
        s.k = 0.018 * z
        for i in range(9):
            t = -1 + i / 4
            ang = t * 1.25
            s.sphere(P(np.sin(ang) * 0.088, 0.02 + np.cos(ang) * 0.075, -0.075 - (1 - abs(t)) * 0.045), (0.034 + (1 - abs(t)) * 0.012) * z)
        s.sphere(P(0, 0.075, -0.165), 0.045 * z, k=0.03 * z)
        s.sphere(P(0, 0.07, -0.215), 0.03 * z, k=0.03 * z)
        clipped_ellipsoid(s, P(0, 0.03, -0.12), (0.095 * z, 0.08 * z, 0.09 * z), P(0, 0.1, -0.09), (0, -0.15, -1), k=0.03 * z)
    elif style == "short":
        clipped_ellipsoid(s, P(0, 0.035, -0.07), (0.092 * z, 0.08 * z, 0.078 * z), P(0, 0.1, -0.07), (0, -0.2, -1), k=0.01 * z)
    elif style == "goatee":
        s.capsule(P(0, 0.088, -0.092), P(0, 0.094, -0.118), 0.016 * z, 0.008 * z, k=0.006 * z)
    # ('stubble' adds nothing: painted stubble looked like dirt, the frown carries the look.)
    s.part = "head"


def glasses(s, P, z, color):
    """Round spectacles: rims, a bridge and the arms back to the ears (real tubes)."""
    for sx in (-1, 1):
        s.rings.append(dict(kind="ring", center=P(sx * 0.041, 0.118, 0.009), major=0.024 * z, minor=0.0024 * z, R=rot(90, 0, 0), color=color))
        s.rings.append(dict(kind="rod", a=P(sx * 0.065, 0.116, 0.012), b=P(sx * 0.1, 0.02, 0.016), minor=0.0022 * z, color=color))
    s.rings.append(dict(kind="rod", a=P(-0.018, 0.121, 0.013), b=P(0.018, 0.121, 0.013), minor=0.0024 * z, color=color))


# ---------------------------------------------------------------------------- hats


def kepi(s, H, z, color, badge="#e0b84a", band=None):
    """Postal/army cap: a tilted flat-topped crown with a visor."""
    s.part = "head"
    s.k = 0.004 * z
    base = V(H) + V((0, -0.006 * z, 0.078 * z))
    top = V(H) + V((0, 0.016 * z, 0.165 * z))
    s.cylinder(base, top, 0.11 * z, rnd=0.012 * z, color=color)
    s.cylinder(base - V((0, 0, 0.004 * z)), base + V((0, 0, 0.034 * z)), 0.116 * z, rnd=0.006 * z, color=band or shade(color, 0.7))
    clipped_ellipsoid(
        s, V(H) + V((0, 0.1 * z, 0.082 * z)), (0.09 * z, 0.07 * z, 0.012 * z), V(H) + V((0, 0.09 * z, 0.0)), (0, 1, 0),
        R=rot(-14, 0, 0), color="#1a1612",
    )
    s.sphere(V(H) + V((0, 0.116 * z, 0.128 * z)), 0.016 * z, color=badge, k=0.002 * z)


def cowboy_hat(s, H, z, color, band="#3a2615"):
    s.part = "head"
    s.k = 0.006 * z
    c = V(H) + V((0, -0.004 * z, 0.1 * z))
    # Brim with a curl at the sides, crown with a pinched crease.
    s.torus(c + V((0, 0, 0.008 * z)), 0.14 * z, 0.012 * z, scale=(1, 1.12, 1), color=color)
    s.ellipsoid(c, (0.165 * z, 0.18 * z, 0.01 * z), color=color)
    s.ellipsoid(c + V((0, 0, 0.075 * z)), (0.098 * z, 0.114 * z, 0.085 * z), color=color, k=0.01 * z)
    s.carve("capsule", c + V((0, -0.06 * z, 0.165 * z)), c + V((0, 0.06 * z, 0.165 * z)), 0.028 * z, k=0.02 * z)
    s.torus(c + V((0, 0, 0.022 * z)), 0.098 * z, 0.01 * z, scale=(1, 1.14, 1), color=band)


def bowler(s, H, z, color):
    s.part = "head"
    s.k = 0.006 * z
    c = V(H) + V((0, -0.004 * z, 0.1 * z))
    s.ellipsoid(c, (0.14 * z, 0.15 * z, 0.01 * z), color=color)
    clipped_ellipsoid(s, c, (0.105 * z, 0.115 * z, 0.12 * z), c, (0, 0, 1), color=color, k=0.01 * z)
    s.torus(c + V((0, 0, 0.016 * z)), 0.104 * z, 0.009 * z, scale=(1, 1.1, 1), color="#1a1612")


def bonnet(s, H, z, color):
    """A pioneer sunbonnet: a hollow hood framing the face, with a brim."""
    s.part = "head"
    c = V(H) + V((0, -0.02 * z, 0.03 * z))
    outer = ell_fn(c, (0.132 * z, 0.145 * z, 0.152 * z))
    inner = ell_fn(c + V((0, 0.02 * z, 0)), (0.114 * z, 0.14 * z, 0.136 * z))
    hood = intersect(minus(outer, inner), plane_fn(V(H) + V((0, 0.075 * z, 0)), (0, -1, 0.25)))
    e = 0.16 * z
    shape(s, hood, c - V((e, e, e)), c + V((e, e, e)), color=color, k=0.004 * z)
    s.torus(V(H) + V((0, 0.08 * z, 0.02 * z)), 0.108 * z, 0.018 * z, R=rot(76, 0, 0), scale=(1, 1.12, 1), color=shade(color, 1.12), k=0.006 * z)
    # Ties under the chin.
    s.capsule(V(H) + V((-0.07 * z, 0.06 * z, -0.07 * z)), V(H) + V((0, 0.08 * z, -0.13 * z)), 0.008 * z, color=shade(color, 1.12), k=0.004 * z)
    s.capsule(V(H) + V((0.07 * z, 0.06 * z, -0.07 * z)), V(H) + V((0, 0.08 * z, -0.13 * z)), 0.008 * z, color=shade(color, 1.12), k=0.004 * z)


def miner_helmet(s, H, z, color, lamp="#fff2b0"):
    s.part = "head"
    s.k = 0.005 * z
    c = V(H) + V((0, -0.004 * z, 0.08 * z))
    clipped_ellipsoid(s, c, (0.118 * z, 0.126 * z, 0.13 * z), c, (0, 0, 1), color=color)
    s.ellipsoid(c + V((0, 0.02 * z, 0)), (0.14 * z, 0.16 * z, 0.01 * z), color=color)
    s.cylinder(c + V((0, 0.105 * z, 0.08 * z)), c + V((0, 0.14 * z, 0.08 * z)), 0.028 * z, color="#6f7479")
    s.sphere(c + V((0, 0.14 * z, 0.08 * z)), 0.022 * z, color=lamp, k=0.002 * z)


def straw_hat(s, H, z, color):
    """A wide conical straw hat, hollow underneath, resting on the crown of the head."""
    s.part = "head"
    base = V(H).z + 0.085 * z
    cx, cy = V(H).x, V(H).y - 0.005 * z
    outer = cone_fn(cx, cy, base, base + 0.14 * z, 0.27 * z, 0.012 * z, rnd=0.006 * z)
    inner = cone_fn(cx, cy, base - 0.03 * z, base + 0.105 * z, 0.27 * z, 0.01 * z)
    e = 0.28 * z
    shape(s, minus(outer, inner), (cx - e, cy - e, base - 0.01), (cx + e, cy + e, base + 0.15 * z), color=color, k=0.003 * z)
    s.torus(V((cx, cy, base + 0.045 * z)), 0.19 * z, 0.006 * z, color=shade(color, 0.78), k=0.003 * z)


# ---------------------------------------------------------------------------- bodies


def figure(s, o):
    """
    A standing figure from the neck down. Options (`o`):
      scale      overall size (1 = adult man, ~0.72 = child)
      build      'man' | 'woman' | 'child'
      skin       hands (and forearms when sleeves are rolled up)
      garment    'coat' | 'duster' | 'jacket' | 'shirt' | 'tunic' | 'buckskin' | 'dress'
      top        the garment's colour;  trousers, boots, shirt (collar), buttons
      belly      0..1;  apron, yoke (bands), blanket (colours), braces, sash, bandana
      limbs      True: arms and legs become their own parts (arm_l … leg_r) to animate
    Returns the rig joints (neck, shoulders, hips) in Blender coordinates.
    """
    f = o.get("scale", 1.0)
    build = o.get("build", "man")
    skin = o["skin"]
    garment = o.get("garment", "coat")
    top = o["top"]
    wide = 0.9 if build == "woman" else 1.0

    def P(x, y, z):
        return V((x * f, y * f, z * f))

    shoulder_x = 0.215 * wide
    joints = dict(
        neck=P(0, -0.01, 1.46),
        shoulder_l=P(-shoulder_x, -0.01, 1.38),
        shoulder_r=P(shoulder_x, -0.01, 1.38),
        hip_l=P(-0.1, 0, 0.92),
        hip_r=P(0.1, 0, 0.92),
    )
    limbs = o.get("limbs", False)
    s.k = 0.03 * f

    # ---- legs: `stance` spreads the feet, `shift` puts the weight on one leg
    # (-1 left, 1 right): the other knee bends a little and the foot turns out.
    skirt = garment == "dress"
    stance = o.get("stance", 0.0)
    shift = o.get("shift", 0)
    for sx, side in ((-1, "l"), (1, "r")):
        s.part = f"leg_{side}" if limbs else "body"
        free = shift != 0 and sx != shift
        fx = 0.105 + stance + (0.03 if free else 0.0)
        hip = P(sx * 0.1, 0, 0.9)
        knee = P(sx * (0.105 + stance * 0.5 + (0.01 if free else 0)), 0.06 if free else 0.01, 0.48)
        ankle = P(sx * fx, 0.04 if free else 0.0, 0.12)
        foot_turn = rot(0, 0, sx * -16) if free else None
        if not skirt:
            leg_color = o.get("trousers", "#3a3330")
            s.capsule(hip, knee, 0.078 * f, 0.063 * f, color=leg_color, k=0.02 * f)
            s.capsule(knee, ankle, 0.062 * f, 0.053 * f, color=leg_color, k=0.02 * f)
            if o.get("stripe"):
                s.paint("box", P(sx * 0.17, 0, 0.5), (0.012 * f, 0.02 * f, 0.4 * f), color=o["stripe"])
        boots = o.get("boots", "#4a2a14")
        tall = o.get("tall_boots", False)
        s.capsule(ankle + V((0, 0, (0.3 if tall else 0.08) * f)), ankle - V((0, 0, 0.07 * f)), (0.066 if tall else 0.058) * f, 0.058 * f, color=boots, k=0.01 * f)
        toe = ankle + V((0, 0.05 * f, -0.085 * f))
        s.box(toe, (0.058 * f, 0.12 * f, 0.035 * f), R=foot_turn, rnd=0.025 * f, color=boots, k=0.015 * f)
        if garment == "buckskin":
            # Moccasins with a beaded strip.
            s.paint("box", toe + V((0, 0.05 * f, 0.025 * f)), (0.02 * f, 0.05 * f, 0.02 * f), color=o.get("beads", "#2f4a78"))

    # ---- torso
    s.part = "body"
    s.color = top
    belly = o.get("belly", 0.2)
    if build == "woman":
        s.capsule(P(0, 0, 0.98), P(0, 0.0, 1.32), 0.15 * f, 0.165 * f)
        s.ellipsoid(P(0, 0.06, 1.24), (0.15 * f, 0.1 * f, 0.08 * f), k=0.04 * f)
    else:
        s.capsule(P(0, 0, 0.92), P(0, 0.0, 1.32), 0.17 * f, 0.19 * f)
        s.ellipsoid(P(0, 0.05 + belly * 0.04, 1.05), (0.19 * f, (0.15 + belly * 0.05) * f, 0.2 * f))
    s.capsule(P(-0.2 * wide, -0.01, 1.4), P(0.2 * wide, -0.01, 1.4), 0.075 * f * wide)
    hem = {"coat": 0.7, "duster": 0.36, "jacket": 0.9, "shirt": 0.92, "tunic": 0.72, "buckskin": 0.84}.get(garment)
    if garment == "dress":
        # A bell-shaped skirt to the ankles with a flat hem, shoes peeking out.
        skirt_fn = cone_fn(0, 0.01 * f, 0.1 * f, 1.02 * f, 0.33 * f, 0.17 * f, rnd=0.03 * f)
        shape(s, skirt_fn, P(-0.34, -0.33, 0.09), P(0.34, 0.35, 1.03), color=top, k=0.04 * f)
        if o.get("apron"):
            apron_fn = intersect(
                cone_fn(0, 0.02 * f, 0.3 * f, 1.02 * f, 0.31 * f, 0.18 * f),
                plane_fn(P(0, 0.08, 0), (0, 1, 0)),
                lambda X, Y, Z: np.abs(X) - 0.17 * f,
            )
            shape(s, apron_fn, P(-0.2, 0.05, 0.29), P(0.2, 0.33, 1.03), color=o["apron"], k=0.004 * f)
            s.capsule(P(-0.16, 0.06, 1.0), P(0.16, 0.06, 1.0), 0.02 * f, color=o["apron"], k=0.01 * f)
    elif hem is not None and hem < 0.9:
        flare = 0.24 if garment == "duster" else 0.212
        s.capsule(P(0, 0, 1.0), P(0, -0.01, hem), 0.19 * f, flare * f, k=0.04 * f)
    if garment in ("coat", "duster", "jacket"):
        # Collar and a double row of buttons.
        s.torus(P(0, -0.005, 1.46), 0.075 * f, 0.022 * f, R=rot(-8, 0, 0), color=shade(top, 0.85), k=0.01 * f)
        s.capsule(P(0, 0.07, 1.42), P(0, 0.11, 1.33), 0.045 * f, 0.02 * f, color=o.get("shirt", "#f3ecdc"), k=0.02 * f)
        rows = (-0.04, 0.04) if garment != "jacket" else (0.0,)
        for bx in rows:
            for i in range(4 if garment != "jacket" else 5):
                s.studs.append(dict(part="body", center=P(bx, 0.205 + belly * 0.035 - i * 0.004, 1.3 - i * 0.09), radius=0.016 * f,
                                    color=o.get("buttons", "#e0b84a")))
    if garment == "jacket":
        s.cylinder(P(0, 0, 0.96), P(0, 0, 1.03), 0.2 * f, rnd=0.01 * f, color="#3a2615", k=0.008 * f)
        s.box(P(0, 0.2, 0.995), (0.045 * f, 0.02 * f, 0.035 * f), rnd=0.006 * f, color="#e0b84a", k=0.003 * f)
    if garment == "shirt":
        s.cylinder(P(0, 0, 0.9), P(0, 0, 0.97), 0.19 * f, rnd=0.01 * f, color="#3a2615", k=0.008 * f)
        braces = o.get("braces", "#3a3330")
        for sx in (-1, 1) if braces else ():
            s.capsule(P(sx * 0.1, 0.17, 0.97), P(sx * 0.12, 0.12, 1.42), 0.018 * f, color=braces, k=0.004 * f)
            s.capsule(P(sx * 0.1, -0.17, 0.97), P(sx * 0.12, -0.12, 1.42), 0.018 * f, color=braces, k=0.004 * f)
        s.torus(P(0, 0.0, 1.45), 0.07 * f, 0.02 * f, R=rot(-10, 0, 0), color=o.get("collar", shade(top, 0.8)), k=0.008 * f)
    if garment == "tunic":
        # Side-fastened work tunic with a band across the chest.
        s.capsule(P(-0.02, 0.2, 1.4), P(0.13, 0.19, 1.2), 0.016 * f, color=shade(top, 0.7), k=0.006 * f)
        s.capsule(P(0.13, 0.19, 1.2), P(0.14, 0.2, 0.9), 0.016 * f, color=shade(top, 0.7), k=0.006 * f)
        s.torus(P(0, 0.0, 1.45), 0.07 * f, 0.02 * f, R=rot(-10, 0, 0), color=shade(top, 0.75), k=0.008 * f)
    if garment == "buckskin":
        # Fringe along the hem.
        for i in range(14):
            a = i / 14 * 2 * np.pi
            x, y = np.sin(a) * 0.2, np.cos(a) * 0.19
            s.capsule(P(x, y, 0.86), P(x * 1.05, y * 1.05, 0.76), 0.012 * f, color=shade(top, 0.85), k=0.01 * f)
    if o.get("sash"):
        s.cylinder(P(0, 0, 0.94), P(0, 0, 1.04), 0.205 * f, rnd=0.02 * f, color=o["sash"], k=0.01 * f)
    if o.get("yoke"):
        # A beaded cape over the shoulders, in bands of colour.
        bands = o["yoke"]
        c = P(0, -0.01, 1.4)
        box = (c - V((0.27 * f, 0.21 * f, 0.14 * f)), c + V((0.27 * f, 0.21 * f, 0.14 * f)))
        cape = intersect(ell_fn(c, (0.26 * f * wide, 0.2 * f, 0.13 * f)), plane_fn(P(0, 0, 1.27), (0, 0, 1)))
        shape(s, cape, *box, color=bands[0], k=0.02 * f)
        for i, col in enumerate(bands[1:]):
            ring = lambda X, Y, Z, zc=(1.43 - (i + 1) * 0.045) * f: np.abs(Z - zc) - 0.013 * f  # noqa: E731
            shape(s, intersect(ring, lambda X, Y, Z: cape(X, Y, Z) - 0.01 * f), *box, op="paint", color=col, k=0)
    if o.get("bandana"):
        # A neckerchief knotted at the front.
        s.torus(P(0, 0.0, 1.47), 0.078 * f, 0.026 * f, R=rot(-10, 0, 0), color=o["bandana"], k=0.02 * f)
        s.capsule(P(0, 0.1, 1.45), P(0, 0.15, 1.33), 0.045 * f, 0.018 * f, color=o["bandana"], k=0.015 * f)
    if o.get("blanket"):
        # A striped blanket over the shoulders and down the back, open at the front.
        stripes = o["blanket"]
        c = P(0, -0.03, 1.22)
        outer = ell_fn(c, (0.29 * f, 0.23 * f, 0.33 * f))
        inner = ell_fn(c, (0.25 * f, 0.19 * f, 0.3 * f))
        drape = intersect(minus(outer, inner), plane_fn(P(0, 0.07, 0), (0, -1, 0)), plane_fn(P(0, 0, 0.9), (0, 0, 1)))
        shape(s, drape, c - V((0.3 * f, 0.24 * f, 0.34 * f)), c + V((0.3 * f, 0.24 * f, 0.34 * f)), color=stripes[0], k=0.02 * f)
        # Stripes only on the blanket, not on the shirt under it.
        for i, col in enumerate(stripes[1:]):
            band = lambda X, Y, Z, zc=(1.02 + i * 0.1) * f: np.abs(Z - zc) - 0.022 * f  # noqa: E731
            shape(s, intersect(band, lambda X, Y, Z: drape(X, Y, Z) - 0.012 * f), c - V((0.3 * f, 0.24 * f, 0.34 * f)),
                  c + V((0.3 * f, 0.24 * f, 0.34 * f)), op="paint", color=col, k=0)

    # ---- arms and hands, posed (see ARM_POSES)
    sleeve = o.get("sleeve", top)
    rolled = o.get("rolled", False)
    poses = o.get("arms", ("relaxed", "relaxed"))
    for (sx, side), pose in zip(((-1, "l"), (1, "r")), poses):
        s.part = f"arm_{side}" if limbs else "body"
        sh = P(sx * shoulder_x, -0.01, 1.38)
        (ex, ey, ez), (wx, wy, wz) = ARM_POSES[pose](shoulder_x)
        el = P(sx * ex, ey, ez)
        wr = P(sx * wx, wy, wz)
        s.capsule(sh, el, 0.07 * f * wide, 0.06 * f * wide, color=sleeve, k=0.02 * f)
        if rolled:
            s.capsule(el, wr, 0.05 * f, 0.045 * f, color=skin, k=0.02 * f)
            s.torus(el, 0.058 * f, 0.018 * f, R=along(sh, el), color=shade(sleeve, 0.85), k=0.006 * f)
        else:
            wrist_r = 0.075 if garment == "tunic" else 0.056
            s.capsule(el, wr, 0.06 * f * wide, wrist_r * f * wide, color=sleeve, k=0.02 * f)
        if garment == "buckskin":
            for i in range(5):
                t = i / 4
                pnt = sh.lerp(el, t) if i < 3 else el.lerp(wr, t - 0.5)
                s.capsule(pnt + V((sx * 0.05 * f, -0.02 * f, 0)), pnt + V((sx * 0.08 * f, -0.03 * f, -0.04 * f)), 0.01 * f, color=shade(top, 0.85), k=0.008 * f)
        # A mitten hand along the forearm, with a thumb on the inside.
        d = (wr - el).normalized()
        inward = V((-sx, 0.6, 0)).normalized()
        inward = (inward - d * inward.dot(d)).normalized()
        palm = wr + d * 0.05 * f
        s.color = skin
        s.ellipsoid(palm, (0.037 * f, 0.028 * f, 0.056 * f), R=along(wr, palm + d), k=0.01 * f)
        s.capsule(wr + d * 0.03 * f + inward * 0.026 * f, wr + d * 0.07 * f + inward * 0.036 * f, 0.013 * f, 0.012 * f, k=0.008 * f)
        joints[f"hand_{side}"] = palm
        joints[f"elbow_{side}"] = el
    s.part = "body"
    return joints


def along(a, b):
    from sdf import along as _along

    return _along(a, b)


#: Elbow and wrist for each arm pose, as functions of the shoulder's x (mirrored for
#: the left arm). Metres for an adult; the figure scales them.
ARM_POSES = {
    "relaxed": lambda s0: ((s0 + 0.045, 0.03, 1.12), (s0 + 0.04, 0.09, 0.92)),
    "hips": lambda s0: ((s0 + 0.16, -0.03, 1.15), (s0 + 0.0, 0.0, 0.99)),
    "crossed": lambda s0: ((s0 + 0.03, 0.16, 1.15), (-0.12, 0.2, 1.25)),
    "behind": lambda s0: ((s0 + 0.03, -0.1, 1.12), (0.07, -0.2, 0.98)),
    "clasped": lambda s0: ((s0 + 0.03, 0.1, 1.12), (0.035, 0.23, 1.0)),
    "hold": lambda s0: ((s0 + 0.02, 0.12, 1.13), (0.1, 0.32, 1.12)),
    "tool": lambda s0: ((s0 + 0.12, 0.1, 1.2), (s0 - 0.02, 0.15, 1.43)),
    "braces": lambda s0: ((s0 + 0.11, 0.03, 1.14), (0.12, 0.2, 1.22)),
    "under_arm": lambda s0: ((s0 + 0.07, 0.02, 1.13), (s0 + 0.01, 0.16, 1.0)),
    "cane": lambda s0: ((s0 + 0.06, 0.1, 1.12), (s0 + 0.05, 0.22, 0.94)),
}


def plan_roll(s, f, j):
    """A rolled plan of the track tucked under the right arm."""
    s.part = "body"
    x = j["elbow_r"].x - 0.06 * f
    a = V((x, -0.22 * f, 1.1 * f))
    b = V((x + 0.02 * f, 0.4 * f, 1.02 * f))
    s.cylinder(a, b, 0.036 * f, rnd=0.01 * f, color="#f3ecdc", k=0.004 * f)
    s.paint("box", (a + b) / 2, (0.05 * f, 0.012 * f, 0.05 * f), color="#b8322a")


def shoulder_tool(s, f, j, kind="pick"):
    """A pickaxe or sledgehammer resting on the right shoulder, held at the front."""
    s.part = "body"
    s.k = 0.004 * f
    hand = j["hand_r"]
    front = hand + V((0, 0.12 * f, -0.04 * f))
    back = hand + V((0.02 * f, -0.55 * f, 0.1 * f))
    s.capsule(front, back, 0.018 * f, color="#8a5a2b")
    if kind == "pick":
        s.capsule(back + V((0, 0.02 * f, 0.18 * f)), back + V((0, -0.03 * f, -0.2 * f)), 0.02 * f, 0.008 * f, color="#6f7479")
    else:
        s.box(back, (0.05 * f, 0.09 * f, 0.05 * f), rnd=0.01 * f, color="#4a4f5a")


def telegram(s, f, j):
    """A telegram held in both hands."""
    s.part = "body"
    c = (j["hand_l"] + j["hand_r"]) / 2 + V((0, 0.03 * f, 0.04 * f))
    s.box(c, (0.12 * f, 0.006 * f, 0.085 * f), R=rot(-25, 0, 0), rnd=0.003 * f, color="#f3ecdc", k=0.004 * f)


def satchel(s, f, color="#7a4a24", strap="#5a3418"):
    """A leather mail bag on a strap across the chest, hanging at the left hip."""
    s.part = "body"
    s.k = 0.004 * f
    pts = [V((0.2 * f, 0.04 * f, 1.46 * f)), V((0.06 * f, 0.225 * f, 1.22 * f)), V((-0.12 * f, 0.25 * f, 1.0 * f)), V((-0.24 * f, 0.16 * f, 0.88 * f))]
    for a, b in zip(pts, pts[1:]):
        s.capsule(a, b, 0.02 * f, color=strap)
    s.box(V((-0.25 * f, 0.1 * f, 0.8 * f)), (0.05 * f, 0.13 * f, 0.1 * f), R=rot(0, 0, -20), rnd=0.02 * f, color=color, k=0.006 * f)
    s.box(V((-0.26 * f, 0.18 * f, 0.84 * f)), (0.052 * f, 0.03 * f, 0.07 * f), R=rot(-8, 0, -20), rnd=0.012 * f, color=shade(color, 0.85), k=0.004 * f)
    s.sphere(V((-0.24 * f, 0.215 * f, 0.8 * f)), 0.012 * f, color="#e0b84a", k=0.002 * f)


def cane(s, f, hand, color="#5e3a1a"):
    """A walking stick from the hand to the ground, with a crook handle."""
    s.part = "body"
    s.k = 0.004 * f
    top = V(hand) + V((0, 0.0, -0.01 * f))
    s.capsule(top, V((top.x + 0.04 * f, top.y + 0.08 * f, 0.01)), 0.016 * f, color=color)
    s.torus(top + V((0, 0.045 * f, 0.03 * f)), 0.045 * f, 0.015 * f, R=rot(0, 90, 0), color=color)


# ---------------------------------------------------------------------------- the cast


def person(s, body, face, hat=None, extras=()):
    """Body + head + hat, and the rig. `hat` is (function, colour, …)."""
    joints = figure(s, body)
    f = body.get("scale", 1.0)
    size = face.get("size", 1.2)
    H = joints["neck"] + V((0, 0.02 * size, 0.2 * size))
    for extra in extras:
        extra(s, f, joints)
    head(s, H, dict(face, size=size))
    if hat:
        hat[0](s, H, size, *hat[1:])
    pivots = dict(body=V((0, 0, 0)), head=joints["neck"], eyes=joints["neck"], glasses=joints["neck"])
    parents = dict(head="body", eyes="head", glasses="head")
    if face.get("beard_part") == "beard":
        pivots["beard"] = H + V((0, 0.08 * size, -0.07 * size))
        parents["beard"] = "head"
    if body.get("limbs"):
        for side in ("l", "r"):
            pivots[f"arm_{side}"] = joints[f"shoulder_{side}"]
            pivots[f"leg_{side}"] = joints[f"hip_{side}"]
            parents[f"arm_{side}"] = "body"
            parents[f"leg_{side}"] = "body"
    return dict(pivots=pivots, parents=parents)


SKIN_LIGHT = "#f1c9a0"
SKIN_WARM = "#e8b890"
SKIN_TAN = "#d9a47a"
SKIN_BROWN = "#c98e62"
SKIN_DEEP = "#b07a52"


def pind(s):
    """Postmester Pind: an old postmaster, round and kind, leaning on his cane."""
    return person(
        s,
        dict(skin=SKIN_LIGHT, garment="coat", top="#2f4a78", trousers="#3a3530", buttons="#e0b84a", belly=0.8, scale=0.97,
             arms=("relaxed", "cane"), shift=1),
        dict(skin=SKIN_LIGHT, shape=(1.06, 1.0, 0.96), face_len=0.95, nose="round", nose_size=1.2, nose_tint="#eaa88a",
             hair="#f2f0ea", hair_style="fringe", brows="#f2f0ea", brow_w=0.01, brow_tilt=-0.7, brow_lift=0.6, eyes="#3d6b8a",
             lids=0.22, lid_tilt=-0.6, bags=0.8, smile=0.7, age=0.8, cheeks="#f0b09a", beard="full", beard_color="#f2f0ea",
             beard_part="beard", moustache="walrus", glasses="#3a3330", gaze=(0, -0.05)),
        hat=(kepi, "#2f4a78", "#e0b84a", "#1f2f4a"),
        extras=(lambda s, f, j: satchel(s, f), lambda s, f, j: cane(s, f, j["hand_r"])),
    )


def jensen(s):
    """Mor Jensen: a warm, round-faced Danish pioneer mother, hands folded over her apron."""
    return person(
        s,
        dict(skin=SKIN_LIGHT, build="woman", garment="dress", top="#3d6b8a", apron="#f3ecdc", boots="#4a2a14",
             arms=("clasped", "clasped")),
        dict(skin=SKIN_LIGHT, shape=(1.04, 1.0, 0.96), face_len=0.92, chin="double", chin_size=0.9, nose="button", nose_size=1.1,
             hair="#c9a26a", hair_style="bun", brows="#a07a4a", brow_w=0.006, brow_tilt=-0.4, eyes="#4a6b3a", lashes=True,
             lids=0.12, lid_tilt=-0.5, smile=0.9, cheeks="#f3b4a4", lips="#d9907f", jaw=1.02),
        hat=(bonnet, "#e8d6b0"),
    )


def sofie(s):
    """Sofie Jensen: a curious girl with blonde braids and freckles, hands behind her back."""
    return person(
        s,
        dict(skin=SKIN_LIGHT, build="woman", garment="dress", top="#c8553d", apron="#f7f3ea", scale=0.72,
             arms=("behind", "behind")),
        dict(skin=SKIN_LIGHT, size=1.1, shape=(1.04, 1.0, 1.0), face_len=0.85, nose="button", nose_size=0.75, hair="#e8c050",
             hair_style="braids", brows="#c89a40", brow_w=0.006, brow_lift=0.8, eyes="#3d6b8a", eye_size=1.18, lashes=True,
             smile=1.0, cheeks="#f4a0a0", lips="#e08a80", jaw=0.9, freckles="#c9855a", gaze=(0.12, 0.05)),
    )


def wanbli(s):
    """Wanbli: a bright, steady Lakota girl with a beaded cape and long braids."""
    return person(
        s,
        dict(skin=SKIN_BROWN, build="woman", garment="dress", top="#c8a06a", yoke=["#2f4a78", "#f3ecdc", "#b8322a"], scale=0.74,
             boots="#8a6a44", arms=("relaxed", "hips")),
        dict(skin=SKIN_BROWN, size=1.08, face_len=0.9, cheekbones=0.5, nose="button", nose_size=0.95, hair="#1f1a17",
             hair_style="braids", brows="#1f1a17", brow_w=0.0068, brow_tilt=0.1, eyes="#3a2618", eye_size=1.08, lashes=True,
             lid_tilt=0.3, smile=0.65, cheeks="#c9765a", lips="#a85a48", jaw=0.9, chin="pointy", chin_size=0.9),
    )


def mato(s):
    """Mato: Wanbli's grandfather. A long, wise face, arms folded under the blanket."""
    return person(
        s,
        dict(skin=SKIN_DEEP, garment="buckskin", top="#b89060", trousers="#a8835a", boots="#8a6a44", beads="#2f4a78",
             blanket=["#8a2a22", "#e0b84a", "#2f4a78", "#e0b84a"], arms=("crossed", "crossed")),
        dict(skin=SKIN_DEEP, shape=(0.96, 1.0, 1.06), face_len=1.18, cheekbones=0.9, chin="square", nose="hook", nose_size=1.15,
             hair="#c8c4bc", hair_style="braids", brows="#c8c4bc", brow_w=0.009, eyes="#2a1a10", lids=0.38, lid_tilt=-0.3,
             bags=0.6, smile=0.35, age=0.9, jaw=1.02),
    )


def soldier(s, moustache=None, sergeant=False, skin=SKIN_LIGHT, hair="#5e3a1a", face=None):
    body = dict(skin=skin, garment="jacket", top="#2f4a78", trousers="#5b6f96", stripe="#e0b84a", boots="#1e1a16",
                tall_boots=True, limbs=True)
    look = dict(skin=skin, nose="round", nose_size=1.05, hair=hair, hair_style="short", brows=hair, brow_w=0.008,
                eyes="#4a3322", smile=0.35 if sergeant else 0.55, brow_tilt=0.7 if sergeant else 0.1, moustache=moustache,
                moustache_color=hair)
    look.update(face or {})
    rig = person(s, body, look, hat=(kepi, "#2f4a78", "#e0b84a", "#1f2f4a"))
    if sergeant:
        for sx, side in ((-1, "l"), (1, "r")):
            s.part = f"arm_{side}"
            for i in range(3):
                s.paint("box", V((sx * 0.3, 0.02, 1.25 - i * 0.035)), (0.06, 0.06, 0.008), color="#e0b84a")
        s.part = "body"
    return rig


def ruth(s):
    """Ruth, the telegraphist: a narrow, clever face, a telegram in her hands."""
    return person(
        s,
        dict(skin=SKIN_LIGHT, build="woman", garment="dress", top="#6b3a5a", apron="#f3ecdc", arms=("hold", "hold")),
        dict(skin=SKIN_LIGHT, shape=(0.94, 1.0, 1.04), face_len=1.08, chin="pointy", nose="long", nose_size=0.85, hair="#5e3a1a",
             hair_style="bun", brows="#5e3a1a", brow_w=0.006, brow_tilt=-0.1, brow_lift=0.4, eyes="#5a3a22", lashes=True,
             lids=0.2, lid_tilt=0.4, smile=0.55, lips="#c0706a", cheeks="#f0b4a0", jaw=0.88, gaze=(-0.1, -0.12)),
        extras=(telegram,),
    )


def morten(s):
    """Formand Morten: a broad, cheerful miner with his pickaxe over his shoulder."""
    return person(
        s,
        dict(skin=SKIN_WARM, garment="shirt", top="#a8322a", rolled=True, trousers="#4a4038", braces="#2a2320", belly=0.5,
             arms=("hips", "tool"), stance=0.04),
        dict(skin=SKIN_WARM, shape=(1.1, 1.0, 0.94), face_len=0.98, jaw=1.12, chin="square", nose="round", nose_size=1.3,
             nose_tint="#d98a70", hair="#4a3222", hair_style="short", brows="#3a2618", brow_w=0.011, brow_lift=0.3,
             eyes="#4a3322", eye_size=0.92, lid_tilt=-0.4, smile=0.95, beard="short", beard_color="#4a3222", moustache="thin",
             moustache_color="#3a2618", age=0.4),
        hat=(miner_helmet, "#6b4423"),
        extras=(lambda s, f, j: shoulder_tool(s, f, j, "pick"),),
    )


def miner(s):
    """Another miner (crowds): long and thin, sleepy-eyed, thumbs in his braces."""
    return person(
        s,
        dict(skin=SKIN_LIGHT, garment="shirt", top="#3d5a7a", rolled=True, trousers="#5a4a3a", braces="#6b4423",
             arms=("braces", "braces"), shift=-1),
        dict(skin=SKIN_LIGHT, shape=(0.94, 1.0, 1.06), face_len=1.2, jaw=0.9, chin="pointy", nose="long", nose_size=1.1,
             hair="#b8602a", hair_style="short", brows="#a0501e", eyes="#3d6b8a", lids=0.42, smile=0.4, beard="goatee",
             beard_color="#6a3414", cheeks="#f0a898", gaze=(0.15, 0)),
        hat=(miner_helmet, "#8a6a44"),
    )


def li(s):
    """Formand Li: a sharp, friendly foreman with the track plan under his arm."""
    return person(
        s,
        dict(skin=SKIN_TAN, garment="tunic", top="#2f4a78", trousers="#2a3346", boots="#1e1a16", sash="#1f2f4a",
             arms=("relaxed", "under_arm"), shift=1),
        dict(skin=SKIN_TAN, cheekbones=0.6, face_len=1.0, chin="round", nose="button", nose_size=1.05, hair="#1a1512",
             hair_style="short", brows="#1a1512", brow_w=0.009, brow_tilt=0.2, eyes="#2a1a10", lids=0.18, lid_tilt=0.35,
             smile=0.75, gaze=(-0.08, 0)),
        hat=(straw_hat, "#d9b870"),
        extras=(plan_roll,),
    )


def crew(s, variant):
    """Li's track crew: a round, cheerful one with a hammer, and a long-faced quiet one."""
    looks = [
        (dict(shape=(1.08, 1.0, 0.94), face_len=0.9, chin="double", nose="round", nose_size=1.0, smile=0.9, moustache="thin",
              eye_size=0.9, lid_tilt=-0.5, age=0.3),
         dict(arms=("relaxed", "tool"), stance=0.03), lambda s, f, j: shoulder_tool(s, f, j, "hammer")),
        (dict(shape=(0.94, 1.0, 1.04), face_len=1.2, chin="pointy", nose="long", nose_size=0.9, smile=0.2, lids=0.4, brow_tilt=0.3,
              jaw=0.9, eye_style="dot", eye_size=1.1),
         dict(arms=("crossed", "crossed"), shift=-1), None),
    ]
    face, pose, prop = looks[variant]
    tops = ["#3d5a7a", "#6b5a3a"]
    return person(
        s,
        dict(skin=SKIN_TAN, garment="tunic", top=tops[variant], trousers="#2a3346", boots="#1e1a16", sash=shade(tops[variant], 0.6),
             **pose),
        dict(skin=SKIN_TAN, hair="#1a1512", hair_style="short", brows="#1a1512", eyes="#2a1a10", moustache_color="#1a1512", **face),
        hat=(straw_hat, "#d9b870" if variant == 0 else "#c8a860"),
        extras=(prop,) if prop else (),
    )


#: The Bøvl brothers, smallest (and cleverest) first: size, coat colour, pose.
BOEVL = [
    (0.82, "#6b4a2e", ("hips", "hips")),
    (1.0, "#4a3a2a", ("crossed", "crossed")),
    (1.15, "#5a2a1a", ("behind", "behind")),
    (1.32, "#3a3a3a", ("relaxed", "relaxed")),
]


def boevl(s, i):
    """The Bøvl brothers: long chins, dot eyes and scowls, dimmer the taller."""
    scale, coat, arms = BOEVL[i]
    return person(
        s,
        dict(skin=SKIN_WARM, garment="duster", top=coat, trousers="#2a2320", boots="#1e1a16", bandana="#b8322a", scale=scale,
             arms=arms),
        dict(skin=SKIN_WARM, size=1.16 * scale**0.35, shape=(0.95, 1.0, 1.02 + i * 0.02), face_len=1.2 + i * 0.05, chin="square",
             chin_size=1.1 + i * 0.1, nose="long", nose_size=1.15, hair="#1a1512", hair_style="short", brows="#1a1512",
             brow_w=0.011, brow_tilt=1.0 - i * 0.35, eye_style="dot", eye_size=1.0 + i * 0.06, eye_gap=0.9 + i * 0.05,
             lids=0.3 if i == 0 else (0.0 if i == 3 else 0.15), smile=-0.6 + i * 0.35, ears=1.15 + i * 0.05,
             gaze=(0.25, 0.1) if i == 3 else (0, 0)),
        hat=(bowler, "#2a2320"),
    )


def woman(s, variant):
    """Townswomen for crowds: three faces, dresses, hairstyles and poses."""
    looks = [
        ("#6b3a5a", "#e8d6b0", "#5e3a1a", SKIN_LIGHT, dict(nose="button", face_len=0.92, chin="round", lids=0.1, smile=0.8),
         ("clasped", "clasped")),
        ("#2f6b4a", None, "#1f1a17", SKIN_BROWN, dict(nose="round", nose_size=0.85, cheekbones=0.6, face_len=1.02, lid_tilt=0.4,
                                                      smile=0.6), ("relaxed", "hips")),
        ("#8a5a2b", None, "#b8602a", SKIN_LIGHT, dict(nose="long", nose_size=0.9, face_len=1.1, chin="pointy", lids=0.3,
                                                      brow_lift=0.8, smile=0.3, freckles="#d9956a"), ("hold", "relaxed")),
    ]
    dress, hat_color, hair, skin, face, arms = looks[variant]
    return person(
        s,
        dict(skin=skin, build="woman", garment="dress", top=dress, apron="#f3ecdc" if variant != 1 else None, arms=arms),
        dict(skin=skin, hair=hair, hair_style="bun", brows=hair, brow_w=0.006, eyes="#4a3322", lashes=True,
             lips=shade(skin, 0.8), cheeks=shade(skin, 0.95), jaw=0.9, **face),
        hat=(bonnet, hat_color) if hat_color else None,
    )


def vest(s, f, j, color):
    """An open waistcoat over the shirt."""
    s.part = "body"
    c = V((0, 0.02 * f, 1.18 * f))
    outer = ell_fn(c, (0.225 * f, 0.205 * f, 0.3 * f))
    inner = ell_fn(c, (0.195 * f, 0.175 * f, 0.29 * f))
    band = lambda X, Y, Z: np.abs(Z - 1.19 * f) - 0.25 * f  # noqa: E731
    opening = lambda X, Y, Z: np.maximum(np.abs(X) - 0.07 * f, 0.02 * f - Y)  # noqa: E731
    body = minus(intersect(minus(outer, inner), band), opening)
    shape(s, body, c - V((0.24 * f, 0.22 * f, 0.31 * f)), c + V((0.24 * f, 0.22 * f, 0.31 * f)), color=color, k=0.01 * f)
    for i in range(3):
        s.studs.append(dict(part="body", center=V((0.075 * f, 0.215 * f, (1.3 - i * 0.09) * f)), radius=0.012 * f, color="#e0b84a"))


#: Key colours in the player avatars, swapped per player in the game (models.ts):
#: pure primaries, so they survive the colour-space conversion exactly.
KEY_HAT, KEY_SHIRT, KEY_VEST, KEY_BANDANA, KEY_SKIN, KEY_HAIR = "#ff00ff", "#00ff00", "#0000ff", "#ff0000", "#ffff00", "#00ffff"


def avatar(s, girl):
    """A young cowboy (or cowgirl) for the players: hat, shirt, vest, bandana and skin are recoloured in the game."""
    face = dict(skin=KEY_SKIN, size=1.25, face_len=0.88, nose="button", nose_size=0.95, hair=KEY_HAIR, brows=KEY_HAIR,
                brow_w=0.007, eyes="#4a3322", eye_size=1.12, smile=0.9, lips=KEY_SKIN, jaw=0.94)
    if girl:
        face.update(hair_style="braids", lashes=True, chin="pointy", chin_size=0.9)
    else:
        face.update(hair_style="short", chin="round", brow_w=0.008)
    return person(
        s,
        dict(skin=KEY_SKIN, garment="shirt", top=KEY_SHIRT, collar=KEY_SHIRT, braces=None, trousers="#3d4f6b", boots="#5e3a1a",
             bandana=KEY_BANDANA, limbs=True, build="woman" if girl else "man", belly=0.0),
        face,
        hat=(cowboy_hat, KEY_HAT, "#3a2615"),
        extras=(lambda s, f, j: vest(s, f, j, KEY_VEST),),
    )


CHARACTERS = {
    "avatar-boy": lambda s: avatar(s, False),
    "avatar-girl": lambda s: avatar(s, True),
    "pind": pind,
    "jensen": jensen,
    "sofie": sofie,
    "wanbli": wanbli,
    "mato": mato,
    "soldier": lambda s: soldier(s, face=dict(chin="square", jaw=1.06, lid_tilt=-0.2)),
    "soldier-m": lambda s: soldier(s, moustache="handlebar", hair="#3a2618", face=dict(shape=(1.08, 1, 0.95), face_len=0.92,
                                                                                    nose_size=1.2, smile=0.8, lids=0.15)),
    "sergeant": lambda s: soldier(s, moustache="walrus", sergeant=True, hair="#6b4423",
                                  face=dict(chin="square", chin_size=1.25, jaw=1.12, lids=0.3, face_len=1.05, eye_size=0.9)),
    "ruth": ruth,
    "morten": morten,
    "miner": miner,
    "li": li,
    "crew-a": lambda s: crew(s, 0),
    "crew-b": lambda s: crew(s, 1),
    "boevl-1": lambda s: boevl(s, 0),
    "boevl-2": lambda s: boevl(s, 1),
    "boevl-3": lambda s: boevl(s, 2),
    "boevl-4": lambda s: boevl(s, 3),
    "woman-a": lambda s: woman(s, 0),
    "woman-b": lambda s: woman(s, 1),
    "woman-c": lambda s: woman(s, 2),
}
