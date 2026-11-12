"""Construit une tour "aiguille" de 828 m dans Blender (plan en Y, retraits en spirale),
son parvis, un lac, une ville autour, puis rend des images et exporte .blend + .glb.

Usage :  python3 build_tower.py [--quick] [--out DOSSIER]
"""
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Vector

QUICK = "--quick" in sys.argv
OUT = os.path.dirname(os.path.abspath(__file__))
if "--out" in sys.argv:
    OUT = sys.argv[sys.argv.index("--out") + 1]

random.seed(7)
rng = np.random.default_rng(7)

TILE_W = 24.0   # largeur couverte par une tuile de texture (16 panneaux vitrés)
TILE_H = 59.2   # hauteur couverte (16 étages)
CELLS = 16
SOLID_UV = (0.5 / CELLS, 0.08 / CELLS)
HERO_AZ = math.atan2(-1010, -420)  # un point dans l'allège métallique : couleur unie


# --------------------------------------------------------------------------- textures
def facade_textures():
    n = 1024
    c = n // CELLS
    base = np.zeros((n, n, 4), np.float32)
    rough = np.zeros((n, n, 4), np.float32)
    emit = np.zeros((n, n, 4), np.float32)
    base[..., 3] = rough[..., 3] = emit[..., 3] = 1.0
    for cy in range(CELLS):
        for cx in range(CELLS):
            y0, x0 = cy * c, cx * c
            tint = rng.uniform(0.75, 1.25)
            glass = np.array([0.07, 0.2, 0.3]) * tint
            base[y0:y0 + c, x0:x0 + c, :3] = glass
            rough[y0:y0 + c, x0:x0 + c, :3] = rng.uniform(0.03, 0.09)
            if rng.random() < 0.09:  # fenêtre allumée
                warm = np.array([1.0, 0.72, 0.38]) * rng.uniform(0.35, 1.0)
                grad = np.linspace(0.6, 1.0, c - 14)[:, None, None]
                emit[y0 + 14:y0 + c, x0 + 3:x0 + c, :3] = warm * grad
    for k in range(CELLS):
        base[k * c:k * c + 12, :, :3] = (0.62, 0.66, 0.70)   # allège
        rough[k * c:k * c + 12, :, :3] = 0.38
        emit[k * c:k * c + 12, :, :3] = 0
        base[:, k * c:k * c + 3, :3] = (0.70, 0.72, 0.75)    # meneau
        rough[:, k * c:k * c + 3, :3] = 0.3
        emit[:, k * c:k * c + 3, :3] = 0

    def img(name, arr, non_color=False):
        im = bpy.data.images.new(name, n, n, alpha=False)
        im.pixels.foreach_set(arr.ravel())
        if non_color:
            im.colorspace_settings.name = "Non-Color"
        im.pack()
        return im

    return img("facade_color", base), img("facade_rough", rough, True), img("facade_emit", emit)


# --------------------------------------------------------------------------- matériaux
def principled(name, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    for k, v in kw.items():
        b.inputs[k].default_value = v
    return m, b


def make_materials():
    col, rgh, emi = facade_textures()
    glass, b = principled("Facade", Metallic=0.9)
    nt = glass.node_tree
    for im, sock in ((col, "Base Color"), (rgh, "Roughness"), (emi, "Emission Color")):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = im
        nt.links.new(t.outputs["Color"], b.inputs[sock])
    b.inputs["Emission Strength"].default_value = 2.5

    steel, _ = principled("Acier", **{"Base Color": (0.78, 0.8, 0.83, 1), "Metallic": 1.0, "Roughness": 0.22})
    stone, _ = principled("Pierre", **{"Base Color": (0.72, 0.68, 0.62, 1), "Roughness": 0.6})
    ground, _ = principled("Sol", **{"Base Color": (0.42, 0.33, 0.24, 1), "Roughness": 0.85})
    water, wb = principled("Eau", **{"Base Color": (0.01, 0.05, 0.07, 1), "Roughness": 0.04, "Metallic": 0.0})
    wb.inputs["Specular IOR Level"].default_value = 1.0
    nt = water.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.35
    noise.inputs["Detail"].default_value = 6
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], wb.inputs["Normal"])
    return dict(glass=glass, steel=steel, stone=stone, ground=ground, water=water)


# --------------------------------------------------------------------------- géométrie
class MeshBuilder:
    def __init__(self):
        self.v, self.f, self.uv = [], [], []

    def prism(self, outline, z0, z1, u0=0.0, top=True):
        n = len(outline)
        i0 = len(self.v)
        self.v += [(x, y, z0) for x, y in outline] + [(x, y, z1) for x, y in outline]
        s = u0
        for i in range(n):
            j = (i + 1) % n
            d = math.dist(outline[i], outline[j])
            self.f.append((i0 + i, i0 + j, i0 + n + j, i0 + n + i))
            ua, ub = s / TILE_W, (s + d) / TILE_W
            self.uv += [(ua, z0 / TILE_H), (ub, z0 / TILE_H), (ub, z1 / TILE_H), (ua, z1 / TILE_H)]
            s += d
        if top:
            self.f.append(tuple(i0 + n + i for i in range(n)))
            self.uv += [SOLID_UV] * n

    def frustum(self, r0, r1, z0, z1, n=24):
        i0 = len(self.v)
        for r, z in ((r0, z0), (r1, z1)):
            self.v += [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z) for i in range(n)]
        for i in range(n):
            j = (i + 1) % n
            self.f.append((i0 + i, i0 + j, i0 + n + j, i0 + n + i))
            self.uv += [SOLID_UV] * 4
        self.f.append(tuple(i0 + n + i for i in range(n)))
        self.uv += [SOLID_UV] * n

    def build(self, name, mat, coll, smooth=False):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", [c for uv in self.uv for c in uv])
        me.materials.append(mat)
        if smooth:
            me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        me.update()
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob


def rot(pts, a):
    c, s = math.cos(a), math.sin(a)
    return [(x * c - y * s, x * s + y * c) for x, y in pts]


def circle(r, n=48, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def wing_outline(length, w, arc=10):
    """Aile le long de +X, nez arrondi, centrée sur l'origine."""
    pts = [(0.0, -w), (length - w, -w)]
    for i in range(1, arc):
        a = -math.pi / 2 + math.pi * i / arc
        pts.append((length - w + w * math.cos(a), w * math.sin(a)))
    pts += [(length - w, w), (0.0, w)]
    return pts


def build_tower(mats, coll):
    glass, steel = MeshBuilder(), MeshBuilder()
    core_r, n_set, top_z = 17.0, 27, 585.0
    zs = [72 + (top_z - 72) * (k / (n_set - 1)) ** 0.92 for k in range(n_set)]

    for j in range(3):
        ang = math.pi / 2 + j * 2 * math.pi / 3
        z_prev = 0.0
        for i in range(9):
            z_top = zs[j + 3 * i]
            length = core_r + 50.0 * (1 - i / 9.0)
            w = 11.0 - 0.42 * i
            # nez à deux crans, comme les vraies ailes en gradins
            for dl, dw, dz in ((0.0, 0.0, 0.0), (-7.0, 1.6, 9.0)):
                if length + dl - (w + dw) < 4:
                    continue
                o = rot(wing_outline(length + dl, w + dw), ang)
                glass.prism(o, z_prev, z_top + dz, u0=random.uniform(0, TILE_W))
                cap = rot(wing_outline(length + dl + 0.7, w + dw + 0.7), ang)
                steel.prism(cap, z_top + dz - 0.4, z_top + dz + 1.3)
            # ailette verticale en acier sur le nez
            fin = rot([(length - 0.3, -0.5), (length + 1.4, -0.5), (length + 1.4, 0.5), (length - 0.3, 0.5)], ang)
            steel.prism(fin, z_prev, z_top + 6)
            z_prev = z_top

    # noyau puis flèche télescopique
    glass.prism(circle(core_r, 36), 0, top_z + 12)
    steel.prism(circle(core_r + 0.7, 36), top_z + 11.6, top_z + 13.2)
    for r, z0, z1 in ((13.0, 597, 628), (9.5, 628, 662), (6.5, 662, 700)):
        glass.prism(circle(r, 24), z0, z1)
        steel.prism(circle(r + 0.5, 24), z1 - 0.4, z1 + 1.2)
    # bandeaux techniques
    for z in (150, 290, 430, 540):
        steel.prism(circle(core_r + 1.2, 36), z, z + 5)
    steel.frustum(4.2, 2.6, 700, 760)
    steel.frustum(2.6, 1.2, 760, 805)
    steel.frustum(1.2, 0.25, 805, 828)

    return [glass.build("Tour_Facade", mats["glass"], coll),
            steel.build("Tour_Acier", mats["steel"], coll)]


def build_site(mats, coll):
    stone = MeshBuilder()
    stone.prism(circle(120, 96), -2, 3)
    stone.prism(circle(98, 96), 3, 7)
    for j in range(3):  # pavillons d'entrée entre les ailes
        a = math.pi / 2 + (j + 0.5) * 2 * math.pi / 3
        stone.prism(circle(15, 32, 72 * math.cos(a), 72 * math.sin(a)), 7, 16)
    podium = stone.build("Parvis", mats["stone"], coll)
    water = MeshBuilder()
    water.prism(circle(330, 128), -3, 0)
    lake = water.build("Lac", mats["water"], coll, smooth=False)
    return [podium, lake]


def build_city(mats, coll):
    city, gnd = MeshBuilder(), MeshBuilder()
    gnd.prism(circle(40000, 96), -6, -0.5)
    placed = []
    tries = 0
    while len(placed) < 650 and tries < 20000:
        tries += 1
        r = 380 + 2600 * random.random() ** 1.6
        a = random.uniform(0, 2 * math.pi)
        if r < 1400 and abs((a - HERO_AZ + math.pi) % (2 * math.pi) - math.pi) < 0.2:
            continue  # couloir dégagé devant la caméra principale
        x, y = r * math.cos(a), r * math.sin(a)
        sx, sy = random.uniform(22, 55), random.uniform(22, 55)
        if any(abs(x - px) < (sx + ps) * 0.7 and abs(y - py) < (sy + ps) * 0.7 for px, py, ps in placed):
            continue
        placed.append((x, y, max(sx, sy)))
        h = random.choice([1, 1, 1, 2, 2, 3]) * random.uniform(35, 105)
        yaw = random.uniform(0, math.pi)
        z = 0.0
        for step in range(random.choice([1, 2, 2, 3])):  # immeubles à retraits
            k = 1 - 0.22 * step
            o = rot([(-sx * k / 2, -sy * k / 2), (sx * k / 2, -sy * k / 2), (sx * k / 2, sy * k / 2), (-sx * k / 2, sy * k / 2)], yaw)
            o = [(px + x, py + y) for px, py in o]
            hz = h * (0.6 if step == 0 else 0.25)
            city.prism(o, z, z + hz, u0=random.uniform(0, TILE_W))
            z += hz
    return [city.build("Ville", mats["glass"], coll), gnd.build("Sol", mats["ground"], coll)]


# --------------------------------------------------------------------------- scène
def setup_world(scene):
    w = bpy.data.worlds.new("Ciel")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    sky = nt.nodes.new("ShaderNodeTexSky")
    for t in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "NISHITA"):
        try:
            sky.sky_type = t
            break
        except TypeError:
            continue
    sky.sun_elevation = math.radians(6.5)
    sky.sun_rotation = math.radians(60)
    for attr, val in (("air_density", 1.6), ("aerosol_density", 2.5), ("dust_density", 2.5), ("ozone_density", 2.0), ("sun_size", math.radians(1.6))):
        if hasattr(sky, attr):
            setattr(sky, attr, val)
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0


def setup_render(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16 if QUICK else 128
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.threads_mode = "AUTO"
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -2.4
    scene.render.image_settings.file_format = "PNG"


def shoot(scene, name, loc, target, lens, res):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam_data.clip_start, cam_data.clip_end = 1, 90000
    cam = bpy.data.objects.new(name, cam_data)
    scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scale = 0.3 if QUICK else 1.0
    scene.render.resolution_x, scene.render.resolution_y = int(res[0] * scale), int(res[1] * scale)
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    mats = make_materials()
    tower_coll = bpy.data.collections.new("Tour")
    city_coll = bpy.data.collections.new("Decor")
    scene.collection.children.link(tower_coll)
    scene.collection.children.link(city_coll)
    tower_objs = build_tower(mats, tower_coll) + build_site(mats, tower_coll)
    build_city(mats, city_coll)
    setup_world(scene)
    setup_render(scene)

    shoot(scene, "rendu_hero", (-420, -1010, 14), (0, 0, 405), 42, (1080, 1920))
    shoot(scene, "rendu_aerien", (-640, -430, 470), (0, 0, 330), 28, (1920, 1080))
    shoot(scene, "rendu_detail", (150, -210, 300), (0, 0, 330), 40, (1080, 1350))

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "tour.blend"))
    for o in bpy.data.objects:
        o.select_set(o in tower_objs)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "tour.glb"), export_format="GLB",
                              use_selection=True, export_apply=True, export_yup=True)
    print("OK ->", OUT)


main()
