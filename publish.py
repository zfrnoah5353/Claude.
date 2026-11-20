#!/usr/bin/env python3
"""Publication des videos ColorTweaks (GitHub + Metricool) et tenue de history.json.

La creation du post Metricool se fait via le connecteur MCP Metricool (outil
createScheduledPost) appele par Claude Code : ce script prepare tout le reste.

  python3 publish.py prepare <id>     commit + push de la video, verifie le lien raw,
                                      ecrit posts/<id>.metricool.json (parametres exacts)
  python3 publish.py record <id> --post-id N --uuid U --planner-url URL --date ISO
                                      note la publication dans history.json (+ push)
  python3 publish.py fail <id> <etape> <message>
                                      note l'erreur dans errors.log, retire la video du depot
  python3 publish.py cleanup          supprime du depot les videos publiees depuis plus de 48 h
  python3 publish.py status           resume des dernieres publications
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.abspath(__file__))
POSTS = os.path.join(ROOT, "posts")
HISTORY = os.path.join(ROOT, "history.json")
ERRORS = os.path.join(ROOT, "errors.log")
TZ = ZoneInfo("Europe/Paris")
REPO = "zfrnoah5353/Claude."
METRICOOL_BLOG_ID = "7583648"  # marque Metricool « colortweaks » (TikTok colortweaks)
DELAY_MIN = 4  # Metricool refuse une date passee : on programme a +4 min
KEEP_HOURS = 48


def now():
    return datetime.now(TZ)


def git(*args, check=True):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} : {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()


def branch():
    return git("rev-parse", "--abbrev-ref", "HEAD")


def push():
    """Push avec nouvelles tentatives (reseau) ; si le distant a avance, fusion puis push."""
    b = branch()
    last = ""
    for i, wait in enumerate((0, 2, 4, 8)):
        time.sleep(wait)
        r = subprocess.run(["git", "push", "-u", "origin", b], cwd=ROOT, capture_output=True, text=True)
        if r.returncode == 0:
            return
        last = r.stderr.strip()
        if "rejected" in last or "fetch first" in last or "non-fast-forward" in last:
            git("fetch", "origin", b)
            git("merge", "--no-edit", "FETCH_HEAD")
    raise RuntimeError(f"push impossible : {last}")


def commit(paths, msg):
    git("add", "-A", "--", *paths)
    if git("diff", "--cached", "--name-only"):
        git("commit", "-q", "-m", msg)
    push()


def load_history():
    if os.path.exists(HISTORY):
        with open(HISTORY, encoding="utf-8") as f:
            return json.load(f)
    return {"posts": []}


def save_history(h):
    with open(HISTORY, "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False, indent=1)
        f.write("\n")


def log_error(stage, msg, vid=None):
    with open(ERRORS, "a", encoding="utf-8") as f:
        f.write(f"[{now().isoformat(timespec='seconds')}] {stage}{' ' + vid if vid else ''} : {msg}\n")


def raw_url(vid):
    return f"https://raw.githubusercontent.com/{REPO}/refs/heads/{branch()}/posts/{vid}.mp4"


def check_url(url, size, tries=12):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=30) as r:
                n = int(r.headers.get("Content-Length", -1))
                if r.status == 200 and n == size:
                    return True
                last = f"HTTP {r.status}, taille {n} au lieu de {size}"
        except Exception as e:  # noqa
            last = str(e)
        time.sleep(5)
    raise RuntimeError(f"lien raw inaccessible : {last}")


def tiktok_title(caption):
    """Titre TikTok obligatoire pour Metricool : la phrase d'accroche, sans emoji, 90 caracteres max."""
    first = caption.split("\n")[0]
    clean = "".join(ch for ch in first if ord(ch) < 0x2190 or ch in "’…").strip(" :")
    return clean[:90].rstrip()


def cmd_prepare(a):
    vid = a.id
    mp4 = os.path.join(POSTS, vid + ".mp4")
    meta_p = os.path.join(POSTS, vid + ".json")
    if not (os.path.exists(mp4) and os.path.exists(meta_p)):
        raise SystemExit(f"video ou description absente pour {vid}")
    with open(meta_p, encoding="utf-8") as f:
        meta = json.load(f)
    if meta.get("problemes"):
        raise SystemExit("la video n'a pas passe les controles : " + "; ".join(meta["problemes"]))
    size = os.path.getsize(mp4)
    if size > 95 * 1024 * 1024:
        raise SystemExit("video trop lourde pour GitHub")
    try:
        commit([f"posts/{vid}.mp4", f"posts/{vid}.json"], f"Video {vid} ({meta['format']})")
    except Exception as e:  # une seule nouvelle tentative
        time.sleep(10)
        commit([f"posts/{vid}.mp4", f"posts/{vid}.json"], f"Video {vid} ({meta['format']})")
    url = raw_url(vid)
    check_url(url, size)
    when = (now() + timedelta(minutes=max(DELAY_MIN, a.delay))).replace(second=0, microsecond=0)
    info = {
        "autoPublish": True,
        "draft": False,
        "descendants": [],
        "firstCommentText": "",
        "hasNotReadNotes": False,
        "media": [url],
        "mediaAltText": [],
        "providers": [{"network": "tiktok"}],
        "publicationDate": {"dateTime": when.strftime("%Y-%m-%dT%H:%M:%S"), "timezone": "Europe/Paris"},
        "shortener": False,
        "smartLinkData": {"ids": []},
        "text": meta["caption"],
        "tiktokData": {
            "disableComment": False, "disableDuet": False, "disableStitch": False,
            "privacyOption": "PUBLIC_TO_EVERYONE",
            "commercialContentThirdParty": False, "commercialContentOwnBrand": True,
            "title": tiktok_title(meta["caption"]), "autoAddMusic": False, "isAigc": True,
        },
    }
    out = {"blogId": METRICOOL_BLOG_ID, "date": when.isoformat(timespec="seconds"), "info": info, "url": url}
    with open(os.path.join(POSTS, vid + ".metricool.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False))


def cmd_record(a):
    vid = a.id
    with open(os.path.join(POSTS, vid + ".json"), encoding="utf-8") as f:
        meta = json.load(f)
    h = load_history()
    h["posts"] = [p for p in h["posts"] if p["id"] != vid]
    h["posts"].append({
        "id": vid, "format": meta["format"], "signature": meta["signature"], "look": meta["look"],
        "hook": meta["hook"], "musique": meta["musique"], "file": meta["file"], "url": raw_url(vid),
        "caption": meta["caption"], "created": meta["created"],
        "metricool": {"post_id": a.post_id, "uuid": a.uuid, "planner_url": a.planner_url, "date": a.date},
        "status": "programme", "published_at": a.date, "deleted_at": None,
    })
    save_history(h)
    mc = os.path.join(POSTS, vid + ".metricool.json")
    commit(["history.json", f"posts/{vid}.metricool.json"] if os.path.exists(mc) else ["history.json"],
           f"Historique : {vid} programme dans Metricool")
    print(f"OK : {vid} note dans history.json")


def cmd_fail(a):
    log_error(a.stage, a.message, a.id)
    paths = []
    for ext in (".mp4", ".json", ".metricool.json"):
        p = f"posts/{a.id}{ext}"
        if os.path.exists(os.path.join(ROOT, p)):
            tracked = subprocess.run(["git", "ls-files", "--error-unmatch", p], cwd=ROOT, capture_output=True).returncode == 0
            if tracked:
                git("rm", "-q", "--", p)
                paths.append(p)
            else:
                os.remove(os.path.join(ROOT, p))
    h = load_history()
    h["posts"].append({"id": a.id, "format": a.id.split("-")[-1], "signature": None, "status": "echec",
                       "erreur": f"{a.stage} : {a.message}", "created": now().isoformat(timespec="seconds")})
    save_history(h)
    try:
        commit(paths + ["history.json", "errors.log"], f"Echec {a.id} ({a.stage})")
    except Exception as e:  # noqa
        log_error("push apres echec", str(e), a.id)
    print(f"Erreur notee dans errors.log ; rien n'a ete publie pour {a.id}")


def cmd_cleanup(a):
    h = load_history()
    limit = now() - timedelta(hours=KEEP_HOURS)
    removed = []
    for p in h["posts"]:
        if p.get("status") != "programme" or p.get("deleted_at"):
            continue
        when = datetime.fromisoformat(p["published_at"])
        if when.tzinfo is None:
            when = when.replace(tzinfo=TZ)
        if when < limit:
            for ext in (".mp4", ".metricool.json"):
                rel = f"posts/{p['id']}{ext}"
                if os.path.exists(os.path.join(ROOT, rel)):
                    git("rm", "-q", "--", rel)
                    removed.append(rel)
            p["deleted_at"] = now().isoformat(timespec="seconds")
    # dossiers de travail locaux de plus d'un jour
    wd = os.path.join(ROOT, "work")
    if os.path.isdir(wd):
        for d in os.listdir(wd):
            full = os.path.join(wd, d)
            if time.time() - os.path.getmtime(full) > 86400:
                shutil.rmtree(full, ignore_errors=True)
    if removed:
        save_history(h)
        commit(removed + ["history.json"], f"Nettoyage : {len(removed)} fichier(s) de plus de 48 h")
    print(f"Nettoyage : {len(removed)} fichier(s) supprime(s)")


def cmd_status(a):
    h = load_history()
    for p in h["posts"][-10:]:
        print(p["id"], p.get("status"), p.get("metricool", {}).get("date", ""), p.get("erreur", ""))


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("prepare"); p.add_argument("id"); p.add_argument("--delay", type=int, default=DELAY_MIN, help="minutes avant publication")
    p = sp.add_parser("record"); p.add_argument("id"); p.add_argument("--post-id", required=True)
    p.add_argument("--uuid", default=""); p.add_argument("--planner-url", default=""); p.add_argument("--date", required=True)
    p = sp.add_parser("fail"); p.add_argument("id"); p.add_argument("stage"); p.add_argument("message")
    sp.add_parser("cleanup")
    sp.add_parser("status")
    a = ap.parse_args()
    try:
        {"prepare": cmd_prepare, "record": cmd_record, "fail": cmd_fail, "cleanup": cmd_cleanup, "status": cmd_status}[a.cmd](a)
    except SystemExit:
        raise
    except Exception as e:  # noqa
        log_error(a.cmd, str(e), getattr(a, "id", None))
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
