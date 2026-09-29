"""
Builds the game's people with headless Blender (see sdf.py and characters.py).

For each character: every part (body, head, beard …) is meshed from its signed
distance field at its own resolution, decimated to two levels of detail, coloured
per vertex from the sculpt, and given baked ambient occlusion (in the vertex
alpha). Parts hang from pivot nodes (body → head → beard …) so the game can turn
heads and swing legs.

Output (committed): <out>/<name>.glb and manifest.json. The GLB holds nodes named
after the parts, each with children <part>_lod0 and <part>_lod1.
glTF axes: +Y up, the character faces -Z (Blender +Y), feet at y = 0.

    blender --background --factory-startup --python build.py -- --out DIR [--only a,b] [--force] [--preview]
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from skimage import measure  # noqa: E402

from characters import CHARACTERS  # noqa: E402
from horse import HORSES  # noqa: E402
from animals import ANIMALS  # noqa: E402

MODELS = {**CHARACTERS, **HORSES, **ANIMALS}

#: Marching-cubes cell size per part (fine for faces, coarser for clothes).
VOXEL = {"head": 0.002, "beard": 0.0028}
VOXEL_DEFAULT = 0.006
#: Triangle budgets: LOD0 up close, LOD1 from ~15 m.
LIMB = (1100, 260)
TRIS = {"head": (8000, 1100), "beard": (1400, 240), "arm_l": LIMB, "arm_r": LIMB, "leg_l": LIMB, "leg_r": LIMB}
TRIS_DEFAULT = (4000, 700)
#: How much of the baked occlusion the game shows (0 = none).
AO_STRENGTH = 1.0
#: Decimation weight for vertices on colour edges (1 = like the rest, 0 = never simplified).
#: Faces keep theirs more: the hairline, lips and brows are what you look at.
KEEP_WEIGHT = 0.3
KEEP_WEIGHT_HEAD = 0.15


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    world = bpy.data.worlds.new("world")
    scene.world = world
    world.light_settings.distance = 0.06  # AO reach in metres


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def mesh_part(sculpt, part, voxel):
    D, lo = sculpt.field(part, voxel)
    verts, faces, _n, _v = measure.marching_cubes(D, level=0.0, spacing=(voxel, voxel, voxel))
    verts += np.array([lo.x, lo.y, lo.z], dtype=np.float32)
    me = bpy.data.meshes.new(part)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.update()
    obj = link(bpy.data.objects.new(part, me))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=voxel * 0.05)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    # A gentle smoothing pass takes the voxel stair-steps out.
    sm = obj.modifiers.new("smooth", "CORRECTIVE_SMOOTH")
    sm.iterations = 3
    sm.smooth_type = "SIMPLE"
    sm.use_only_smooth = True
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=sm.name)
    protect_color_edges(obj, sculpt, part)
    return obj


def protect_color_edges(obj, sculpt, part):
    """
    A vertex group the decimator uses: 1 = simplify freely, 0 = keep. Vertices along
    colour boundaries (and one ring around them) are kept, so colour edges stay smooth.
    """
    me = obj.data
    verts = np.array([v.co[:] for v in me.vertices])
    rgb = sculpt.colors(part, verts)
    key = (rgb * 255).round().astype(np.int32) @ np.array([65536, 256, 1])
    e = np.array([ed.vertices[:] for ed in me.edges])
    edge = e[key[e[:, 0]] != key[e[:, 1]]]
    keep = np.zeros(len(verts), dtype=bool)
    keep[edge.ravel()] = True
    ring = e[keep[e[:, 0]] | keep[e[:, 1]]]
    keep[ring.ravel()] = True
    group = obj.vertex_groups.new(name="simplify")
    group.add(np.nonzero(~keep)[0].tolist(), 1.0, "REPLACE")
    group.add(np.nonzero(keep)[0].tolist(), KEEP_WEIGHT_HEAD if part == "head" else KEEP_WEIGHT, "REPLACE")


def decimate(src, tris, name):
    obj = src.copy()
    obj.data = src.data.copy()
    obj.name = name
    link(obj)
    have = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if have > tris:
        mod = obj.modifiers.new("decimate", "DECIMATE")
        mod.ratio = tris / have
        mod.use_collapse_triangulate = True
        if "simplify" in obj.vertex_groups:
            mod.vertex_group = "simplify"
        select_only(obj)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate()
    obj.data.shade_smooth()
    return obj


def set_face_colors(obj, rgb):
    """One flat colour per face (corner domain): crisp, toon-style colour edges."""
    me = obj.data
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    for poly in me.polygons:
        r, g, b = rgb[poly.index]
        for li in poly.loop_indices:
            col.data[li].color_srgb = (r, g, b, 1.0)
    me.color_attributes.active_color = col


def paint(obj, sculpt, part):
    """Albedo from the sculpt, sampled at each face's centre."""
    centers = np.array([p.center[:] for p in obj.data.polygons])
    set_face_colors(obj, sculpt.colors(part, centers))


def make_eyes(eyes, segments, rings, name):
    """
    Eyeballs as UV spheres with the pole looking forward (+Y): the latitude rings
    are circles round the gaze, so the iris and pupil come out perfectly round.
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    colors = []
    for e in eyes:
        before = len(bm.faces)
        geom = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=e["radius"])
        verts = [g for g in geom["verts"]]
        # Pole (+Z) → where the eye looks (about +Y), then into place.
        forward = Vector(e.get("look", (0, 1, 0))).normalized()
        m = Matrix.Translation(e["center"]) @ Vector((0, 0, 1)).rotation_difference(forward).to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=m, verts=verts)
        bm.faces.ensure_lookup_table()
        center = Vector(e["center"])
        # A catch-light up and to the outer side.
        light = Vector((-0.35 * e["side"], 1.0, 0.45)).normalized()
        iris = tuple(int(e["iris"].lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4))
        dot = e.get("style") == "dot"
        for f in bm.faces[before:]:
            d = (f.calc_center_median() - center).normalized()
            ang = np.degrees(forward.angle(d))
            if np.degrees(light.angle(d)) < (14 if dot else 9):
                colors.append((1.0, 1.0, 1.0))
            elif dot or ang < 15.5:
                colors.append((0.05, 0.035, 0.03))
            elif ang < 31:
                colors.append(iris)
            else:
                colors.append((0.97, 0.955, 0.925))
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new(name, me))
    me.shade_smooth()
    set_face_colors(obj, colors)
    return obj


def make_rings(rings, segments, sides, name):
    """Thin rings and rods (spectacles) as real tubes: crisp at any size."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    colors = []
    for r in rings:
        before = len(bm.faces)
        if r["kind"] == "ring":
            path = [r["center"] + r["R"] @ Vector((np.cos(a) * r["major"], np.sin(a) * r["major"], 0)) for a in np.linspace(0, 2 * np.pi, segments, endpoint=False)]
            closed = True
        else:
            path = [Vector(r["a"]), Vector(r["b"])]
            closed = False
        tube(bm, path, r["minor"], sides, closed)
        rgb = tuple(int(r["color"].lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4))
        colors += [rgb] * (len(bm.faces) - before)
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new(name, me))
    me.shade_smooth()
    set_face_colors(obj, colors)
    return obj


def tube(bm, path, radius, sides, closed):
    """A round tube along a polyline (closed = a ring), capped when open."""
    n = len(path)
    rings = []
    for i, p in enumerate(path):
        prev = path[(i - 1) % n] if closed or i > 0 else p
        nxt = path[(i + 1) % n] if closed or i < n - 1 else p
        t = (nxt - prev).normalized()
        u = t.orthogonal().normalized()
        v = t.cross(u)
        rings.append([bm.verts.new(p + (u * np.cos(a) + v * np.sin(a)) * radius) for a in np.linspace(0, 2 * np.pi, sides, endpoint=False)])
    for i in range(n if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(sides):
            bm.faces.new((a[j], a[(j + 1) % sides], b[(j + 1) % sides], b[j]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def make_studs(studs, segments, rings):
    """Buttons and rivets: small real spheres, each in its own flat colour."""
    me = bpy.data.meshes.new("studs")
    bm = bmesh.new()
    colors = []
    for st in studs:
        before = len(bm.faces)
        geom = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=st["radius"])
        bmesh.ops.scale(bm, vec=(1, 0.55, 1), verts=geom["verts"])
        bmesh.ops.translate(bm, vec=st["center"], verts=geom["verts"])
        rgb = tuple(int(st["color"].lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4))
        colors += [rgb] * (len(bm.faces) - before)
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new("studs", me))
    me.shade_smooth()
    set_face_colors(obj, colors)
    return obj


def join_into(target, other):
    bpy.ops.object.select_all(action="DESELECT")
    other.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()


def bake_ao(obj):
    """Cycles ambient occlusion per vertex into the colour alpha (0 = occluded, 1 = open)."""
    me = obj.data
    tmp = me.color_attributes.new("AO", "BYTE_COLOR", "POINT")
    me.color_attributes.active_color = tmp
    if not me.materials:
        me.materials.append(bpy.data.materials.new("bake"))
    scene = bpy.context.scene
    scene.cycles.samples = 256
    scene.render.bake.target = "VERTEX_COLORS"
    scene.render.bake.use_selected_to_active = False
    select_only(obj)
    bpy.ops.object.bake(type="AO")
    ao = np.array([d.color[0] for d in tmp.data])
    me.color_attributes.remove(tmp)
    # Smooth it a little: marching-cubes meshes are noisy up close.
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    for _ in range(2):
        ao = np.array([(ao[v.index] + sum(ao[e.other_vert(v).index] for e in v.link_edges)) / (1 + len(v.link_edges)) for v in bm.verts])
    bm.free()
    col = me.color_attributes["Col"]
    me.color_attributes.active_color = col
    for loop in me.loops:
        d = col.data[loop.index]
        r, g, b, _a = d.color_srgb
        d.color_srgb = (r, g, b, float(np.clip(1 - (1 - ao[loop.vertex_index]) * AO_STRENGTH, 0, 1)))
    me.materials.clear()


def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    kwargs = dict(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="NONE",
        export_extras=False,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color="ACTIVE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs, export_colors=True)


def preview_material():
    mat = bpy.data.materials.new("preview")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.65
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(attr.outputs["Color"], mix.inputs[6])
    comb = nt.nodes.new("ShaderNodeCombineColor")
    for k in range(3):
        nt.links.new(attr.outputs["Alpha"], comb.inputs[k])
    nt.links.new(comb.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return mat


def preview(objs, path, focus, distance, lens=55):
    """A studio render for reviewing the sculpt (Cycles, CPU)."""
    scene = bpy.context.scene
    mat = preview_material()
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
    cam = link(bpy.data.objects.new("cam", bpy.data.cameras.new("cam")))
    cam.data.lens = lens
    target = Vector(focus)
    cam.location = target + Vector((0.55, 1.7, 0.25)).normalized() * distance
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    for loc, energy in (((1.5, 2.5, 3.0), 400), ((-2.5, 1.5, 1.8), 120), ((0.5, -2.5, 2.5), 250)):
        light = link(bpy.data.objects.new("light", bpy.data.lights.new("light", "AREA")))
        light.data.energy = energy
        light.data.size = 1.5
        light.location = loc
        light.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.75, 0.82, 0.9, 1)
    bg.inputs["Strength"].default_value = 0.5
    scene.render.resolution_x = 560
    scene.render.resolution_y = 700
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def build(name, fn, out, cache, want_preview):
    from sdf import Sculpt

    reset()
    sculpt = Sculpt()
    rig = fn(sculpt)
    pivots, parents = rig["pivots"], rig["parents"]
    nodes, lods = {}, {0: [], 1: []}
    tris = 0
    voxels, budgets = rig.get("voxel", {}), rig.get("tris", {})
    for part in sculpt.parts():
        raw = mesh_part(sculpt, part, voxels.get(part, VOXEL.get(part, VOXEL_DEFAULT)))
        t0, t1 = budgets.get(part, TRIS.get(part, TRIS_DEFAULT))
        lod0 = decimate(raw, t0, f"{part}_lod0")
        lod1 = decimate(raw, t1, f"{part}_lod1")
        bpy.data.objects.remove(raw)
        for o in (lod0, lod1):
            paint(o, sculpt, part)
        studs = [st for st in sculpt.studs if st["part"] == part]
        if studs:
            for o, seg in ((lod0, (10, 6)), (lod1, (6, 4))):
                join_into(o, make_studs(studs, *seg))
        lods[0].append((part, lod0))
        lods[1].append((part, lod1))
    if sculpt.rings:
        lods[0].append(("glasses", make_rings(sculpt.rings, 32, 8, "glasses_lod0")))
        lods[1].append(("glasses", make_rings(sculpt.rings, 14, 4, "glasses_lod1")))
    if sculpt.eyes:
        lods[0].append(("eyes", make_eyes(sculpt.eyes, 28, 24, "eyes_lod0")))
        lods[1].append(("eyes", make_eyes(sculpt.eyes, 12, 10, "eyes_lod1")))
    tris = sum(len(p.vertices) - 2 for _part, o in lods[0] for p in o.data.polygons)
    # Occlusion from the whole figure (only one level of detail visible at a time).
    for level in (0, 1):
        for other in lods[1 - level]:
            other[1].hide_render = True
        for _part, o in lods[level]:
            o.hide_render = False
        for _part, o in lods[level]:
            bake_ao(o)
    for level in (0, 1):
        for _part, o in lods[level]:
            o.hide_render = False
    # Eyes and spectacles never move on their own: join them into the head (fewer draw calls).
    for level in (0, 1):
        head = next((o for p, o in lods[level] if p == "head"), None) or next((o for p, o in lods[level] if p == "body"), None)
        extra = [o for p, o in lods[level] if p in ("eyes", "glasses")]
        if head and extra:
            bpy.ops.object.select_all(action="DESELECT")
            for o in extra:
                o.select_set(True)
            head.select_set(True)
            bpy.context.view_layer.objects.active = head
            bpy.ops.object.join()
            lods[level] = [(p, o) for p, o in lods[level] if p not in ("eyes", "glasses")]
    # Pivot nodes: empties at each part's pivot, meshes re-centred under them.
    for part in [p for p, _o in lods[0]]:
        empty = link(bpy.data.objects.new(part, None))
        empty.location = pivots.get(part, Vector((0, 0, 0)))
        nodes[part] = empty
    for part, empty in nodes.items():
        parent = parents.get(part)
        if parent:
            empty.parent = nodes[parent]
            empty.location = pivots[part] - pivots.get(parent, Vector((0, 0, 0)))
    for level in (0, 1):
        for part, o in lods[level]:
            pivot = pivots.get(part, Vector((0, 0, 0)))
            o.data.transform(Matrix.Translation(-pivot))
            o.location = (0, 0, 0)
            o.parent = nodes[part]
    bpy.context.view_layer.update()
    export(list(nodes.values()) + [o for _p, o in lods[0] + lods[1]], out / f"{name}.glb")
    if want_preview:
        shown = [o for _p, o in lods[0]]
        for _p, o in lods[1]:
            o.hide_render = True
        head = pivots.get("head", Vector((0, 0, 1.5)))
        face_focus, face_dist = rig.get("preview_face", (head + Vector((0, 0.05, 0.2)), 0.75))
        body_focus, body_dist = rig.get("preview_body", (Vector((0, 0, 0.95)), 3.4))
        preview(shown, cache / f"{name}-face.png", face_focus, face_dist, lens=70)
        preview(shown, cache / f"{name}.png", body_focus, body_dist, lens=55)
    return tris


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/out", type=Path)
    ap.add_argument("--cache", default="/cache", type=Path)
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args(argv)

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    here = Path(__file__).parent
    code_hash = hashlib.sha1(b"".join((here / f).read_bytes() for f in ("build.py", "sdf.py", "characters.py", "horse.py", "animals.py"))).hexdigest()[:12]
    only = [n for n in args.only.split(",") if n]
    for name, fn in MODELS.items():
        if only and name not in only:
            continue
        key = f"{code_hash}-{name}"
        fresh = manifest.get(name, {}).get("hash") == key and (out / f"{name}.glb").exists()
        if fresh and not args.force and not args.preview:
            continue
        print(f"[models] {name}", flush=True)
        tris = build(name, fn, out, args.cache, args.preview)
        manifest[name] = {"hash": key, "file": f"{name}.glb", "tris": tris}
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        print(f"[models]   {tris} triangles (LOD0)", flush=True)


main()
