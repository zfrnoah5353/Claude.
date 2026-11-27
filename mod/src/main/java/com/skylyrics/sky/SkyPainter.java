package com.skylyrics.sky;

/** Peint un ciel en projection équirectangulaire (ARGB). Même algorithme que la page d'aperçu. */
public final class SkyPainter {
	private SkyPainter() {
	}

	static float hash3(int x, int y, int z) {
		int h = x * 374761393 + y * 668265263 + z * 2147483647;
		h = (h ^ (h >>> 13)) * 1274126177;
		return ((h ^ (h >>> 16)) & 0xFFFFFFFFL) / 4294967295f;
	}

	static float vnoise(float x, float y, float z) {
		int xi = (int) Math.floor(x), yi = (int) Math.floor(y), zi = (int) Math.floor(z);
		float xf = x - xi, yf = y - yi, zf = z - zi;
		float u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
		float a = lerp(lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v);
		float b = lerp(lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v);
		return lerp(a, b, w);
	}

	static float fbm(float x, float y, float z, int oct) {
		float s = 0, a = 0.5f, f = 1, n = 0;
		for (int i = 0; i < oct; i++) {
			s += a * vnoise(x * f, y * f, z * f);
			n += a;
			a *= 0.5f;
			f *= 2.03f;
		}
		return s / n;
	}

	private static float lerp(float a, float b, float t) {
		return a + (b - a) * t;
	}

	private static float smooth(float a, float b, float x) {
		float t = Math.min(1, Math.max(0, (x - a) / (b - a)));
		return t * t * (3 - 2 * t);
	}

	private static float r(int c) {
		return (c >> 16) & 255;
	}

	private static float g(int c) {
		return (c >> 8) & 255;
	}

	private static float b(int c) {
		return c & 255;
	}

	/** @return pixels ARGB, ligne par ligne, du zénith (y=0) au nadir. */
	public static int[] paint(SkyPreset p, int W, int H) {
		int[] out = new int[W * H];
		float[] sunDir = null;
		if (p.sun) {
			double y = Math.toRadians(p.sunYaw), q = Math.toRadians(p.sunPitch);
			sunDir = new float[]{(float) (Math.cos(q) * Math.cos(y)), (float) Math.sin(q), (float) (Math.cos(q) * Math.sin(y))};
		}
		for (int y = 0; y < H; y++) {
			double lat = (0.5 - (y + 0.5) / H) * Math.PI;
			float sy = (float) Math.sin(lat), cy = (float) Math.cos(lat);
			float[] base = gradient(p.stops, sy);
			for (int x = 0; x < W; x++) {
				double lon = (x + 0.5) / W * Math.PI * 2;
				float dx = (float) (cy * Math.cos(lon)), dz = (float) (cy * Math.sin(lon)), dy = sy;
				float R = base[0], G = base[1], B = base[2];
				if (p.nebulaAmount > 0 && dy > -0.15f) {
					float s = p.nebulaScale, n = fbm(dx * s + 7.1f, dy * s * 1.6f, dz * s - 3.3f, 5);
					float band = (float) Math.exp(-Math.pow((dy - 0.28) / 0.45, 2));
					float m = smooth(0.42f, 0.78f, n) * p.nebulaAmount * band;
					float t = fbm(dx * 2.3f - 4, dy * 2.3f, dz * 2.3f + 9, 3);
					float nr = lerp(r(p.nebulaA), r(p.nebulaB), t), ng = lerp(g(p.nebulaA), g(p.nebulaB), t), nb = lerp(b(p.nebulaA), b(p.nebulaB), t);
					R += (255 - R) * (nr / 255) * m;
					G += (255 - G) * (ng / 255) * m;
					B += (255 - B) * (nb / 255) * m;
				}
				if (p.milky && dy > -0.1f) {
					float tilt = dx * 0.55f + dy * 0.83f;
					float band = (float) Math.exp(-Math.pow(tilt / 0.16, 2));
					float m = band * (0.35f + 0.65f * fbm(dx * 4, dy * 4, dz * 4, 4)) * 0.5f;
					R += (210 - R) * m;
					G += (200 - G) * m;
					B += (255 - B) * m;
				}
				if (p.aurora && dy > 0.02f) {
					float curtain = (float) (Math.sin(lon * 3 + fbm(dx * 1.5f, 0, dz * 1.5f, 3) * 6) * 0.5 + 0.5);
					float h = (float) Math.exp(-Math.pow((dy - 0.32 - 0.08 * curtain) / 0.12, 2));
					float streak = 0.5f + 0.5f * vnoise((float) (lon * 40), 0, 0);
					float m = h * curtain * streak * 0.9f, t = smooth(0.2f, 0.6f, dy);
					R += (lerp(r(p.auroraA), r(p.auroraB), t) - R) * m;
					G += (lerp(g(p.auroraA), g(p.auroraB), t) - G) * m;
					B += (lerp(b(p.auroraA), b(p.auroraB), t) - B) * m;
				}
				if (p.cloudAmount > 0 && dy > -0.05f) {
					float s = p.cloudScale, n = fbm(dx * s * 1.6f + 2, dy * s * 4.5f, dz * s * 1.6f - 5, 5);
					float m = smooth(p.cloudLo, p.cloudHi, n) * p.cloudAmount * smooth(-0.05f, 0.12f, dy) * (1 - smooth(0.55f, 0.95f, dy));
					R += (r(p.cloudColor) - R) * m;
					G += (g(p.cloudColor) - G) * m;
					B += (b(p.cloudColor) - B) * m;
				}
				if (p.stars > 0 && dy > -0.02f) {
					if (hash3(x, y, 91) < p.stars * (0.4f + cy)) {
						float br = (0.4f + 0.6f * hash3(x, y, 17)) * smooth(-0.02f, 0.2f, dy);
						R += (255 - R) * br;
						G += (255 - G) * br;
						B += (255 - B) * br;
					}
				}
				if (sunDir != null) {
					float dot = Math.max(0, dx * sunDir[0] + dy * sunDir[1] + dz * sunDir[2]);
					float disk = (float) Math.pow(dot, p.sunPower * 40), glow = (float) Math.pow(dot, p.sunPower * 0.15) * p.sunGlow;
					float m = Math.min(1, disk * 1.5f + glow);
					R += (r(p.sunColor) - R) * m;
					G += (g(p.sunColor) - G) * m;
					B += (b(p.sunColor) - B) * m;
				}
				out[y * W + x] = 0xFF000000 | (clamp(R) << 16) | (clamp(G) << 8) | clamp(B);
			}
		}
		return out;
	}

	private static int clamp(float v) {
		return Math.max(0, Math.min(255, Math.round(v)));
	}

	private static float[] gradient(float[][] stops, float e) {
		for (int i = 0; i < stops.length - 1; i++) {
			float[] a = stops[i], c = stops[i + 1];
			if (e <= c[0]) {
				float t = Math.max(0, (e - a[0]) / (c[0] - a[0]));
				return new float[]{lerp(a[1], c[1], t), lerp(a[2], c[2], t), lerp(a[3], c[3], t)};
			}
		}
		float[] l = stops[stops.length - 1];
		return new float[]{l[1], l[2], l[3]};
	}
}
