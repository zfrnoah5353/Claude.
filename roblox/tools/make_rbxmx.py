"""Transforme les plans JSON (export_models.luau) en fichiers .rbxmx via Rojo.

Usage : python3 make_rbxmx.py plans.json dossier_de_sortie
"""
import json, os, subprocess, sys, tempfile

ROJO = os.environ.get("ROJO", "rojo")
MATERIAL = {"plastic": "SmoothPlastic", "neon": "Neon", "metal": "SmoothPlastic", "glass": "Glass"}


def rgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def part(p, s, idx):
    shape = p["shape"]
    props = {
        "Anchored": True,
        "CanCollide": False,
        "CastShadow": False,
        "Size": [v * s for v in p["size"]],
        "CFrame": {"CFrame": {
            "position": [v * s for v in p["pos"]],
            "orientation": [p["rot"][0:3], p["rot"][3:6], p["rot"][6:9]],
        }},
        "Color": rgb(p["color"]),
        "Material": MATERIAL.get(p["mat"], "SmoothPlastic"),
        "TopSurface": "Smooth",
        "BottomSurface": "Smooth",
    }
    if p["alpha"] > 0:
        props["Transparency"] = p["alpha"]
    if p["mat"] == "metal":
        props["Reflectance"] = 0.2
    if shape == "ball":
        props["Shape"] = "Ball"
    elif shape == "cyl":
        props["Shape"] = "Cylinder"
    node = {"name": p["name"] if p["name"] == "Body" else f"Part{idx}", "className": "Part", "properties": props, "children": []}
    if shape == "ellipsoid":
        node["children"].append({"name": "Mesh", "className": "SpecialMesh", "properties": {"MeshType": "Sphere"}})
    return node


def model_json(m):
    s = m["scale"]
    children = [part(p, s, i) for i, p in enumerate(m["parts"])]
    glow = rgb(m["glow"])
    divine = m["rarity"] >= 7
    body = next((c for c in children if c["name"] == "Body"), children[0])
    body["children"] += [
        {"name": "Aura", "className": "PointLight", "properties": {
            "Color": glow, "Brightness": 3 if divine else 1.5, "Range": 8 * s}},
        {"name": "Sparkles", "className": "ParticleEmitter", "properties": {
            "Texture": "rbxasset://textures/particles/sparkles_main.dds",
            "Rate": 14 if divine else 5, "LightEmission": 1,
            "Lifetime": {"NumberRange": [0.8, 1.6]}, "Speed": {"NumberRange": [0.5, 1.5]},
            "SpreadAngle": [180, 180],
            "Color": {"ColorSequence": {"keypoints": [{"time": 0, "color": glow}, {"time": 1, "color": [1, 1, 1]}]}},
            "Size": {"NumberSequence": {"keypoints": [{"time": 0, "value": 0.35 * s, "envelope": 0}, {"time": 1, "value": 0, "envelope": 0}]}},
        }},
    ]
    return {"className": "Model", "children": children}


def main(src, outdir):
    models = json.load(open(src))
    os.makedirs(outdir, exist_ok=True)
    for m in models:
        with tempfile.TemporaryDirectory() as d:
            fname = os.path.join(d, "Pet.model.json")
            json.dump(model_json(m), open(fname, "w"))
            json.dump({"name": m["label"], "tree": {"$path": "Pet.model.json"}}, open(os.path.join(d, "default.project.json"), "w"))
            sub = os.path.join(outdir, m["rarityName"])
            os.makedirs(sub, exist_ok=True)
            out = os.path.join(sub, m["name"] + ".rbxmx")
            r = subprocess.run([ROJO, "build", os.path.join(d, "default.project.json"), "-o", out], capture_output=True, text=True)
            if r.returncode != 0:
                print("ERREUR", m["name"], r.stderr[-600:])
            else:
                print("ok", out, len(m["parts"]), "pièces")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
