# Petits sons « bonbon » synthétisés : doux, courts, sans saturation.
import numpy as np, wave, subprocess, os
SR = 44100
def t(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.004, r=None, curve=4.0):
    x = np.linspace(0, 1, n)
    e = np.minimum(1, x * len(x) / max(1, a * SR)) * (1 - x) ** curve
    return e
def tone(f, d, shape='sine', curve=4.0, a=0.004, vib=0.0):
    tt = t(d)
    ph = 2 * np.pi * np.cumsum(np.full_like(tt, 1.0) * (f if np.isscalar(f) else 1) / SR) if np.isscalar(f) else 2 * np.pi * np.cumsum(f) / SR
    if vib: ph += vib * np.sin(2 * np.pi * 6 * tt)
    if shape == 'sine': w = np.sin(ph)
    elif shape == 'tri': w = 2 / np.pi * np.arcsin(np.sin(ph))
    elif shape == 'bell': w = np.sin(ph) + 0.35 * np.sin(2.76 * ph) * np.exp(-tt * 18) + 0.2 * np.sin(5.4 * ph) * np.exp(-tt * 30)
    return w * env(len(tt), a, curve=curve)
def sweep(f0, f1, d, shape='sine', curve=3.0, a=0.003, expo=True):
    n = int(SR * d)
    f = f0 * (f1 / f0) ** np.linspace(0, 1, n) if expo else np.linspace(f0, f1, n)
    return tone(f, d, shape, curve, a)
def noise(d, lp=0.2, curve=3.0):
    n = int(SR * d); w = np.random.default_rng(3).standard_normal(n)
    y = np.zeros(n); acc = 0
    for i in range(n): acc += lp * (w[i] - acc); y[i] = acc
    return y / (np.abs(y).max() + 1e-9) * env(n, 0.002, curve=curve)
def mix(*parts):
    n = max(len(p[1]) + int(p[0] * SR) for p in parts)
    out = np.zeros(n)
    for off, sig, g in parts:
        o = int(off * SR); out[o:o + len(sig)] += sig * g
    return out
def save(name, y, gain=0.8):
    y = y / (np.abs(y).max() + 1e-9) * gain
    # petite réverbération pour adoucir
    d = int(0.045 * SR); r = np.zeros(len(y) + d * 4); r[:len(y)] += y
    for k in range(1, 4): r[d * k:d * k + len(y)] += y * (0.22 / k)
    r = r / (np.abs(r).max() + 1e-9) * gain
    pcm = (r * 32767).astype(np.int16)
    with wave.open(name + '.wav', 'w') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', name + '.wav', '-c:a', 'libvorbis', '-q:a', '6', name + '.ogg'], check=True)
    os.remove(name + '.wav')

# clic : petite bulle douce
save('click', sweep(520, 980, 0.07, 'sine', curve=2.5), 0.55)
# tap sur un tas : « boup » rond + grain
save('tap', mix((0, sweep(300, 170, 0.09, 'sine', 3), 1), (0, noise(0.03, 0.15), 0.25)), 0.7)
# pièce : double tintement de clochette
save('coin', mix((0, tone(1568, 0.25, 'bell', 5), 1), (0.06, tone(2093, 0.35, 'bell', 5), 0.9)), 0.6)
# pop : bulle qui éclate
save('pop', mix((0, sweep(380, 1300, 0.08, 'sine', 2), 1), (0.03, noise(0.04, 0.4), 0.2)), 0.65)
# erreur : deux notes qui descendent, gentiment
save('error', mix((0, tone(392, 0.12, 'tri', 3), 1), (0.11, tone(311, 0.18, 'tri', 3), 1)), 0.5)
# achat : arpège brillant
save('buy', mix(*[(i * 0.055, tone(f, 0.3, 'bell', 4), 1 - i * 0.12) for i, f in enumerate([1047, 1319, 1568, 2093])]), 0.6)
# éclosion : craquement + souffle
cr = mix(*[(i * 0.07, noise(0.03, 0.6, 5), 0.8) for i in range(4)])
save('hatch', mix((0, cr, 0.7), (0.2, noise(0.5, 0.05, 2) * np.linspace(0.2, 1, int(0.5 * SR)) ** 2, 0.5), (0.25, sweep(300, 900, 0.45, 'sine', 1.5), 0.5)), 0.65)
# révélation : scintillement qui monte
save('reveal', mix(*[(i * 0.045, tone(f, 0.5, 'bell', 4), 0.85) for i, f in enumerate([784, 988, 1175, 1568, 1976, 2349])]), 0.6)
# légendaire / divin : accord de fanfare + scintillement
chord = mix(*[(0.0, tone(f, 1.4, 'tri', 1.6, a=0.02, vib=0.004), 1) for f in [523, 659, 784, 1047]])
save('legend', mix((0, tone(392, 0.16, 'tri', 2), 0.8), (0.14, tone(523, 0.16, 'tri', 2), 0.8), (0.3, chord, 1), (0.3, mix(*[(i * 0.06, tone(f, 0.6, 'bell', 4), 0.4) for i, f in enumerate([2093, 2637, 3136, 4186])]), 1)), 0.7)
print('ok')
