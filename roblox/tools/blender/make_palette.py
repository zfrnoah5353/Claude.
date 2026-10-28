# Palette commune des pets : une case de 16 px par couleur (plastique et or).
# python3 make_palette.py dossier_prims/ sortie/  -> sortie/palette.png + sortie/palette.json
import json, glob, os, sys, zlib, struct

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
cols = set()
for f in sorted(glob.glob(os.path.join(src, "*.json"))):
    for p in json.load(open(f))["prims"]:
        if p["mat"] in ("plastic", "gold"):
            cols.add(p["color"].upper())
cols = sorted(cols)
N, CELL = 16, 16
assert len(cols) <= N * N, f"{len(cols)} couleurs : palette trop petite"
W = N * CELL
pix = bytearray(W * W * 3)
for i, c in enumerate(cols):
    rgb = bytes(int(c[k:k + 2], 16) for k in (0, 2, 4))
    cx, cy = i % N, i // N
    for y in range(cy * CELL, (cy + 1) * CELL):
        for x in range(cx * CELL, (cx + 1) * CELL):
            o = (y * W + x) * 3
            pix[o:o + 3] = rgb
raw = b"".join(b"\x00" + bytes(pix[y * W * 3:(y + 1) * W * 3]) for y in range(W))
def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, W, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
open(os.path.join(out, "palette.png"), "wb").write(png)
json.dump({"cells": N, "image": "palette.png", "colors": {c: i for i, c in enumerate(cols)}}, open(os.path.join(out, "palette.json"), "w"))
print(len(cols), "couleurs")
