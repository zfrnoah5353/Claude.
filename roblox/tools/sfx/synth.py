# Sons du jeu, synthétisés dans l'esprit des simulateurs de pets populaires :
# attaques nettes, petite basse, sons brillants et « satisfaisants », révélations
# qui montent en puissance avec la rareté. Usage : python3 synth.py dossier_de_sortie
import numpy as np, wave, subprocess, os, sys

SR = 44100
rng = np.random.default_rng(7)
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


def n_of(d):
    return int(SR * d)


def osc(f, d, shape='sine'):
    n = n_of(d)
    f = np.full(n, f, dtype=float) if np.isscalar(f) else np.asarray(f, dtype=float)[:n]
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == 'sine':
        return np.sin(ph)
    if shape == 'tri':
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if shape == 'square':
        return np.tanh(4 * np.sin(ph))
    if shape == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    raise ValueError(shape)


def glide(f0, f1, d, expo=True):
    x = np.linspace(0, 1, n_of(d))
    return f0 * (f1 / f0) ** x if expo else f0 + (f1 - f0) * x


def env(d, a=0.002, decay=8.0, hold=0.0):
    n = n_of(d)
    tt = np.arange(n) / SR
    e = np.where(tt < a, tt / max(a, 1e-6), np.exp(-np.maximum(0, tt - a - hold) * decay))
    fade = np.minimum(1, (n - np.arange(n)) / (0.004 * SR))
    return e * fade


def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def hp(x, fc):
    return x - lp(x, fc)


def bp(x, lo, hi):
    return lp(hp(x, lo), hi)


def noise(d):
    return rng.standard_normal(n_of(d))


def bell(f, d, decay=6.0, bright=1.0):
    tt = np.arange(n_of(d)) / SR
    s = osc(f, d) + 0.5 * bright * osc(f * 2.0, d) * np.exp(-tt * 10) + 0.28 * bright * osc(f * 3.01, d) * np.exp(-tt * 18) + 0.15 * bright * osc(f * 4.2, d) * np.exp(-tt * 28)
    return s * env(d, 0.001, decay)


def at(total, *parts):
    out = np.zeros(n_of(total))
    for off, sig, g in parts:
        o = n_of(off)
        m = min(len(sig), len(out) - o)
        if m > 0:
            out[o:o + m] += sig[:m] * g
    return out


def thump(f0, f1, d, decay=14):
    return osc(glide(f0, f1, d), d) * env(d, 0.001, decay)


def save(name, y, peak=0.92, drive=1.6, room=0.18):
    y = np.tanh(drive * y / (np.abs(y).max() + 1e-9)) / np.tanh(drive)
    if room > 0:  # petite pièce : quelques échos très courts
        r = np.zeros(len(y) + n_of(0.12))
        r[:len(y)] += y
        wet = lp(y, 5000)
        for dt, g in [(0.023, 0.5), (0.037, 0.35), (0.061, 0.22), (0.089, 0.12)]:
            o = n_of(dt)
            r[o:o + len(y)] += wet * g * room * 3
        y = r
    y = y / (np.abs(y).max() + 1e-9) * peak
    pcm = (y * 32767).astype(np.int16)
    path = os.path.join(OUT, name)
    with wave.open(path + '.wav', 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path + '.wav', '-c:a', 'libvorbis', '-q:a', '7', path + '.ogg'], check=True)
    os.remove(path + '.wav')
    print(name, f'{len(y) / SR:.2f}s')


def sparkle(d, notes, step, decay=7, g=0.6):
    return at(d, *[(i * step, bell(f, d - i * step, decay), g * (1 - i * 0.06)) for i, f in enumerate(notes)])


def brass(freqs, d, cutoff=2600, decay=2.2):
    tt = np.arange(n_of(d)) / SR
    s = sum(osc(f * (1 + det), d, 'saw') for f in freqs for det in (-0.004, 0.0, 0.005))
    s = lp(s, cutoff) * env(d, 0.015, decay)
    return s * (1 + 0.04 * np.sin(2 * np.pi * 5.5 * tt))


# --- interface -------------------------------------------------------------
# clic : « boop » rond et court
save('click', at(0.12,
    (0, osc(glide(980, 520, 0.09), 0.09) * env(0.09, 0.001, 32), 1.0),
    (0, osc(glide(490, 260, 0.09), 0.09, 'tri') * env(0.09, 0.001, 30), 0.35),
    (0, hp(noise(0.006), 3000) * env(0.006, 0.0005, 400), 0.25)), drive=1.3, room=0.08)

save('open', at(0.22,
    (0, osc(glide(380, 1150, 0.13), 0.13) * env(0.13, 0.002, 12), 1.0),
    (0, bp(noise(0.18), 900, 5000) * np.linspace(0.2, 1, n_of(0.18)) * env(0.18, 0.01, 14), 0.35),
    (0.09, bell(1568, 0.13, 20), 0.35)), drive=1.3, room=0.1)

save('close', at(0.18,
    (0, osc(glide(1000, 380, 0.12), 0.12) * env(0.12, 0.002, 14), 1.0),
    (0, bp(noise(0.12), 700, 4000) * env(0.12, 0.003, 22), 0.25)), drive=1.3, room=0.08)

save('error', at(0.34,
    (0, lp(osc(glide(240, 200, 0.12), 0.12, 'square'), 1400) * env(0.12, 0.002, 18), 1.0),
    (0.14, lp(osc(glide(200, 150, 0.16), 0.16, 'square'), 1200) * env(0.16, 0.002, 14), 1.0)), drive=1.5, room=0.08)

# --- jeu -------------------------------------------------------------------
# coup sur un tas : claque + basse
save('tap', at(0.16,
    (0, lp(noise(0.03), 2600) * env(0.03, 0.0005, 90), 0.9),
    (0, thump(190, 70, 0.14, 22), 1.0),
    (0, osc(glide(1400, 700, 0.03), 0.03, 'tri') * env(0.03, 0.0005, 120), 0.25)), drive=2.2, room=0.05)

# pièce : « bling » brillant (le jeu monte la hauteur si tu enchaînes)
save('coin', at(0.32,
    (0, hp(noise(0.012), 4000) * env(0.012, 0.0005, 300), 0.35),
    (0, bell(1976, 0.3, 11), 0.8),
    (0.045, bell(2637, 0.27, 10), 0.9)), drive=1.4, room=0.12)

# tas cassé : crunch de bonbon + basse + étincelles
crunch = at(0.16, *[(i * 0.028 + rng.uniform(0, 0.008), bp(noise(0.035), 1800, 7000) * env(0.035, 0.0005, 70), 1 - i * 0.12) for i in range(5)])
save('break', at(0.7,
    (0, crunch, 1.0),
    (0, thump(140, 42, 0.35, 9), 1.1),
    (0.06, sparkle(0.6, [1568, 2093, 2637], 0.05, 9), 0.45)), drive=2.0, room=0.15)

# achat : « ka-ching »
save('buy', at(0.75,
    (0, hp(noise(0.02), 2500) * env(0.02, 0.0005, 160), 0.6),
    (0.02, thump(300, 140, 0.08, 30), 0.5),
    (0.05, sparkle(0.7, [1047, 1319, 1568, 2093], 0.035, 6), 1.0),
    (0.2, bell(2637, 0.5, 6), 0.45)), drive=1.5, room=0.18)

# éclosion : roulement de tambour qui accélère, puis l'œuf craque (dure 1 s)
roll = []
tpos, gap = 0.0, 0.11
while tpos < 0.9:
    k = tpos / 0.9
    hit = lp(noise(0.05), 3500) * env(0.05, 0.0008, 60) * 0.7 + thump(210, 150, 0.05, 50) * 0.5
    roll.append((tpos, hit, 0.35 + 0.65 * k))
    tpos += gap
    gap = max(0.026, gap * 0.86)
riser = osc(glide(180, 620, 0.95), 0.95, 'tri') * np.linspace(0, 1, n_of(0.95)) ** 2 * 0.35
crack = bp(noise(0.08), 1500, 8000) * env(0.08, 0.0005, 45)
save('hatch', at(1.25, *roll, (0, riser, 1.0), (0.95, crack, 1.2), (0.95, thump(160, 50, 0.25, 12), 1.0)), drive=1.8, room=0.15)

# --- révélations, de la plus simple à la plus folle ------------------------
save('reveal', at(0.8,
    (0, bell(784, 0.35, 9), 0.8),
    (0.1, bell(1047, 0.6, 6), 1.0),
    (0.12, sparkle(0.6, [2093, 2637, 3136], 0.05, 9), 0.35)), drive=1.4, room=0.2)

save('reveal_rare', at(1.2,
    (0, bp(noise(0.25), 1200, 6000) * np.linspace(0, 1, n_of(0.25)) ** 2, 0.3),
    (0.22, sparkle(0.95, [784, 988, 1175, 1568], 0.07, 5), 1.0),
    (0.5, sparkle(0.7, [2349, 2637, 3136, 3951], 0.04, 8), 0.4),
    (0.22, thump(110, 55, 0.3, 10), 0.6)), drive=1.5, room=0.22)

C = [523.25, 659.25, 783.99]
save('legend', at(1.9,
    (0, brass([392.0], 0.14, 2400, 8), 0.5),
    (0.13, brass([523.25], 0.14, 2400, 8), 0.5),
    (0.27, brass(C + [1046.5], 1.5, 3000, 2.0), 0.7),
    (0.27, thump(90, 38, 0.6, 5), 1.2),
    (0.3, sparkle(1.5, [1568, 2093, 2637, 3136, 4186], 0.06, 4), 0.5)), drive=1.8, room=0.25)

riser = (bp(noise(0.7), 600, 7000) * np.linspace(0, 1, n_of(0.7)) ** 3 * 0.8 + osc(glide(150, 900, 0.7), 0.7, 'saw') * np.linspace(0, 1, n_of(0.7)) ** 2 * 0.25)
pad = brass([261.63, 329.63, 392.0, 493.88, 523.25], 2.3, 2200, 1.0)
cascade = sparkle(2.0, [2093, 2349, 2637, 3136, 3520, 4186, 4699, 5274], 0.08, 3.5)
save('divine', at(3.2,
    (0, riser, 1.0),
    (0.7, thump(70, 28, 1.0, 3.5), 1.6),
    (0.7, lp(noise(0.3), 900) * env(0.3, 0.001, 9), 0.8),
    (0.72, pad, 0.8),
    (0.8, cascade, 0.55)), drive=2.0, room=0.3)

# quête réussie : petit arpège de victoire
save('quest', at(0.9,
    *[(i * 0.08, lp(osc(f, 0.22, 'square'), 3000) * env(0.22, 0.003, 10), 0.45) for i, f in enumerate([523.25, 659.25, 783.99])],
    (0.24, lp(osc(1046.5, 0.6, 'square'), 3500) * env(0.6, 0.003, 4), 0.55),
    (0.24, sparkle(0.6, [2093, 2637, 3136], 0.05, 7), 0.4)), drive=1.5, room=0.2)
