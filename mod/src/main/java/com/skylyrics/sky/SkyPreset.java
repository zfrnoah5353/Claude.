package com.skylyrics.sky;

import java.util.LinkedHashMap;
import java.util.Map;

/** Description d'un ciel : dégradé, nuages, nébuleuse, aurore, étoiles, soleil. */
public final class SkyPreset {
	public final String id, name;
	public final int horizon;
	float[][] stops; // {élévation -1..1, r, g, b}
	// nuages
	int cloudColor;
	float cloudAmount, cloudScale, cloudLo, cloudHi;
	// nébuleuse
	int nebulaA, nebulaB;
	float nebulaAmount, nebulaScale;
	// aurore
	int auroraA, auroraB;
	boolean aurora;
	boolean milky;
	float stars;
	// soleil
	boolean sun;
	float sunYaw, sunPitch, sunPower, sunGlow;
	int sunColor;

	private SkyPreset(String id, String name, int horizon) {
		this.id = id;
		this.name = name;
		this.horizon = horizon;
	}

	private SkyPreset stops(Object... s) {
		stops = new float[s.length / 2][];
		for (int i = 0; i < s.length; i += 2) {
			int c = (Integer) s[i + 1];
			stops[i / 2] = new float[]{((Number) s[i]).floatValue(), (c >> 16) & 255, (c >> 8) & 255, c & 255};
		}
		return this;
	}

	private SkyPreset clouds(int color, float amount, float scale, float lo, float hi) {
		cloudColor = color;
		cloudAmount = amount;
		cloudScale = scale;
		cloudLo = lo;
		cloudHi = hi;
		return this;
	}

	private SkyPreset nebula(int a, int b, float amount, float scale) {
		nebulaA = a;
		nebulaB = b;
		nebulaAmount = amount;
		nebulaScale = scale;
		return this;
	}

	private SkyPreset aurora(int a, int b) {
		aurora = true;
		auroraA = a;
		auroraB = b;
		return this;
	}

	private SkyPreset stars(float d) {
		stars = d;
		return this;
	}

	private SkyPreset milky() {
		milky = true;
		return this;
	}

	private SkyPreset sun(float yaw, float pitch, int color, float power, float glow) {
		sun = true;
		sunYaw = yaw;
		sunPitch = pitch;
		sunColor = color;
		sunPower = power;
		sunGlow = glow;
		return this;
	}

	public static final Map<String, SkyPreset> ALL = new LinkedHashMap<>();

	private static void add(SkyPreset p) {
		ALL.put(p.id, p);
	}

	static {
		add(new SkyPreset("sunset", "Coucher de soleil", 0xF2A35E)
				.stops(-1, 0x7A3D22, -0.05, 0xE8935A, 0.02, 0xF6AE68, 0.25, 0xE5813E, 0.6, 0xCF6A2F, 1, 0xB4522A)
				.clouds(0xFFD2A1, 0.55f, 2.2f, 0.52f, 0.78f).sun(200, 6, 0xFFF0C2, 60, 0.65f));
		add(new SkyPreset("nebula", "Nébuleuse", 0x4A1D8A)
				.stops(-1, 0x120728, -0.05, 0x3A1475, 0.04, 0x7B34D6, 0.18, 0x5A22B0, 0.5, 0x2A0F62, 1, 0x12082E)
				.nebula(0xD24BD8, 0x6A3CFF, 0.85f, 1.6f).stars(0.0045f));
		add(new SkyPreset("aurora", "Aurore", 0x123C4A)
				.stops(-1, 0x06141C, 0, 0x123C4A, 0.2, 0x0B2733, 1, 0x040B16)
				.aurora(0x3DFFB0, 0x7A5CFF).stars(0.004f));
		add(new SkyPreset("golden", "Heure dorée", 0xFFD27A)
				.stops(-1, 0x8A5A1E, 0, 0xFFD27A, 0.2, 0xFFC15E, 0.6, 0xF2A541, 1, 0xD98A2B)
				.clouds(0xFFF2C9, 0.45f, 2.6f, 0.55f, 0.8f).sun(160, 10, 0xFFFBE6, 40, 0.8f));
		add(new SkyPreset("pink", "Crépuscule rose", 0xFFB1C8)
				.stops(-1, 0x5C2A4A, 0, 0xFFB1C8, 0.22, 0xF08FBF, 0.6, 0xA466C9, 1, 0x5B3C9E)
				.clouds(0xFFE0EF, 0.4f, 2.0f, 0.55f, 0.82f).stars(0.0012f));
		add(new SkyPreset("midnight", "Minuit", 0x1D2B5C)
				.stops(-1, 0x060914, 0, 0x1D2B5C, 0.25, 0x111A3D, 1, 0x05070F)
				.milky().stars(0.006f));
		add(new SkyPreset("cotton", "Barbe à papa", 0xCFE3FF)
				.stops(-1, 0x7D8FB8, 0, 0xE6EEFF, 0.2, 0xBCD2FF, 0.55, 0xF2C6EA, 1, 0xC5A8F2)
				.clouds(0xFFFFFF, 0.7f, 2.4f, 0.5f, 0.75f));
		add(new SkyPreset("blood", "Lune de sang", 0x5A0F16)
				.stops(-1, 0x12030A, 0, 0x5A0F16, 0.25, 0x36070F, 1, 0x0D0207)
				.sun(30, 28, 0xFF3B3B, 900, 0.35f).stars(0.003f));
		add(new SkyPreset("ocean", "Grand bleu", 0xBFE4FF)
				.stops(-1, 0x2B5F8A, 0, 0xCDEAFF, 0.2, 0x8CC8FF, 0.6, 0x4F9CF0, 1, 0x2F74D6)
				.clouds(0xFFFFFF, 0.6f, 3.0f, 0.58f, 0.8f).sun(120, 50, 0xFFFFFF, 300, 0.4f));
		add(new SkyPreset("void", "Espace", 0x0A0A12)
				.stops(-1, 0x000000, 0, 0x0A0A12, 1, 0x000002)
				.nebula(0x3A6BFF, 0xFF4FA3, 0.45f, 1.2f).milky().stars(0.008f));
	}

	public static SkyPreset get(String id) {
		SkyPreset p = ALL.get(id);
		return p != null ? p : ALL.get("sunset");
	}
}
