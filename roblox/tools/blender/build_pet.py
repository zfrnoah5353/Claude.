# Reconstruit un pet dans Blender à partir de ses primitives (tools/web/primexport.js) :
# sphères lisses, cylindres et tores arrondis, blocs biseautés, cristaux à facettes.
# Sortie : un .fbx avec squelette (un os par partie animée) prêt pour l'import 3D de
# Roblox, quelques maillages seulement, couleurs lues dans une texture palette commune.
#
# blender -b --python build_pet.py -- prims/kraken.json palette.json sortie/ [--budget 40000] [--render apercu.png]
#
# Maillages produits (le jeu les reconnaît par leur nom) :
#   plastic, plastic_2… : couleurs de la palette (texture)
#   gold, gold_2…       : parties métalliques (texture)
#   neon_RRGGBB         : parties lumineuses (couleur dans le nom)
#   glass_RRGGBB        : parties translucides
# Os : Root (origine du modèle), un os par os du pet (nom identique au plan), et trois
# repères RefO, RefX, RefY à (0,0,0), (10,0,0), (0,10,0) pour retrouver l'échelle.
import bpy, bmesh, json, math, sys, os
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, PALETTE, OUT = argv[0], argv[1], argv[2]
RENDER = argv[argv.index("--render") + 1] if "--render" in argv else None
BUDGET = int(argv[argv.index("--budget") + 1]) if "--budget" in argv else 40000
MAX_TRIS = 19000  # limite d'un maillage Roblox : 20 000 triangles
os.makedirs(OUT, exist_ok=True)
data = json.load(open(SRC))
pal = json.load(open(PALETTE))  # { "cells": 16, "colors": { "FF8FB8": index } , "image": "palette.png" }
PID = data["id"]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Les données sont en Y vers le haut (Roblox, glTF) ; Blender est en Z vers le haut.
Y2Z = Matrix.Rotation(math.radians(90), 4, "X")


def V(a):
    return Vector((a[0], a[1], a[2]))


def Q(a):  # [x, y, z, w] -> Quaternion(w, x, y, z)
    return Quaternion((a[3], a[0], a[1], a[2]))


def to_z(v):
    return (Y2Z @ v.to_4d()).to_3d()


def srgb_to_lin(hexc):
    c = tuple(int(hexc[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def uv_of(hexc):
    n = pal["cells"]
    i = pal["colors"][hexc.upper()]
    cx, cy = i % n, i // n
    return ((cx + 0.5) / n, 1 - (cy + 0.5) / n)


# --- matériaux -------------------------------------------------------------
img = bpy.data.images.load(os.path.abspath(os.path.join(os.path.dirname(PALETTE), pal["image"])))


def textured(name, metal):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 1.0 if metal else 0.0
    bsdf.inputs["Roughness"].default_value = 0.25 if metal else 0.42
    if not metal:
        bsdf.inputs["Coat Weight"].default_value = 0.35
        bsdf.inputs["Coat Roughness"].default_value = 0.15
    return m


def flat(name, hexc, kind):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    lin = srgb_to_lin(hexc)
    bsdf.inputs["Base Color"].default_value = (*lin, 1)
    if kind == "neon":
        bsdf.inputs["Emission Color"].default_value = (*lin, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.5
    else:
        bsdf.inputs["Transmission Weight"].default_value = 0.7
        bsdf.inputs["Roughness"].default_value = 0.08
        bsdf.inputs["Alpha"].default_value = 0.6
        m.blend_method = "BLEND"
    return m


# --- primitives (bmesh, repère Y vers le haut) -----------------------------
def sphere_bm(segs):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=1.0)
    return bm


def cone_bm(r1, r2, h, segs):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=max(r2, 0.0001), depth=h)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90), 3, "X"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, h / 2, 0))
    return bm


def box_bm(sx, sy, sz):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    w = min(sx, sy, sz) * 0.16
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=w, segments=2, affect="EDGES", profile=0.5)
    return bm


def torus_bm(R, r, segs, tube):
    bm = bmesh.new()
    for i in range(segs):
        a = 2 * math.pi * i / segs
        for j in range(tube):
            b = 2 * math.pi * j / tube
            bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    bm.verts.ensure_lookup_table()
    for i in range(segs):
        for j in range(tube):
            a0, a1 = i, (i + 1) % segs
            b0, b1 = j, (j + 1) % tube
            bm.faces.new((bm.verts[a0 * tube + b0], bm.verts[a1 * tube + b0], bm.verts[a1 * tube + b1], bm.verts[a0 * tube + b1]))
    return bm


def gear_bm(R, teeth, thick):
    bm = bmesh.new()
    pts = []
    n = teeth * 4
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = R if i % 4 < 2 else R * 0.8
        pts.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, -thick / 2)))
    f = bm.faces.new(pts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    vs = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=vs, vec=(0, 0, thick))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def aim_quat(d):
    return Vector((0, 1, 0)).rotation_difference(d.normalized())


# détail selon le budget du pet
DETAIL = 1.0 if BUDGET >= 30000 else 0.75 if BUDGET >= 15000 else 0.6


def quality(r):
    return max(8, min(32, int((10 + 26 * r) * DETAIL)))


pieces = []  # (bm, matrix, color, mat, bone, smooth)


def add(bm, mtx, p, smooth):
    pieces.append((bm, mtx, p["color"].upper(), p["mat"], p["bone"], smooth))


for p in data["prims"]:
    t = p["t"]
    if t == "ell":
        s = V(p["size"])
        add(sphere_bm(quality(max(s))), Matrix.LocRotScale(V(p["pos"]), Q(p["quat"]), s), p, True)
    elif t == "box":
        add(box_bm(*V(p["size"])), Matrix.LocRotScale(V(p["pos"]), Q(p["quat"]), None), p, True)
    elif t == "seg":
        a, b = V(p["a"]), V(p["b"])
        d = b - a
        if d.length < 1e-4:
            continue
        segs = max(6, min(24, int((8 + 30 * max(p["ra"], p["rb"])) * DETAIL)))
        add(cone_bm(p["ra"], p["rb"], d.length, segs), Matrix.LocRotScale(a, aim_quat(d), None), p, True)
    elif t == "spike":
        L, w = p["len"], p["w"]
        m = Matrix.LocRotScale(V(p["pos"]), aim_quat(V(p["dir"])), None)
        add(cone_bm(w, 0, L, 6), m, p, False)
        base = cone_bm(w, 0, L * 0.18, 6)
        bmesh.ops.scale(base, vec=(1, -1, 1), verts=base.verts)
        bmesh.ops.reverse_faces(base, faces=base.faces)
        add(base, m, p, False)
    elif t == "shard":
        L, w = p["len"], p["w"]
        bm = cone_bm(w, 0, L, 3)
        bmesh.ops.scale(bm, vec=(1, 1, 0.35), verts=bm.verts)
        q = aim_quat(V(p["dir"]))
        if p.get("normal"):
            ln = q.inverted() @ V(p["normal"])
            ln.y = 0
            if ln.length > 1e-6:
                q = q @ Vector((0, 0, 1)).rotation_difference(ln.normalized())
        add(bm, Matrix.LocRotScale(V(p["pos"]), q, None), p, False)
    elif t == "ring":
        full = p.get("arc", 6.3) >= 2 * math.pi - 1e-3
        add(torus_bm(p["R"], p["r"], int((48 if full else 24) * DETAIL), 10), Matrix.LocRotScale(V(p["pos"]), Q(p["quat"]), None), p, True)
    elif t == "gear":
        add(gear_bm(p["R"], p["teeth"], p["thick"]), Matrix.LocRotScale(V(p["pos"]), Q(p["quat"]), None), p, False)

# --- squelette -------------------------------------------------------------
bones = data["bones"]  # 0 = racine (origine)
bone_names = ["Root"] + [b["name"] for b in bones[1:]]
arm_data = bpy.data.armatures.new("Rig")
arm = bpy.data.objects.new("pet_" + PID, arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
ebs = []
for i, b in enumerate(bones):
    eb = arm_data.edit_bones.new(bone_names[i])
    head = to_z(V(b["pivot"]))
    eb.head = head
    eb.tail = head + Vector((0, 0, 0.25))
    eb.roll = 0
    ebs.append(eb)
for i, b in enumerate(bones):
    if i > 0:
        ebs[i].parent = ebs[max(0, b["parent"])]
for nm, pos in (("RefO", (0, 0, 0)), ("RefX", (10, 0, 0)), ("RefY", (0, 10, 0))):
    eb = arm_data.edit_bones.new(nm)
    eb.head = to_z(V(pos))
    eb.tail = eb.head + Vector((0, 0, 0.25))
    eb.parent = ebs[0]
bpy.ops.object.mode_set(mode="OBJECT")

# --- maillages : regroupement par matière, texture palette, poids d'os ----
groups = {}  # nom -> liste de (bm, bone)
for bm, mtx, col, mat, bone, smooth in pieces:
    bm.transform(Y2Z @ mtx)
    for f in bm.faces:
        f.smooth = smooth
    if mat in ("neon", "glass"):
        key = f"{mat}_{col}"
    else:
        key = "gold" if mat == "gold" else "plastic"
        uv = uv_of(col)
        layer = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l in f.loops:
                l[layer].uv = uv
    groups.setdefault(key, []).append((bm, bone))


def count_tris(bm):
    return sum(len(f.verts) - 2 for f in bm.faces)


total = sum(count_tris(bm) for lst in groups.values() for bm, _ in lst)
ratio = min(1.0, BUDGET / max(1, total))

objs = []
for key, lst in groups.items():
    # découpe en morceaux de moins de MAX_TRIS triangles (après simplification)
    chunks, cur, cur_tris = [], [], 0
    for bm, bone in lst:
        n = count_tris(bm) * ratio
        if cur and cur_tris + n > MAX_TRIS:
            chunks.append(cur)
            cur, cur_tris = [], 0
        cur.append((bm, bone))
        cur_tris += n
    if cur:
        chunks.append(cur)
    for ci, chunk in enumerate(chunks):
        name = key if ci == 0 else f"{key}_{ci + 1}"
        me = bpy.data.meshes.new(name)
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        merged = bmesh.new()
        dl = merged.verts.layers.deform.verify()
        bone_of_vert = []
        for bm, bone in chunk:
            tmp = bpy.data.meshes.new("tmp")
            bm.to_mesh(tmp)
            start = len(merged.verts)
            merged.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
            bone_of_vert.extend([bone] * (len(merged.verts) - start))
            bm.free()
        merged.verts.ensure_lookup_table()
        used = sorted(set(bone_of_vert))
        vg_index = {}
        for bi in used:
            vg = ob.vertex_groups.new(name=bone_names[bi])
            vg_index[bi] = vg.index
        for v, bi in zip(merged.verts, bone_of_vert):
            v[dl][vg_index[bi]] = 1.0
        merged.to_mesh(me)
        merged.free()
        if key.startswith("plastic"):
            me.materials.append(textured("Plastic", False))
        elif key.startswith("gold"):
            me.materials.append(textured("Gold", True))
        else:
            kind, hexc = key.split("_")[0], key.split("_")[1]
            me.materials.append(flat(key, hexc, kind))
        if ratio < 0.999:
            mod = ob.modifiers.new("dec", "DECIMATE")
            mod.ratio = max(0.3, ratio)
            with bpy.context.temp_override(object=ob, active_object=ob):
                bpy.ops.object.modifier_apply(modifier="dec")
        ob.parent = arm
        am = ob.modifiers.new("Rig", "ARMATURE")
        am.object = arm
        objs.append(ob)

tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objs)
print(f"[{PID}] {len(objs)} maillages, {tris} triangles, {len(bone_names)} os")

bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
for ob in objs:
    ob.select_set(True)
bpy.ops.export_scene.fbx(
    filepath=os.path.join(OUT, "pet_" + PID + ".fbx"),
    use_selection=True,
    apply_unit_scale=True,
    axis_forward="-Z",
    axis_up="Y",
    object_types={"ARMATURE", "MESH"},
    mesh_smooth_type="FACE",
    add_leaf_bones=False,
    use_armature_deform_only=False,
    primary_bone_axis="Y",
    secondary_bone_axis="X",
    path_mode="COPY",
    embed_textures=True,
    bake_anim=False,
)

# --- aperçu (pose de repos) ------------------------------------------------
if RENDER:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = False
    scene.render.resolution_x = scene.render.resolution_y = 640
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.98, 0.93, 1.0, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    bpy.ops.mesh.primitive_plane_add(size=80)
    floor = bpy.context.object
    fm = bpy.data.materials.new("floor")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.95, 0.85, 0.95, 1)
    floor.data.materials.append(fm)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(35))
    scene.collection.objects.link(sun)
    pts = [ob.matrix_world @ Vector(c) for ob in objs for c in ob.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (mn + mx) / 2
    size = max(mx - mn)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    yaw = math.radians(25)
    d = size * 2.3
    # l'avant du pet (-Z en Y vers le haut) est +Y dans Blender
    cam.location = c + Vector((math.sin(yaw) * d, math.cos(yaw) * d, d * 0.42))
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = RENDER
    bpy.ops.render.render(write_still=True)
