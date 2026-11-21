"""Musique originale synthetisee (aucun echantillon, aucune musique protegee).

compose(duration, events, rng) -> (stereo float32 [n,2], infos)
Chaque appel tire un tempo, une tonalite, une suite d'accords, des motifs de batterie,
de basse et d'arpege differents ; les effets (whoosh, pop, clic, impact, montee)
sont places exactement sur les evenements d'animation fournis par le rendu.
"""
import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
NOTE_NAMES = ["Do", "Do#", "Ré", "Mib", "Mi", "Fa", "Fa#", "Sol", "Lab", "La", "Sib", "Si"]
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]
PROGS = {
    "majeur": [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 4, 0, 5], [0, 3, 4, 3], [0, 2, 3, 4]],
    "mineur": [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 5, 3, 4], [5, 6, 0, 0], [0, 3, 6, 5]],
}
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"]


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100) / (SR / 2), "low", output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), "high", output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], "band", output="sos"), x)


def env(n, a, d, s=0.0, r=0.0, sus_len=None):
    """Enveloppe ADSR exponentielle (aucune rampe lineaire)."""
    t = np.arange(n) / SR
    e = np.where(t < a, 1 - np.exp(-5 * t / max(a, 1e-4)), 1.0)
    dec = np.exp(-(t - a) / max(d, 1e-4))
    e = np.where(t >= a, s + (1 - s) * dec, e)
    if r > 0:
        tail = np.clip((t - (t[-1] - r)) / r, 0, 1)
        e *= (1 - tail) ** 2
    return e


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1.0) - 1


def add(buf, start, sig, gain=1.0):
    i = int(round(start * SR))
    if i >= len(buf) or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


# ---------------- instruments ----------------
def kick(rng, tone):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = tone[1] + (tone[0] - tone[1]) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * tone[2])
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t * 300) * 0.25
    return np.tanh((x + click) * 1.6)


def clap(rng):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000)
    e = np.exp(-t * 22)
    for k in (0.0, 0.011, 0.022):  # trois micro-attaques facon clap
        e += 0.6 * np.exp(-np.clip(t - k, 0, None) * 180) * (t >= k)
    return noise * e * 0.5


def hat(rng, open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * (14 if open_ else 70)) * 0.35


def pluck(f, n, bright):
    t = np.arange(n) / SR
    x = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * 2 * t) * 0.3
    x = lp(x, bright)
    return x * env(n, 0.003, 0.18, 0.0, 0.02)


def pad(freqs, n, cutoff, detune):
    x = np.zeros(n)
    for f in freqs:
        for dt in (-detune, 0, detune):
            x += saw(f * (1 + dt), n, phase=np.random.default_rng(int(f)).random())
    x = lp(x / (3 * len(freqs)), cutoff, 2)
    return x * env(n, 0.35, 2.0, 0.85, 0.25)


def bass_note(f, n, cutoff):
    x = saw(f, n) * 0.6 + np.sin(2 * np.pi * f * np.arange(n) / SR) * 0.6
    x = lp(x, cutoff, 2)
    return np.tanh(x * 1.4) * env(n, 0.004, 0.25, 0.55, 0.03)


# ---------------- effets cales sur l'animation ----------------
def sfx(kind, rng, strength=1.0):
    if kind == "whoosh":
        n = int(0.42 * SR)
        t = np.arange(n) / SR
        noise = rng.standard_normal(n)
        out = np.zeros(n)
        # balayage de filtre par blocs (frequence qui monte puis retombe, courbe en cloche)
        blocks = 14
        for b in range(blocks):
            a, z = b * n // blocks, (b + 1) * n // blocks
            p = b / (blocks - 1)
            fc = 400 + 5200 * np.sin(np.pi * p) ** 2
            out[a:z] = bp(noise, fc * 0.6, fc * 1.5)[a:z]
        e = np.sin(np.pi * np.clip(t / t[-1], 0, 1)) ** 2
        return out * e * 0.55 * strength, -0.2
    if kind == "pop":
        n = int(0.11 * SR)
        t = np.arange(n) / SR
        f = 380 + 700 * np.exp(-t * 45)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 38)
        return x * 0.45 * strength, 0.0
    if kind == "tick":
        n = int(0.05 * SR)
        t = np.arange(n) / SR
        x = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120)
        return x * 0.16 * strength, 0.0
    if kind == "click":
        n = int(0.09 * SR)
        t = np.arange(n) / SR
        x = bp(rng.standard_normal(n), 1500, 6000) * np.exp(-t * 90) + np.sin(2 * np.pi * 220 * t) * np.exp(-t * 60) * 0.6
        return x * 0.5 * strength, 0.0
    if kind == "impact":
        n = int(0.9 * SR)
        t = np.arange(n) / SR
        f = 48 + 70 * np.exp(-t * 18)
        boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.5)
        crash = hp(rng.standard_normal(n), 4000) * np.exp(-t * 5) * 0.25
        return np.tanh((boom + crash) * 1.3) * 0.6 * strength, 0.0
    if kind == "riser":
        n = int(0.8 * SR)
        t = np.arange(n) / SR
        noise = rng.standard_normal(n)
        out = np.zeros(n)
        blocks = 16
        for b in range(blocks):
            a, z = b * n // blocks, (b + 1) * n // blocks
            fc = 500 * (12 ** (b / (blocks - 1)))
            out[a:z] = bp(noise, fc * 0.7, fc * 1.4)[a:z]
        e = (t / t[-1]) ** 2.2
        return out * e * 0.4 * strength, 0.0
    return np.zeros(1), 0.0


def compose(duration, events, rng):
    n = int(duration * SR) + SR
    bpm = int(rng.integers(98, 129))
    beat = 60.0 / bpm
    root = int(rng.integers(0, 12))
    mode = "majeur" if rng.random() < 0.55 else "mineur"
    scale = MAJOR if mode == "majeur" else MINOR
    prog = PROGS[mode][int(rng.integers(len(PROGS[mode])))]
    kick_pat = ["four", "halftime", "broken"][int(rng.integers(3))]
    hat_pat = ["8", "16", "off"][int(rng.integers(3))]
    arp_pat = ["up", "down", "updown", "random"][int(rng.integers(4))]
    arp_rate = [0.5, 0.25][int(rng.integers(2))]
    bass_pat = ["8", "off", "pulse"][int(rng.integers(3))]
    seventh = rng.random() < 0.5
    pad_cut = float(rng.uniform(1400, 3200))
    pluck_cut = float(rng.uniform(2500, 6000))
    ktone = (float(rng.uniform(140, 190)), float(rng.uniform(42, 55)), float(rng.uniform(7, 11)))

    def chord(deg, octave_base):
        notes = []
        for k in ([0, 2, 4, 6] if seventh else [0, 2, 4]):
            idx = deg + k
            notes.append(octave_base + root + scale[idx % 7] + 12 * (idx // 7))
        return notes

    drums = np.zeros(n)
    bassb = np.zeros(n)
    padb = np.zeros(n)
    arpb = np.zeros(n)
    fx = np.zeros(n)
    K = kick(rng, ktone)
    C = clap(rng)
    kicks = []

    bar = 4 * beat
    nbars = int(np.ceil(duration / bar)) + 1
    for b in range(nbars):
        t_bar = b * bar
        deg = prog[b % len(prog)]
        # batterie
        if kick_pat == "four":
            kt = [0, 1, 2, 3]
        elif kick_pat == "halftime":
            kt = [0, 2.5]
        else:
            kt = [0, 0.75, 2, 2.5]
        for k in kt:
            kicks.append(t_bar + k * beat)
            add(drums, t_bar + k * beat, K, 0.9)
        for k in ([1, 3] if kick_pat != "halftime" else [2]):
            add(drums, t_bar + k * beat, C, 0.8)
        step = 0.5 if hat_pat in ("8", "off") else 0.25
        for i in range(int(4 / step)):
            pos = i * step
            if hat_pat == "off" and (pos % 1) != 0.5:
                continue
            vel = 0.55 + 0.45 * ((i % 2) == 1) * rng.random()
            add(drums, t_bar + pos * beat, hat(rng, open_=(hat_pat == "off")), vel)
        # pad
        ch = chord(deg, 60)
        add(padb, t_bar, pad([mtof(m) for m in ch], int(bar * SR) + int(0.3 * SR), pad_cut, 0.006), 0.5)
        # basse
        bf = mtof(36 + root + scale[deg % 7])
        if bass_pat == "8":
            bpos = [i * 0.5 for i in range(8)]
        elif bass_pat == "off":
            bpos = [i + 0.5 for i in range(4)]
        else:
            bpos = [0, 0.75, 1.5, 2, 2.75, 3.5]
        for p in bpos:
            add(bassb, t_bar + p * beat, bass_note(bf, int(beat * 0.45 * SR), 520), 0.55)
        # arpege
        tones = chord(deg, 72)
        seq = {"up": tones, "down": tones[::-1], "updown": tones + tones[-2:0:-1]}.get(arp_pat)
        steps = int(4 / arp_rate)
        for i in range(steps):
            m = seq[i % len(seq)] if seq else tones[int(rng.integers(len(tones)))]
            add(arpb, t_bar + i * arp_rate * beat, pluck(mtof(m), int(0.35 * SR), pluck_cut), 0.22)

    # echo sur l'arpege (3/16)
    d = int(0.75 * beat * SR)
    echo = np.zeros(n)
    echo[d:] = arpb[:-d] * 0.35
    echo[2 * d:] += arpb[:-2 * d] * 0.15

    # sidechain : la basse et le pad respirent avec la grosse caisse
    sc = np.ones(n)
    tt = np.arange(int(0.3 * SR)) / SR
    duck = 1 - 0.6 * np.exp(-tt * 14)
    for k in kicks:
        i = int(k * SR)
        if i < n:
            j = min(n, i + len(duck))
            sc[i:j] = np.minimum(sc[i:j], duck[: j - i])

    for e in events:
        sig, off = sfx(e["type"], rng, float(e.get("strength", 1.0)))
        add(fx, e["t"] + off, sig, 1.0)

    music = drums * 0.85 + bassb * sc + padb * sc * 0.9
    left = music + arpb * 0.9 + echo * 0.6 + fx * 0.9
    right = music + arpb * 0.7 + np.roll(echo, int(0.012 * SR)) * 0.8 + fx * 0.9
    st = np.stack([left, right], 1)[: int(duration * SR)]
    st = hp(st.T, 30).T  # nettoyage du grave inaudible

    # fondu de fin (courbe en cosinus) et limiteur doux
    fl = int(0.7 * SR)
    st[-fl:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fl)))[:, None]
    st = np.tanh(st / (np.max(np.abs(st)) + 1e-9) * 1.5)
    st = st / (np.max(np.abs(st)) + 1e-9) * 0.89  # crete ~ -1 dBFS
    infos = {
        "tempo": bpm, "tonalite": f"{NOTE_NAMES[root]} {mode}",
        "accords": "-".join(ROMAN[d] if mode == "majeur" else ROMAN[d].lower() for d in prog),
        "batterie": kick_pat, "charleston": hat_pat, "arpege": arp_pat, "basse": bass_pat, "septiemes": seventh,
    }
    return st.astype(np.float32), infos
