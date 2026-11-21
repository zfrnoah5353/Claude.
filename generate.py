#!/usr/bin/env python3
"""Generateur de videos promo TikTok ColorTweaks (sans IA, deterministe a partir d'une graine).

usage : python3 generate.py [--format NOM] [--seed N]
Produit posts/<id>.mp4 + posts/<id>.json (description, format, controles) et
work/<id>/planche.jpg (images cles pour la verification visuelle).
Derniere ligne de sortie : JSON {"ok": true, "id": ..., "video": ..., "meta": ...}
"""
import argparse
import glob
import html
import json
import os
import random
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import numpy as np
from scipy.io import wavfile

import music

ROOT = os.path.dirname(os.path.abspath(__file__))
POSTS = os.path.join(ROOT, "posts")
WORK = os.path.join(ROOT, "work")
HISTORY = os.path.join(ROOT, "history.json")
ERRORS = os.path.join(ROOT, "errors.log")
TZ = ZoneInfo("Europe/Paris")
FORMATS_V1 = ["quiz", "tuto", "avantapres", "raccourcis", "auto", "fonctions", "jeux", "pov", "vraifaux"]
FORMATS_V2 = ["v2choc", "v2pov", "v2question", "v2astuce"]
FORMATS = FORMATS_V2 + FORMATS_V1
PRESETS = ["Naturel", "Vibrant", "Néon", "Cinématique", "FPS"]
HL = lambda s: f'<span class="hl">{s}</span>'

GAMES = [
    ("VALORANT", "FPS tactique 5v5 · Compétitif, Vibrant, Néon"),
    ("Counter-Strike 2", "FPS compétitif · Compétitif, Vibrant, Cinéma"),
    ("Fortnite", "Battle royale · Compétitif, Vibrant, Cinéma"),
    ("Apex Legends", "Battle royale · Compétitif, Vibrant, Cinéma"),
    ("Overwatch 2", "FPS de héros · Compétitif, Vibrant, Cinéma"),
    ("Warzone", "Battle royale · Compétitif, Vibrant, Cinéma"),
]
WHY = {
    "Naturel": "Fidèle à l’original, juste plus vivant",
    "Vibrant": "Saturation doublée, contraste léger",
    "Néon": "Saturation à fond, style flashy",
    "Cinématique": "Plus de contraste, ambiance film",
    "FPS": "Plus saturé et plus contrasté",
}
QUIZ_ANSWERS = [
    ("Des couleurs fidèles, juste plus vives", "Naturel"),
    ("Des couleurs qui claquent", "Vibrant"),
    ("Un style flashy, à fond", "Néon"),
    ("Une ambiance de film", "Cinématique"),
    ("Un rendu net et contrasté", "FPS"),
]
SAFETY = ["Aucun fichier de jeu modifié", "N’interagit pas avec Vanguard", "Tout est réversible", "Gratuit, sans compte"]
FEATURES = [
    ("palette", "5 préréglages", "Naturel, Vibrant, Néon, Cinématique, FPS"),
    ("sliders", "5 curseurs", "Saturation, contraste, luminosité, température, teinte"),
    ("game", "Un look par jeu", "VALORANT, CS2, Fortnite, Apex, Overwatch 2, Warzone"),
    ("auto", "Auto en jeu", "Le look s’applique quand le jeu passe au premier plan"),
    ("keys", "Raccourcis globaux", "Ctrl+Alt+C active, Ctrl+Alt+N change de look"),
    ("tune", "4 optimisations Windows", "Réversibles : la valeur d’origine est sauvegardée"),
    ("tray", "Icône près de l’horloge", "Garde l’appli active en arrière-plan"),
]
HALOS = [
    ["#3be38f", "#22d3ee", "#7c5cff", "#ff4d8d"],
    ["#22d3ee", "#3be38f", "#ff8a3d", "#7c5cff"],
    ["#ff4d8d", "#3be38f", "#22d3ee", "#ffd23f"],
    ["#7c5cff", "#22d3ee", "#3be38f", "#ff4d8d"],
    ["#3be38f", "#ffd23f", "#22d3ee", "#ff4d8d"],
]
TAGS_BASE = ["#colortweaks", "#valorant"]
TAGS_POOL = ["#valorantfr", "#gaming", "#pcgaming", "#gamingfr", "#windows11", "#valorantclips", "#pcgamer",
             "#setupgaming", "#gamer", "#valoranttips", "#astucepc", "#fps", "#tiktokgaming", "#jeuxvideo"]
TAGS_GAMES = ["#cs2", "#fortnite", "#apexlegends", "#overwatch2", "#warzone"]

HOOKS = {
    "quiz": [
        (["Quel look est", f"fait {HL('pour toi')} ?"], "QUIZ", "Choisis ta réponse"),
        (["Ton style de jeu", f"= {HL('ton look')}"], "QUIZ", "Réponds dans ta tête"),
        ([f"{HL('A, B, C ou D')} ?", "Trouve ton look"], "QUIZ", None),
    ],
    "tuto": [
        (["Installe ColorTweaks", f"en {HL('1 minute')}"], "TUTO", "Gratuit · Windows 11"),
        (["Des couleurs plus vives", f"en {HL('4 étapes')}"], "TUTO", None),
        (["Comment installer", f"{HL('ColorTweaks')} ?"], "TUTO", "Suis le guide"),
    ],
    "avantapres": [
        (["Même partie,", HL("autres couleurs")], "AVANT / APRÈS", None),
        (["Avant / après", f"sur {HL('VALORANT')}"], None, "Regarde bien les couleurs"),
        (["Tes couleurs", f"sont {HL('trop fades')} ?"], None, "Regarde la différence"),
    ],
    "raccourcis": [
        (["Un raccourci", f"et {HL('tout change')}"], "RACCOURCIS", None),
        ([HL("Ctrl+Alt+C"), "en pleine partie"], None, "Active ton look sans quitter le jeu"),
        (["Change de look", HL("sans quitter ton jeu")], "RACCOURCIS", None),
    ],
    "auto": [
        (["Ton look s’active", HL("tout seul")], "AUTO EN JEU", None),
        (["Lance ton jeu,", HL("c’est réglé")], None, "Le mode auto en jeu s’occupe du reste"),
        (["Mode", HL("auto en jeu")], None, "Le bon look au bon moment"),
    ],
    "fonctions": [
        (["Tout ce que fait", HL("ColorTweaks")], "GRATUIT", None),
        (["Booste les couleurs", f"de {HL('tes jeux')}"], None, "Voilà ce que fait l’appli"),
        (["Une appli gratuite", f"pour {HL('tes couleurs')}"], "WINDOWS 11", None),
    ],
    "jeux": [
        (["Un look", f"pour {HL('chaque jeu')}"], "6 JEUX", None),
        (["VALORANT, CS2,", f"Fortnite… {HL('et plus')}"], None, "Des looks prêts à l’emploi"),
        (["Ton jeu a", HL("son look")], "6 JEUX", None),
    ],
}
HOOKS["pov"] = [
    (["POV :", f"ta ranked commence et {HL('tout est fade')}"], None, None),
    (["POV :", f"tu découvres {HL('Ctrl+Alt+C')}"], None, None),
    (["POV :", f"ton pote te demande {HL('ton réglage')}"], None, None),
]
HOOKS["vraifaux"] = [
    (["Vrai ou faux ?", HL("ColorTweaks")], "VRAI OU FAUX", "Réponds avant la fin"),
    (["Ce qu’on me demande", f"{HL('tout le temps')}"], "FAQ", None),
    (["On démêle", f"le {HL('vrai du faux')}"], "VRAI OU FAUX", None),
]
TRUTHS = [
    ("ColorTweaks modifie les fichiers du jeu", "FAUX", "Il ajuste les couleurs de l’écran, pas le jeu"),
    ("C’est payant", "FAUX", "Gratuit, sans abonnement ni compte"),
    ("Tout est réversible", "VRAI", "Quitte l’appli : tes couleurs d’origine reviennent"),
    ("Il faut créer un compte", "FAUX", "Aucun compte, aucune donnée collectée"),
    ("Il y a des looks prêts pour 6 jeux", "VRAI", "VALORANT, CS2, Fortnite, Apex, Overwatch 2, Warzone"),
    ("Il interagit avec Vanguard", "FAUX", "Rien n’est injecté dans le jeu"),
    ("On peut changer de look en jeu", "VRAI", "Ctrl+Alt+N passe au préréglage suivant"),
]
BROLL_LINES = [
    (["Tes couleurs", HL("sont ternes ?")], None),
    (["Même jeu,", HL("autre ambiance")], None),
    (["Un raccourci,", HL("et c’est réglé")], "Ctrl+Alt+C"),
    (["Ton setup", f"mérite {HL('mieux')}"], None),
    (["Gratuit,", HL("pour Windows 11")], None),
]

CAPTIONS = {
    "quiz": ["Quel look ColorTweaks est fait pour toi ? Dis ta lettre en commentaire 👇",
             "A, B, C ou D ? Ton style de jeu choisit ton look 🎨",
             "Petit quiz : trouve le look ColorTweaks qui te correspond 👀"],
    "tuto": ["Installer ColorTweaks prend une minute, voilà comment 👇",
             "4 étapes pour des couleurs plus vives dans tes jeux 🎮",
             "Le tuto pour installer ColorTweaks, gratuit sur Windows 11 ✅"],
    "avantapres": ["Même partie, autres couleurs : avant / après avec ColorTweaks 🎨",
                   "Tes couleurs sont fades ? Regarde la différence 👀",
                   "Avant / après sur VALORANT avec un look ColorTweaks 🔥"],
    "raccourcis": ["Ctrl+Alt+C pour activer, Ctrl+Alt+N pour changer de look ⌨️",
                   "Change de look en pleine partie, sans quitter ton jeu ⌨️",
                   "Deux raccourcis et tes couleurs changent 🎨"],
    "auto": ["Lance ton jeu, ton look s’applique tout seul 🎮",
             "Le mode auto en jeu détecte ton jeu au premier plan ⚡",
             "Tes couleurs reviennent quand tu quittes le jeu, automatiquement ✅"],
    "fonctions": ["Tout ce que fait ColorTweaks, gratuitement 🎨",
                  "Préréglages, curseurs, raccourcis, mode auto : tout est dans l’appli ✅",
                  "Une appli gratuite pour booster les couleurs de tes jeux 🎮"],
    "pov": ["POV : tes couleurs passent de fades à vivantes en un raccourci 🎮",
            "POV : tu découvres Ctrl+Alt+C en pleine partie ⌨️",
            "POV : ton pote veut savoir comment t’as ces couleurs 👀"],
    "vraifaux": ["Vrai ou faux ? Tout ce qu’il faut savoir sur ColorTweaks ✅",
                 "On répond aux questions qu’on nous pose le plus 👇",
                 "Gratuit ? Sûr ? Réversible ? Vrai ou faux 🎯"],
    "jeux": ["Un look prêt pour VALORANT, CS2, Fortnite, Apex, Overwatch 2 et Warzone 🎮",
             "Ton jeu a son look ColorTweaks 🎨",
             "6 jeux, des looks prêts à l’emploi 🔥"],
}


def log(*a):
    print(*a, flush=True)


def load_history():
    if os.path.exists(HISTORY):
        with open(HISTORY, encoding="utf-8") as f:
            return json.load(f)
    return {"posts": []}


def write_error(stage, msg):
    with open(ERRORS, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.now(TZ).isoformat(timespec='seconds')}] {stage} : {msg}\n")


# ---------------------------------------------------------------- gameplay
def gameplay_sources(rng, workdir, need_seconds=12):
    """Melange de sources de jeu : clips libres (assets/clips, credits dans SOURCES.json) et captures
    VALORANT du site (assets/samples). Retourne 2 sources : la principale d'abord."""
    meta = {}
    mp = os.path.join(ROOT, "assets", "clips", "SOURCES.json")
    if os.path.exists(mp):
        with open(mp, encoding="utf-8") as f:
            meta = json.load(f)
    clips = sorted(glob.glob(os.path.join(ROOT, "assets", "clips", "*.mp4")))
    stills = sorted(glob.glob(os.path.join(ROOT, "assets", "samples", "*.jpg")))
    pool = [("clip", c) for c in clips] + [("still", s) for s in stills]
    if not pool:
        return []
    # source principale : un clip anime 3 fois sur 4 quand il y en a
    if clips and rng.random() < 0.75:
        first = ("clip", rng.choice(clips))
    else:
        first = ("still", rng.choice(stills)) if stills else ("clip", rng.choice(clips))
    rest = [x for x in pool if x != first]
    chosen = [first] + ([rng.choice(rest)] if rest else [])
    srcs = []
    for k, (kind, path) in enumerate(chosen):
        name = os.path.basename(path)
        info = meta.get(name, {})
        game = info.get("game", "VALORANT" if kind == "still" else "jeu")
        credit = info.get("credit")
        if kind == "clip":
            dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                                 "-of", "csv=p=0", path]).decode().strip() or 0)
            seg = min(need_seconds, max(1.0, dur - 0.2))
            start = rng.uniform(0, max(0.0, dur - seg - 0.1))
            d = os.path.join(workdir, f"clip{k}")
            os.makedirs(d, exist_ok=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{seg:.2f}", "-i", path,
                            "-vf", "fps=30,scale=1280:-2:flags=lanczos", "-q:v", "3", os.path.join(d, "f_%05d.jpg")],
                           check=True)
            n = len(glob.glob(os.path.join(d, "f_*.jpg")))
            if n:
                srcs.append({"kind": "clip", "dir": "file://" + d, "fps": 30, "count": n, "start": 0,
                             "name": name, "game": game, "credit": credit})
        else:
            srcs.append({"kind": "still", "src": "file://" + path, "name": name, "game": game, "credit": None})
    return srcs


def broll_sources(rng, workdir, n=4):
    """Plans libres de droits (assets/broll, licence Mixkit Free) decoupes en images 720x1280."""
    clips = sorted(glob.glob(os.path.join(ROOT, "assets", "broll", "*.mp4")))
    out = []
    for k, c in enumerate(rng.sample(clips, min(n, len(clips)))):
        d = os.path.join(workdir, f"broll{k}")
        os.makedirs(d, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", c, "-vf", "fps=30,scale=720:1280", "-q:v", "4",
                        os.path.join(d, "f_%05d.jpg")], check=True)
        cnt = len(glob.glob(os.path.join(d, "f_*.jpg")))
        if cnt:
            out.append({"kind": "clip", "dir": "file://" + d, "fps": 30, "count": cnt, "name": os.path.basename(c)})
    return out



# ---------------------------------------------------------------- style v2 (natif TikTok)
V2_HOOKS = {
    "v2choc": ["Tes couleurs sont [fades] ?", "Ton VALORANT est trop [terne]", "Arrête de jouer en [gris]", "Ton écran mérite [mieux]"],
    "v2pov": ["POV : t’actives le mode [Néon]", "POV : t’as trouvé le [réglage]", "POV : ton écran [se réveille]", "POV : ton pote voit ton [écran]"],
    "v2question": ["Lequel tu prends ? [1, 2 ou 3]", "Tu choisis [lequel] ?", "Ton look [préféré] ?", "[1, 2 ou 3] ? Dis-le en com"],
    "v2astuce": ["Astuce [Windows 11] pour tes jeux", "Le filtre [gratuit] que t’as pas", "Ça s’active en [2 touches]", "Même jeu, [autres couleurs]"],
}
V2_SUBS = ["regarde bien", "attends 2 sec", "attends la fin", None]
V2_REVEAL = ["[Même partie.] Juste un filtre", "Un raccourci : [Ctrl+Alt+C]", "Look [{p}]", "Et là, [{p}]", "[Avant] / [après]"]
V2_LINES = ["[Gratuit.] Sans compte.", "Marche sur [6 jeux]", "Ça touche [pas] au jeu", "[2 touches] et c’est réglé", "Tout est [réversible]",
            "Fait pour [Windows 11]"]
V2_HL = ["#ffe14d", "#3be38f", "#5ef0ff", "#ff7ad9"]
V2_CAPTIONS = {
    "v2choc": ["Tes couleurs sont fades ? Regarde jusqu’au bout 👀", "Ton jeu peut être bien plus vivant 🎨", "Avant ou après ? 👇"],
    "v2pov": ["POV : tu découvres ColorTweaks 😳", "POV : ton écran passe en mode {p} ⚡", "Ton pote va te demander ton réglage 👀"],
    "v2question": ["1, 2 ou 3 ? Réponds en commentaire 👇", "Lequel tu gardes ? 👇", "Ton look préféré en com 👇"],
    "v2astuce": ["L’astuce Windows 11 pour des couleurs plus vives 🎮", "Un filtre gratuit pour tes jeux 🎨", "2 touches, et ton jeu change de couleurs ⌨️"],
}


CURRENT_LOOK = {}


def build_v2(fmt, rng, hook_i):
    strong = ["Néon", "Vibrant"]
    rng.shuffle(strong)
    rest = ["Cinématique", "Naturel", "FPS"]
    rng.shuffle(rest)
    looks = strong[:1] + rng.sample(strong[1:] + rest, 4)  # revelation toujours sur Néon ou Vibrant
    main = looks[0]
    gp = 0  # source principale (clip anime si disponible) pour l accroche et la revelation
    hook = {"type": "v2hook", "dur": 1.8, "text": V2_HOOKS[fmt][hook_i], "sub": rng.choice(V2_SUBS), "gp": gp,
            "top": rng.choice([300, 330, 360])}
    reveal = {"type": "v2reveal", "dur": 3.2, "preset": main, "gp": gp,
              "text": rng.choice(V2_REVEAL).replace("{p}", main)}
    cuts = {"type": "v2cuts", "dur": 3.0, "presets": looks[1:4], "gp": gp + 1}
    line = {"type": "v2line", "dur": 1.8, "text": rng.choice(V2_LINES), "br": rng.randrange(20)}
    cta = {"type": "v2cta", "dur": 2.4, "preset": main, "gp": gp}
    if fmt == "v2choc":
        scenes = [hook, reveal, cuts, line, cta]
    elif fmt == "v2pov":
        scenes = [hook, reveal, line, cuts, cta]
    elif fmt == "v2question":
        cuts = {**cuts, "presets": looks[:3], "dur": 3.6, "numbered": True}
        scenes = [hook, cuts, {**reveal, "preset": looks[0], "text": "Moi je prends [" + looks[0] + "]"}, cta]
        main = "/".join(looks[:3])
    else:
        scenes = [hook, reveal, line, cuts, cta]
    CURRENT_LOOK["main"] = looks[0]
    return scenes, main, True, {"looks": looks[:4]}

# ---------------------------------------------------------------- scripts (formats)
def build_script(fmt, rng, hook_i):
    lines, kicker, sub = HOOKS[fmt][hook_i]
    hook = {"type": "hook", "dur": 2.4, "lines": lines, "kicker": kicker, "sub": sub}
    outro = {"type": "outro", "dur": 3.6}
    preset = rng.choice(["Vibrant", "Néon", "FPS", "Cinématique"])
    filt = False  # filtre applique sur du gameplay -> mention obligatoire
    variant = {}
    if fmt == "quiz":
        answers = rng.sample(QUIZ_ANSWERS, 4)
        letters = "ABCD"
        q = rng.choice(["Tu cherches quoi en jeu ?", "Ton rendu idéal ?", "Tu veux quoi à l’écran ?"])
        scenes = [hook, {"type": "quizQ", "dur": 4.4, "q": q, "kicker": "Choisis :",
                         "answers": [{"l": letters[i], "t": a[0]} for i, a in enumerate(answers)]}]
        for i, a in enumerate(answers):
            scenes.append({"type": "quizA", "dur": 2.6, "l": letters[i], "t": a[0], "preset": a[1], "why": WHY[a[1]]})
        scenes.append(outro)
        filt = True
        preset = "/".join(a[1] for a in answers)
    elif fmt == "tuto":
        steps = [
            {"t": "Télécharge", "d": "Le ZIP gratuit, lien en bio"},
            {"t": "Installe", "d": "Lance ColorTweaks_Setup.exe, sans droits admin"},
            {"t": "Choisis un look", "d": "Vibrant, Néon ou le look de ton jeu"},
            {"t": "Joue", "d": "Ctrl+Alt+C active ou coupe le filtre"},
        ]
        frm = rng.choice(["Naturel", "Vibrant"])
        to = rng.choice([p for p in PRESETS if p != frm])
        preset = to
        scenes = [hook, {"type": "steps", "dur": 7.0, "title": rng.choice(["En 4 étapes", "C’est parti", "Le guide"]),
                         "steps": steps},
                  {"type": "app", "dur": 4.4, "title": f"Choisis {HL(to)}", "sub": None, "from": frm, "to": to},
                  {"type": "keys", "dur": 3.4, "title": "Puis active", "combo": ["Ctrl", "Alt", "C"], "mode": "toggle",
                   "preset": to, "presses": [1.1, 2.4], "caption": "Active ou coupe le filtre"},
                  outro]
        filt = True
    elif fmt == "avantapres":
        others = [p for p in PRESETS if p != preset]
        rng.shuffle(others)
        car = [preset] + others[:3]
        scenes = [{**hook, "dur": 2.3},
                  {"type": "beforeafter", "dur": 5.6, "preset": preset,
                   "title": rng.choice(["Avant → après", f"Look {HL(preset)}", "Regarde bien"]),
                   "caption": rng.choice(["Le filtre s’applique à tout l’écran", "Un clic, et c’est appliqué",
                                          f"Préréglage {preset}"])},
                  {"type": "carousel", "dur": 6.0, "title": rng.choice(["Choisis ton look", "5 préréglages", "Lequel tu prends ?"]),
                   "presets": car},
                  {"type": "safety", "dur": 3.2, "title": "Et c’est sûr", "items": SAFETY[:3]},
                  outro]
        filt = True
        variant["carousel"] = car
    elif fmt == "raccourcis":
        seq = PRESETS[:]
        rng.shuffle(seq)
        scenes = [{**hook, "dur": 2.3},
                  {"type": "keys", "dur": 4.8, "title": rng.choice(["Activer / couper", "Un raccourci pour tout", "Allumé, éteint"]), "combo": ["Ctrl", "Alt", "C"],
                   "mode": "toggle", "preset": preset, "presses": [1.2, 2.6, 3.7],
                   "caption": rng.choice(["Raccourci global, même en jeu", "Marche en pleine partie", "Sans quitter ton jeu"])},
                  {"type": "keys", "dur": 5.0, "title": rng.choice(["Look suivant", "Change de style", "Fais défiler tes looks"]), "combo": ["Ctrl", "Alt", "N"], "mode": "next",
                   "cycle": seq, "presses": [1.0, 1.9, 2.8, 3.7], "caption": rng.choice(["Passe au préréglage suivant", "Les 5 looks, un par un", "Trouve ton look en jouant"])},
                  {"type": "tray", "dur": 3.0, "title": rng.choice(["Toujours prêt", "Discret", "Près de l’horloge"]), "sub": "Une icône près de l’horloge garde l’appli active",
                   "tip": "Clic droit, Quitter : tes couleurs d’origine reviennent"},
                  outro]
        filt = True
        variant["cycle"] = seq
    elif fmt == "auto":
        g = rng.sample(GAMES, 6)
        scenes = [hook,
                  {"type": "auto", "dur": 6.0, "title": rng.choice(["Mode auto en jeu", "Zéro réglage en partie"]),
                   "game": "VALORANT", "preset": preset, "date": datetime.now(TZ).strftime("%d/%m/%Y"),
                   "caption": rng.choice(["Détection du jeu au premier plan", "Le jeu passe devant, le look suit", "Rien à faire en partie"])},
                  {"type": "games", "dur": 4.4, "title": rng.choice(["6 jeux reconnus", "Ton jeu est dedans ?", "Compatible avec"]), "games": [{"n": a, "l": b} for a, b in g]},
                  {"type": "safety", "dur": 3.0, "title": "Sans risque", "items": rng.sample(SAFETY, 3)},
                  outro]
        filt = True
    elif fmt == "fonctions":
        items = FEATURES[:]
        rng.shuffle(items)
        frm = rng.choice(["Naturel", "Vibrant"])
        to = rng.choice([p for p in PRESETS if p != frm])
        preset = to
        scenes = [{**hook, "dur": 2.3},
                  {"type": "features", "dur": 5.2, "title": "Dans l’appli", "items": [{"i": a, "t": b, "d": c} for a, b, c in items[:4]]},
                  {"type": "features", "dur": 4.6, "title": "Et aussi", "items": [{"i": a, "t": b, "d": c} for a, b, c in items[4:]]},
                  {"type": "app", "dur": 4.2, "title": f"Look {HL(to)}", "from": frm, "to": to},
                  outro]
        filt = True
        variant["order"] = [b for _, b, _ in items]
    elif fmt == "jeux":
        g = GAMES[:]
        rng.shuffle(g)
        others = [p for p in PRESETS if p != preset]
        rng.shuffle(others)
        car = [preset] + others[:2]
        scenes = [{**hook, "dur": 2.3},
                  {"type": "games", "dur": 5.4, "title": "Des looks prêts", "games": [{"n": a, "l": b} for a, b in g],
                   "note": None},
                  {"type": "carousel", "dur": 4.8, "title": "Sur VALORANT", "presets": car},
                  {"type": "safety", "dur": 3.0, "title": "Et c’est sûr", "items": rng.sample(SAFETY, 3)},
                  outro]
        filt = True
        variant["carousel"] = car
    elif fmt == "pov":
        bl = rng.choice(BROLL_LINES)
        others = [p for p in PRESETS if p != preset]
        rng.shuffle(others)
        car = [preset] + others[:2]
        scenes = [{**hook, "dur": 2.6, "broll": True},
                  {"type": "beforeafter", "dur": 5.4, "preset": preset, "title": f"Look {HL(preset)}",
                   "caption": rng.choice(["Un clic, et c’est appliqué", "Le filtre s’applique à tout l’écran"])},
                  {"type": "brollText", "dur": 2.6, "lines": bl[0], "kicker": bl[1], "pos": rng.choice(["center", "low"])},
                  {"type": "carousel", "dur": 4.6, "title": rng.choice(["Choisis ton look", "Lequel tu prends ?"]), "presets": car},
                  {**outro, "broll": rng.random() < 0.5}]
        filt = True
        variant["broll_line"] = bl[0][0]
        variant["carousel"] = car
    elif fmt == "vraifaux":
        picks = rng.sample(TRUTHS, 4)
        scenes = [{**hook, "dur": 2.3, "broll": rng.random() < 0.6}]
        for i, (st, v, d) in enumerate(picks):
            scenes.append({"type": "truth", "dur": 3.6, "statement": st, "verdict": v, "detail": d,
                           "kicker": f"Vrai ou faux ? {i + 1}/4", "broll": rng.random() < 0.5})
        scenes.append(outro)
        filt = False
        preset = "-"
        variant["truths"] = [p[0] for p in picks]
    else:
        raise ValueError(fmt)
    # habillage varie : accroche et fin sur plans d'illustration libres de droits
    if fmt not in ("pov", "vraifaux") and rng.random() < 0.5:
        scenes[0]["broll"] = True
        variant["broll_hook"] = True
    if scenes[-1]["type"] == "outro" and "broll" not in scenes[-1] and rng.random() < 0.35:
        scenes[-1]["broll"] = True
        variant["broll_outro"] = True
    return scenes, preset, filt, variant


def recent_captions(n=10):
    caps = []
    try:
        with open(HISTORY, encoding="utf-8") as f:
            caps += [p.get("caption", "") for p in json.load(f).get("posts", [])[-n:]]
    except Exception:  # noqa
        pass
    for mp in glob.glob(os.path.join(POSTS, "*.json")):
        if not mp.endswith(".metricool.json"):
            try:
                with open(mp, encoding="utf-8") as f:
                    caps.append(json.load(f).get("caption", ""))
            except Exception:  # noqa
                pass
    return {c.split("\n")[0] for c in caps if c}


def caption_for(fmt, rng, filt, gp_kind, games_tags):
    used = recent_captions()
    pool = V2_CAPTIONS[fmt] if fmt.startswith("v2") else CAPTIONS[fmt]
    options = [c for c in pool if c not in used] or pool
    hook = rng.choice(options).replace("{p}", CURRENT_LOOK.get("main", "Néon"))
    lines = [hook, "", "⬇️ Lien en bio pour le télécharger : gratuit, Windows 11."]
    if filt:
        lines.append("*Rendu du filtre reproduit au montage : la capture Windows n’enregistre pas le filtre.")
    n = rng.randint(8, 10)
    pool = TAGS_POOL[:]
    rng.shuffle(pool)
    extra = rng.sample(TAGS_GAMES, 2) if games_tags else []
    tags = TAGS_BASE + extra + pool
    tags = list(dict.fromkeys(tags))[:n]
    lines += ["", " ".join(tags)]
    return "\n".join(lines), hook, tags


# ---------------------------------------------------------------- encodage / controles
def ffprobe(path):
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path]))


def verify(path, report, workdir):
    problems = []
    info = ffprobe(path)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])
    exp = {"codec_name": "h264", "profile": "High", "level": 41, "width": 1080, "height": 1920, "pix_fmt": "yuv420p",
           "color_space": "bt709", "color_primaries": "bt709", "color_transfer": "bt709", "r_frame_rate": "30/1"}
    for k, val in exp.items():
        if v.get(k) != val:
            problems.append(f"video {k}={v.get(k)} (attendu {val})")
    if not (10.0 <= dur <= 25.0):
        problems.append(f"duree {dur:.2f}s hors 10-25 s")
    if not a:
        problems.append("pas de piste audio")
    else:
        if a.get("codec_name") != "aac" or a.get("sample_rate") != "44100":
            problems.append(f"audio {a.get('codec_name')} {a.get('sample_rate')}")
        br = int(a.get("bit_rate", 0))
        if not (170000 <= br <= 215000):
            problems.append(f"debit audio {br}")
    out = subprocess.run(["ffmpeg", "-i", path, "-vn", "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    mean = float(out.split("mean_volume:")[1].split("dB")[0]) if "mean_volume:" in out else -99
    peak = float(out.split("max_volume:")[1].split("dB")[0]) if "max_volume:" in out else -99
    if mean < -32 or peak < -8:
        problems.append(f"son trop faible ou absent (moyenne {mean} dB, crete {peak} dB)")
    if report["layout"]:
        problems += report["layout"]
    # pas de bandes noires unies en haut et en bas (sinon TikTok dedouble la video)
    bands = []
    for t in (0.5, dur / 2, dur - 1.0):
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1",
                                       "-vf", "format=gray", "-f", "rawvideo", "-"])
        img = np.frombuffer(raw, np.uint8).reshape(1920, 1080)
        bands.append((float(img[:140].mean()), float(img[-140:].mean())))
        if img[:140].mean() < 22 or img[-140:].mean() < 22:
            problems.append(f"bande sombre unie a t={t:.1f}s (haut {img[:140].mean():.0f}, bas {img[-140:].mean():.0f})")
    # planche d'images cles pour l'oeil humain / Claude
    sheet = os.path.join(workdir, "planche.jpg")
    kfs = report["keyframes"]
    if kfs:
        args = ["ffmpeg", "-y", "-loglevel", "error"]
        for k in kfs:
            args += ["-i", k]
        cols = min(4, len(kfs))
        rows = (len(kfs) + cols - 1) // cols
        fl = "".join(f"[{i}:v]scale=360:640[s{i}];" for i in range(len(kfs)))
        pad = cols * rows - len(kfs)
        fl += "".join(f"color=c=0x0a2026:s=360x640:d=1[p{i}];" for i in range(pad))
        ins = "".join(f"[s{i}]" for i in range(len(kfs))) + "".join(f"[p{i}]" for i in range(pad))
        fl += f"{ins}xstack=inputs={cols * rows}:layout=" + "|".join(
            f"{(i % cols) * 360}_{(i // cols) * 640}" for i in range(cols * rows)) + "[out]"
        if cols * rows == 1:
            fl = "[0:v]scale=360:640[out]"
        subprocess.run(args + ["-filter_complex", fl, "-map", "[out]", "-frames:v", "1", "-q:v", "3", sheet], check=True)
    return problems, {"duree": round(dur, 2), "son_moyen_db": mean, "son_crete_db": peak, "bandes": bands,
                      "taille_mo": round(os.path.getsize(path) / 1e6, 2), "planche": sheet}


def generate_once(fmt_req=None, seed=None):
    hist = load_history()
    posts = hist.get("posts", [])
    seed = seed if seed is not None else int(time.time() * 1000) % 2**31
    rng = random.Random(seed)
    pending = []
    for mp in glob.glob(os.path.join(POSTS, "*.json")):
        if mp.endswith(".metricool.json"):
            continue
        try:
            with open(mp, encoding="utf-8") as f:
                m = json.load(f)
            if not m.get("problemes"):
                pending.append(m)
        except Exception:  # noqa
            pass
    known = sorted([{"format": p.get("format"), "signature": p.get("signature"), "created": p.get("created", "")} for p in posts]
                   + [{"format": m["format"], "signature": m["signature"], "created": m["created"]} for m in pending],
                   key=lambda x: x["created"] or "")
    last_fmt = known[-1]["format"] if known else None
    used = {p.get("signature") for p in known}
    # choix d'une combinaison jamais utilisee, format different du precedent
    for _ in range(200):
        fmt = fmt_req or rng.choice([f for f in FORMATS_V2 if f != last_fmt])
        is_v2 = fmt.startswith("v2")
        hook_i = rng.randrange(len(V2_HOOKS[fmt] if is_v2 else HOOKS[fmt]))
        sub_seed = rng.randrange(2**31)
        srng = random.Random(sub_seed)
        scenes, preset, filt, variant = (build_v2 if is_v2 else build_script)(fmt, srng, hook_i)
        halos_i = rng.randrange(len(HALOS))
        text_in = rng.choice(["up", "tilt", "left"])
        sig = f"{fmt}|h{hook_i}|{preset}|{json.dumps(variant, ensure_ascii=False, sort_keys=True)}|c{halos_i}|{text_in}"
        # pas la meme accroche qu'une des 10 dernieres videos (meme format)
        recent = [k for k in known if k.get("signature")][-20:]
        recent_hooks = {"|".join(k["signature"].split("|")[:2]) for k in recent}
        recent_looks = {(k["signature"].split("|")[0], k["signature"].split("|")[2]) for k in recent}
        if sig not in used and f"{fmt}|h{hook_i}" not in recent_hooks and (fmt, preset) not in recent_looks:
            break
    else:
        raise RuntimeError("impossible de trouver une combinaison inedite")

    vid = datetime.now(TZ).strftime("%Y%m%d-%H%M%S") + f"-{fmt}"
    workdir = os.path.join(WORK, vid)
    os.makedirs(workdir, exist_ok=True)
    os.makedirs(POSTS, exist_ok=True)
    gp = gameplay_sources(srng, workdir)
    gp_kind = gp[0]["kind"] if gp else None
    games = sorted({g["game"] for g in gp})
    if gp and gp[0]["game"] != "VALORANT":
        for sc in scenes:
            for key in ("text", "sub"):
                if isinstance(sc.get(key), str):
                    sc[key] = sc[key].replace("VALORANT", "jeu")
    n_br = sum(1 for sc in scenes if sc.get("broll") or sc["type"] in ("brollText", "v2line"))
    br = broll_sources(srng, workdir, n_br) if n_br else []
    style = {"textIn": text_in}
    if fmt.startswith("v2"):
        style.update({"v2": True, "hl": srng.choice(V2_HL)})
    cfg = {"seed": seed, "halos": HALOS[halos_i], "style": style, "scenes": scenes,
           "gameplay": {"sources": gp}, "broll": br}
    total = sum(s["dur"] for s in scenes)
    log(f"Format : {fmt} | accroche {hook_i} | look {preset} | {total:.1f} s | gameplay : {gp_kind} ({len(gp)} source(s))")
    cfg_path = os.path.join(workdir, "config.json")
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)

    # 1) rendu des images
    mkv = os.path.join(workdir, "images.mkv")
    rep_path = os.path.join(workdir, "rapport.json")
    subprocess.run(["node", os.path.join(ROOT, "render.js"), cfg_path, mkv, rep_path], check=True, timeout=1500)
    with open(rep_path, encoding="utf-8") as f:
        report = json.load(f)

    # 2) musique originale calee sur les evenements d'animation
    audio, minfo = music.compose(report["duration"], report["events"], np.random.default_rng(seed))
    wav = os.path.join(workdir, "musique.wav")
    wavfile.write(wav, music.SR, (audio * 32767).astype(np.int16))
    log(f"Musique : {minfo['tempo']} BPM, {minfo['tonalite']}, accords {minfo['accords']}")

    # 3) encodage final H.264 High 4.1 / AAC
    out = os.path.join(POSTS, vid + ".mp4")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", mkv, "-i", wav,
        "-vf", "scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=lanczos,format=yuv420p",
        "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.1", "-preset", "medium", "-crf", "19",
        "-maxrate", "14M", "-bufsize", "28M", "-g", "60", "-r", "30",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart", "-shortest", out], check=True)

    # 4) controles
    problems, checks = verify(out, report, workdir)
    caption, cap_hook, tags = caption_for(fmt, srng, filt, gp_kind, fmt in ("auto", "jeux", "vraifaux"))
    if "VALORANT" not in games:
        caption = caption.replace("#valorantclips ", "").replace("#valoranttips ", "").replace("#valorantfr ", "").replace("#valorant ", "#fps ")
    credits = [g["credit"] for g in gp if g.get("credit")]
    if credits:
        parts = caption.rsplit("\n\n", 1)
        caption = parts[0] + "\nImages de jeu : " + " ; ".join(dict.fromkeys(credits)) + "\n\n" + parts[1]
    meta = {
        "id": vid, "created": datetime.now(TZ).isoformat(timespec="seconds"), "format": fmt, "signature": sig,
        "seed": seed, "hook": (V2_HOOKS[fmt][hook_i].replace("[", "").replace("]", "") if fmt.startswith("v2") else
                 " ".join(html.unescape(l).replace('<span class="hl">', "").replace("</span>", "") for l in HOOKS[fmt][hook_i][0])),
        "look": preset, "filtre_reproduit": filt, "gameplay": [g["name"] for g in gp], "jeux": games, "plans": [b["name"] for b in br], "musique": minfo,
        "caption": caption, "hashtags": tags, "file": f"posts/{vid}.mp4", "controles": checks, "problemes": problems,
    }
    with open(os.path.join(POSTS, vid + ".json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    if problems:
        os.remove(out)
        raise RuntimeError("controle echoue : " + " ; ".join(problems))
    for d in glob.glob(os.path.join(workdir, "clip*")) + glob.glob(os.path.join(workdir, "broll*")):
        shutil.rmtree(d, ignore_errors=True)
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", choices=FORMATS)
    ap.add_argument("--seed", type=int)
    a = ap.parse_args()
    last = None
    for attempt in (1, 2):  # une nouvelle tentative en cas d'erreur
        try:
            meta = generate_once(a.format, a.seed if attempt == 1 else None)
            print(json.dumps({"ok": True, "id": meta["id"], "video": meta["file"], "meta": f"posts/{meta['id']}.json",
                              "planche": meta["controles"]["planche"]}, ensure_ascii=False))
            return 0
        except Exception as e:  # noqa
            last = e
            log(f"Tentative {attempt} echouee : {e}")
    write_error("generation", str(last))
    print(json.dumps({"ok": False, "error": str(last)}, ensure_ascii=False))
    return 1


if __name__ == "__main__":
    sys.exit(main())
