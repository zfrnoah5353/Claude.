#!/usr/bin/env python3
"""Compacte BuildCores OpenDB (CC BY-NC-SA 4.0) en fichiers JSON embarqués dans l'app.

Usage : python3 tools/builddata.py <chemin/vers/buildcores-open-db> web/data

Les prix (champ "p") et scores (champ "s") sont des ESTIMATIONS indicatives
calculées ici ; la base OpenDB ne contient aucun prix.
"""
import glob, gzip, json, os, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- références
# chipset GPU -> (score relatif, RTX 4060 = 100 ; prix estimé en euros)
GPU_REF = {
    "GeForce RTX 3050 6 GB": (48, 180), "GeForce RTX 3050 8 GB": (62, 210),
    "GeForce RTX 3060 12 GB": (78, 280),
    "GeForce RTX 4060": (100, 300), "GeForce RTX 4060 Ti 8 GB": (122, 400),
    "GeForce RTX 4060 Ti": (122, 400), "GeForce RTX 4060 Ti 16 GB": (124, 460),
    "GeForce RTX 4070": (158, 560), "GeForce RTX 4070 SUPER": (183, 630),
    "GeForce RTX 4070 Ti": (195, 760), "GeForce RTX 4070 Ti SUPER": (215, 860),
    "GeForce RTX 4080": (255, 1100), "GeForce RTX 4080 SUPER": (258, 1100),
    "GeForce RTX 4090": (330, 2200),
    "GeForce RTX 5050": (95, 270), "GeForce RTX 5060": (120, 320),
    "GeForce RTX 5060 Ti": (140, 400), "GeForce RTX 5060 Ti 8 GB": (140, 400),
    "GeForce RTX 5060 Ti 16 GB": (143, 470),
    "GeForce RTX 5070": (190, 600), "GeForce RTX 5070 Ti": (245, 850),
    "GeForce RTX 5080": (285, 1150), "GeForce RTX 5090": (400, 2500),
    "Radeon RX 6600": (82, 210), "Radeon RX 7600": (96, 270), "Radeon RX 7600 XT": (104, 330),
    "Radeon RX 7700 XT": (150, 420), "Radeon RX 7800 XT": (178, 500),
    "Radeon RX 7900 GRE": (190, 570), "Radeon RX 7900 XT": (220, 700),
    "Radeon RX 7900 XTX": (255, 900),
    "Radeon RX 9060 XT 8 GB": (138, 330), "Radeon RX 9060 XT 16 GB": (142, 400),
    "Radeon RX 9060 XT": (140, 360), "Radeon RX 9070": (215, 600), "Radeon RX 9070 XT": (240, 690),
    "Arc A750": (85, 200), "Arc A770": (92, 280), "Arc B570": (95, 240), "Arc B580": (108, 280),
}
# modèle CPU -> (score jeu, Ryzen 5 7600 = 100 ; prix estimé en euros)
CPU_REF = {
    "Ryzen 5 5500": (70, 85), "Ryzen 5 5600": (78, 110), "Ryzen 5 5600G": (68, 120),
    "Ryzen 5 5600GT": (69, 125), "Ryzen 7 5700X": (82, 150), "Ryzen 7 5700X3D": (100, 230),
    "Ryzen 7 5700G": (72, 160), "Ryzen 7 5800XT": (84, 190), "Ryzen 9 5900XT": (85, 290),
    "Ryzen 5 7500F": (98, 150), "Ryzen 5 7600": (100, 190), "Ryzen 5 7600X": (103, 200),
    "Ryzen 5 7600X3D": (125, 290), "Ryzen 7 7700": (106, 270), "Ryzen 7 7700X": (108, 280),
    "Ryzen 7 7800X3D": (135, 400), "Ryzen 9 7900": (107, 340), "Ryzen 9 7900X": (108, 350),
    "Ryzen 9 7950X": (110, 480), "Ryzen 9 7950X3D": (135, 600),
    "Ryzen 5 8400F": (80, 130), "Ryzen 5 8500G": (75, 150), "Ryzen 5 8600G": (85, 200),
    "Ryzen 7 8700F": (88, 230), "Ryzen 7 8700G": (90, 280),
    "Ryzen 5 9600": (106, 200), "Ryzen 5 9600X": (108, 220), "Ryzen 7 9700X": (112, 300),
    "Ryzen 7 9800X3D": (150, 480), "Ryzen 9 9900X": (112, 380), "Ryzen 9 9900X3D": (140, 600),
    "Ryzen 9 9950X": (115, 550), "Ryzen 9 9950X3D": (150, 720),
    "Core i3 12100F": (65, 80), "Core i3 12100": (65, 110), "Core i3 13100F": (68, 95),
    "Core i3 14100F": (70, 100), "Core i3 14100": (70, 130),
    "Core i5 12400F": (80, 110), "Core i5 12400": (80, 140), "Core i5 13400F": (88, 160),
    "Core i5 14400F": (90, 140), "Core i5 14400": (90, 180), "Core i5 12600KF": (92, 150),
    "Core i5 12600K": (92, 170), "Core i5 13600KF": (110, 230), "Core i5 13600K": (110, 250),
    "Core i5 14600KF": (113, 210), "Core i5 14600K": (113, 230),
    "Core i7 12700F": (98, 230), "Core i7 12700KF": (100, 220), "Core i7 12700K": (100, 240),
    "Core i7 13700F": (114, 320), "Core i7 13700KF": (118, 330), "Core i7 13700K": (118, 350),
    "Core i7 14700F": (118, 330), "Core i7 14700KF": (122, 340), "Core i7 14700K": (122, 360),
    "Core i9 14900F": (124, 450), "Core i9 14900KF": (128, 460), "Core i9 14900K": (128, 480),
    "Core Ultra 5 225F": (95, 180), "Core Ultra 5 225": (95, 200), "Core Ultra 5 245KF": (108, 260),
    "Core Ultra 5 245K": (108, 280), "Core Ultra 7 265F": (112, 320), "Core Ultra 7 265KF": (115, 330),
    "Core Ultra 7 265K": (115, 350), "Core Ultra 9 285K": (120, 580),
}
MB_REF = {
    "AMD A520": 70, "AMD B450": 75, "AMD B550": 110, "AMD X570": 190, "AMD A620": 90,
    "AMD B650": 150, "AMD B650E": 190, "AMD X670": 230, "AMD X670E": 300, "AMD B840": 130,
    "AMD B850": 180, "AMD X870": 250, "AMD X870E": 340,
    "Intel H610": 80, "Intel B660": 110, "Intel B760": 140, "Intel H770": 160,
    "Intel Z690": 200, "Intel Z790": 240, "Intel H810": 100, "Intel B860": 170, "Intel Z890": 280,
}
PREMIUM_BRANDS = ("lian li", "fractal", "nzxt", "hyte", "corsair", "phanteks", "be quiet", "asus", "cooler master")


def r5(x):
    return int(round(x / 5.0) * 5)


def price_cpu(name):
    n = re.sub(r"[™®]", "", name).replace("-", " ")
    n = re.sub(r"\s+OEM/Tray", "", n)
    n = re.sub(r"^(AMD|Intel)\s+", "", n).strip()
    return CPU_REF.get(n)


def price_mobo(d, name):
    base = MB_REF.get(d.get("chipset") or "")
    if not base:
        return None
    ff = d.get("form_factor") or ""
    k = {"Micro ATX": 0.9, "Mini-ITX": 1.3, "EATX": 1.5}.get(ff, 1.0)
    u = name.upper()
    if re.search(r"GODLIKE|EXTREME|APEX|FORMULA|XTREME|AQUA|GLACIAL", u):
        k *= 2.6
    elif re.search(r"HERO|\bACE\b|MASTER|TAICHI|UNIFY|NOVA", u):
        k *= 1.9
    elif re.search(r"STRIX|CARBON|ELITE|TOMAHAWK|STEEL LEGEND|AORUS PRO|RIPTIDE", u):
        k *= 1.3
    if "WIFI" in u or "WI-FI" in u or re.search(r"\bAX\b", u):
        k *= 1.08
    return r5(base * k)


def price_ram(d):
    t, cap, sp = d.get("ram_type"), d.get("capacity") or 0, d.get("speed") or 0
    if not cap or t not in ("DDR4", "DDR5"):
        return None
    per = 8.0 if t == "DDR5" else 5.0
    if t == "DDR5" and sp >= 6400:
        per *= 1.0 + min(0.5, (sp - 6000) / 4000)
    if t == "DDR4" and sp >= 3600:
        per *= 1.1
    if d.get("rgb"):
        per *= 1.1
    return max(20, r5(cap * per))


def price_storage(d):
    cap, typ, itf = d.get("capacity") or 0, d.get("storage_type"), d.get("interface") or ""
    if not cap:
        return None
    if typ == "HDD":
        return max(50, r5(cap * 0.024))
    if typ != "SSD":
        return None
    per = 0.09
    if "PCIe 4.0" in itf:
        per = 0.10
    elif "PCIe 5.0" in itf:
        per = 0.16
    elif "PCIe 3.0" in itf:
        per = 0.085
    return max(30, r5(cap * per))


def price_psu(d):
    w = d.get("wattage") or 0
    if not w:
        return None
    k = {"80+ Gold": 0.14, "80+ Platinum": 0.2, "80+ Titanium": 0.28, "80+ Silver": 0.12,
         "80+ Bronze": 0.105}.get(d.get("efficiency_rating"), 0.09)
    p = w * k + (10 if d.get("modular") == "Full" else 0)
    if (d.get("form_factor") or "").startswith("SFX"):
        p *= 1.25
    return max(35, r5(p))


def price_case(d, manu):
    ff = d.get("form_factor") or ""
    base = 85
    if "Full Tower" in ff:
        base = 150
    elif "Mini ITX" in ff:
        base = 100
    elif "Micro ATX" in ff or "Mini Tower" in ff:
        base = 65
    if d.get("has_transparent_side_panel"):
        base += 10
    if any(b in (manu or "").lower() for b in PREMIUM_BRANDS):
        base *= 1.3
    return r5(base)


def price_cooler(d, manu):
    if d.get("water_cooled"):
        rad = d.get("radiator_size") or 240
        p = {120: 60, 140: 65, 240: 85, 280: 100, 360: 115, 420: 145}.get(rad, 100)
    else:
        p = 28 + 17 * max(0, (d.get("fan_quantity") or 1) - 1)
        if (d.get("height") or 150) < 80:
            p += 10
    m = (manu or "").lower()
    if "noctua" in m:
        p *= 2.1
    elif any(b in m for b in ("corsair", "nzxt", "asus", "be quiet", "lian li")):
        p *= 1.4
    return r5(p)


def price_fan(d, manu):
    q = d.get("quantity") or 1
    p = (12 if (d.get("size") or 120) >= 140 else 9) * q
    if d.get("led") and d.get("led") != "None":
        p *= 1.4
    m = (manu or "").lower()
    if "noctua" in m:
        p *= 2.3
    elif any(b in m for b in ("corsair", "lian li", "be quiet", "nzxt")):
        p *= 1.6
    return max(5, r5(p))


def price_monitor(d):
    res = d.get("resolution") or {}
    w, h, hz = res.get("horizontalRes") or 0, res.get("verticalRes") or 0, d.get("refresh_rate") or 60
    size = d.get("screen_size") or 0
    if not w or not size:
        return None
    px = w * h
    if px <= 2.1e6:
        p = 90 if hz < 100 else 130 if hz < 200 else 200 if hz < 300 else 330
        ref = 24
    elif px <= 3.8e6:
        p = 170 if hz < 100 else 220 if hz < 200 else 350 if hz < 300 else 560
        ref = 27
    elif px <= 5.2e6:
        p = 300 if hz < 100 else 380 if hz < 200 else 650
        ref = 34
    else:
        p = 260 if hz < 100 else 460 if hz < 200 else 820
        ref = 28
    p *= max(0.8, min(2.2, (size / ref) ** 1.2))
    if "OLED" in (d.get("panel_type") or "").upper():
        p = max(480, p * 1.9)
    return r5(p)


def price_os(name):
    n = name.lower()
    if "windows 11" in n or "windows 10" in n:
        return 200 if " pro" in n else 145
    return None


# ---------------------------------------------------------------- extraction
def common(d):
    md = d.get("metadata") or {}
    o = {"id": d["opendb_id"][:13], "n": " ".join((md.get("name") or "?").split()), "m": md.get("manufacturer") or ""}
    if md.get("releaseYear"):
        o["y"] = md["releaseYear"]
    col = [c for c in (d.get("color") or []) if c]
    if col:
        o["col"] = col[:2]
    ls = ((d.get("identifiers") or {}).get("retailer_listings")) or []
    az = [l for l in ls if l.get("source") == "amazon"]
    if az:
        fr = [l for l in az if l.get("channel") == "fr"]
        o["az"] = (fr or az)[0]["source_product_id"]
        if fr:
            o["fr"] = 1
    return o


def put(o, **kw):
    for k, v in kw.items():
        if v not in (None, "", [], 0, False):
            o[k] = v
    return o


def x_cpu(d, o):
    c, s = d.get("cores") or {}, d.get("specifications") or {}
    ig = (s.get("integratedGraphics") or {}).get("model")
    put(o, socket=d.get("socket"), cores=c.get("total"), threads=c.get("threads"),
        boost=((d.get("clocks") or {}).get("performance") or {}).get("boost"), tdp=s.get("tdp"),
        igpu=ig if ig and ig != "None" else None, stock=s.get("includesCooler"),
        mem=(s.get("memory") or {}).get("types"))
    ref = price_cpu(o["n"])
    if ref:
        o["s"], o["p"] = ref


def x_mobo(d, o):
    mem, st = d.get("memory") or {}, d.get("storage_devices") or {}
    put(o, socket=d.get("socket"), ff=d.get("form_factor"), chipset=d.get("chipset"),
        ramType=mem.get("ram_type"), ramSlots=mem.get("slots"), ramMax=mem.get("max"),
        m2=len(d.get("m2_slots") or []), sata=(st.get("sata_6_gb_s") or 0) + (st.get("sata_3_gb_s") or 0),
        p=price_mobo(d, o["n"]))


def x_ram(d, o):
    mod = d.get("modules") or {}
    put(o, type=d.get("ram_type"), speed=d.get("speed"), qty=mod.get("quantity"), per=mod.get("capacity_gb"),
        cap=d.get("capacity"), cl=d.get("cas_latency"), sodimm="SO-DIMM" in (d.get("form_factor") or ""),
        rgb=d.get("rgb"), p=price_ram(d))


def x_gpu(d, o):
    pc = d.get("power_connectors") or {}
    put(o, chipset=d.get("chipset"), vram=d.get("memory"), tdp=d.get("tdp"), len=d.get("length"),
        slots=d.get("total_slot_width"), c6=pc.get("pcie_6_pin"), c8=pc.get("pcie_8_pin"),
        c12=(pc.get("pcie_12VHPWR") or 0) + (pc.get("pcie_12V_2x6") or 0),
        rgb=bool([l for l in (d.get("lighting") or []) if l and l != "None"]))
    ref = GPU_REF.get(d.get("chipset") or "")
    if ref:
        o["s"], o["p"] = ref


def x_storage(d, o):
    put(o, cap=d.get("capacity"), type=d.get("storage_type"), ff=d.get("form_factor"),
        itf=d.get("interface"), nvme=d.get("nvme"), p=price_storage(d))


def x_psu(d, o):
    c = d.get("connectors") or {}
    put(o, w=d.get("wattage"), ff=d.get("form_factor"), eff=d.get("efficiency_rating"), mod=d.get("modular"),
        len=d.get("length"), c8=c.get("pcie_6_plus_2_pin"), c12=c.get("pcie_12vhpwr"), p=price_psu(d))


def x_case(d, o):
    dims = [float(v) for v in re.findall(r"\d+(?:\.\d+)?", d.get("dimensions") or "")][:3]
    put(o, ff=d.get("form_factor"), mobos=d.get("supported_motherboard_form_factors"),
        maxGpu=d.get("max_video_card_length"), maxCooler=d.get("max_cpu_cooler_height"),
        dims=[round(v) for v in dims] if len(dims) == 3 else None,
        psus=d.get("supported_power_supply_form_factors"), glass=d.get("has_transparent_side_panel"),
        p=price_case(d, o["m"]))


def x_cooler(d, o):
    put(o, h=d.get("height"), sockets=d.get("cpu_sockets"), water=d.get("water_cooled"),
        rad=d.get("radiator_size"), fan=d.get("fan_size"), fans=d.get("fan_quantity"),
        rgb=bool([l for l in (d.get("lighting") or []) if l and l != "None"]),
        p=price_cooler(d, o["m"]))


def x_fan(d, o):
    led = d.get("led")
    put(o, size=d.get("size"), qty=d.get("quantity"), cfm=d.get("max_airflow") or d.get("min_airflow"),
        rgb=bool(led and led != "None"), p=price_fan(d, o["m"]))


def x_monitor(d, o):
    r = d.get("resolution") or {}
    put(o, size=d.get("screen_size"), rw=r.get("horizontalRes"), rh=r.get("verticalRes"),
        hz=d.get("refresh_rate"), panel=d.get("panel_type"), p=price_monitor(d))


def x_os(d, o):
    put(o, p=price_os(o["n"]))


def x_none(d, o):
    pass


CATS = {
    "cpu": ("CPU", x_cpu), "mobo": ("Motherboard", x_mobo), "ram": ("RAM", x_ram), "gpu": ("GPU", x_gpu),
    "storage": ("Storage", x_storage), "psu": ("PSU", x_psu), "case": ("PCCase", x_case),
    "cooler": ("CPUCooler", x_cooler), "fan": ("CaseFan", x_fan), "monitor": ("Monitor", x_monitor),
    "os": ("OS", x_os), "keyboard": ("Keyboard", x_none), "mouse": ("Mouse", x_none),
    "headset": ("Headphones", x_none),
}

total = 0
for key, (folder, fn) in CATS.items():
    items, seen = [], set()
    for f in sorted(glob.glob(os.path.join(SRC, "open-db", folder, "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        o = common(d)
        if o["id"] in seen:
            o["id"] = d["opendb_id"]
        seen.add(o["id"])
        fn(d, o)
        items.append(o)
    items.sort(key=lambda o: o["n"].lower())
    raw = json.dumps(items, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(OUT, key + ".json.gz"), "wb") as fh:
        fh.write(gzip.compress(raw, 9, mtime=0))
    total += len(items)
    priced = sum(1 for o in items if "p" in o)
    print(f"{key:9s} {len(items):5d} pièces, {priced:5d} avec prix estimé, {len(raw)//1024} Ko")
print("total", total)
