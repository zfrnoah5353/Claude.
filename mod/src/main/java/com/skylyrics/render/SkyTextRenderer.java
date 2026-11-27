package com.skylyrics.render;

import com.skylyrics.Clock;
import com.mojang.blaze3d.vertex.PoseStack;
import com.skylyrics.Config;
import com.skylyrics.lyrics.Lyrics;
import com.skylyrics.lyrics.LyricsEngine;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import org.joml.Matrix4f;
import org.joml.Quaternionf;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * Dessine les paroles en 3D dans le ciel : chaque mot apparaît à son tour, la ligne est
 * courbée et inclinée au hasard, et la ligne précédente s'efface quand la suivante arrive.
 */
public final class SkyTextRenderer {
	private static final float FONT_H = 9f; // hauteur d'une ligne de police (unités de police)
	private static final Random RANDOM = new Random();

	private static final List<LineFx> LINES = new ArrayList<>();
	private static int currentIndex = -2;
	private static String currentTrack = "";
	private static String layoutKey = "";

	private SkyTextRenderer() {
	}

	/** Force la recréation de la ligne en cours (changement de style, police…). */
	public static void reset() {
		LINES.clear();
		currentIndex = -2;
	}

	public static void render(MultiBufferSource consumers) {
		Minecraft mc = Minecraft.getInstance();
		Config cfg = Config.get();
		if (mc.level == null) return;
		LyricsEngine engine = LyricsEngine.get();
		if (!cfg.lyricsEnabled) {
			LINES.clear();
			currentIndex = -2;
			return;
		}

		String key = cfg.style + "|" + cfg.font + "|" + cfg.display + "|" + cfg.animation;
		if (!key.equals(layoutKey)) {
			layoutKey = key;
			reset();
		}
		if (!engine.trackKey().equals(currentTrack)) {
			currentTrack = engine.trackKey();
			reset();
		}

		Camera camera = mc.gameRenderer.getMainCamera();
		long now = Clock.nanos();
		Lyrics lyrics = engine.lyrics();
		long t = engine.positionMs();
		int idx = lyrics == null ? -1 : lyrics.lineAt(t);
		if (idx != currentIndex) {
			for (LineFx l : LINES) l.die(now);
			if (lyrics != null && idx >= 0) {
				Lyrics.Line line = lyrics.lines.get(idx);
				if (!line.isBlank()) LINES.add(new LineFx(line, camera, mc.font));
			}
			currentIndex = idx;
		}
		if (lyrics != null && idx >= 0) {
			Lyrics.Line line = lyrics.lines.get(idx);
			if (t > line.endMs() + 1500) for (LineFx l : LINES) l.die(now);
		}
		Iterator<LineFx> it = LINES.iterator();
		while (it.hasNext()) {
			LineFx l = it.next();
			if (!l.render(t, now, camera, mc.font, consumers)) it.remove();
		}
	}

	private static float easeOut(float x) {
		float a = 1 - x;
		return 1 - a * a * a;
	}

	private static float easeBack(float x) {
		float c = 1.6f, a = x - 1;
		return 1 + (c + 1) * a * a * a + c * a * a;
	}

	private static final class WordFx {
		final Lyrics.Word word;
		final float width;
		float lx, ly;

		WordFx(Lyrics.Word word, float width) {
			this.word = word;
			this.width = width;
		}
	}

	private static final class LineFx {
		final Lyrics.Line line;
		final List<WordFx> words = new ArrayList<>();
		final String fontId;
		final LyricStyle style;
		final float tilt, bend;
		float anchorYaw, anchorPitch;
		long dieAt = 0;

		LineFx(Lyrics.Line line, Camera camera, Font font) {
			this.line = line;
			this.style = LyricStyle.current();
			this.fontId = LyricStyle.currentFont();
			for (Lyrics.Word w : line.words()) {
				words.add(new WordFx(w, font.width(LyricStyle.text(w.text(), fontId))));
			}
			// Mise en page : retour à la ligne au-delà de ~110 unités
			float space = Math.max(font.width(LyricStyle.text(" ", fontId)) * 1.4f, FONT_H * 0.4f);
			float maxW = FONT_H * 11.5f;
			List<List<WordFx>> rows = new ArrayList<>();
			rows.add(new ArrayList<>());
			float rw = 0;
			for (WordFx w : words) {
				if (rw > 0 && rw + space + w.width > maxW) {
					rows.add(new ArrayList<>());
					rw = 0;
				}
				rows.get(rows.size() - 1).add(w);
				rw += (rw > 0 ? space : 0) + w.width;
			}
			float rowH = FONT_H * 1.2f;
			for (int r = 0; r < rows.size(); r++) {
				List<WordFx> row = rows.get(r);
				float total = space * (row.size() - 1);
				for (WordFx w : row) total += w.width;
				float x = -total / 2;
				for (WordFx w : row) {
					w.lx = x + w.width / 2;
					w.ly = (r - (rows.size() - 1) / 2f) * rowH;
					x += w.width + space;
				}
			}
			float r = RANDOM.nextFloat();
			boolean multi = rows.size() > 1;
			if (multi || r < 0.35f) tilt = (RANDOM.nextFloat() - 0.5f) * 0.1f;
			else tilt = (RANDOM.nextBoolean() ? -1 : 1) * (0.12f + RANDOM.nextFloat() * 0.34f);
			bend = (RANDOM.nextFloat() - 0.5f) * 2f * (multi ? 0.0007f : 0.0018f);
			float camYaw = camera.yRot() * Mth.DEG_TO_RAD;
			float camPitch = -camera.xRot() * Mth.DEG_TO_RAD; // positif = vers le haut
			if (Config.get().display == Config.Display.FLOAT) {
				anchorYaw = camYaw;
				anchorPitch = camPitch + 0.12f;
			} else {
				anchorYaw = camYaw + (RANDOM.nextFloat() - 0.5f) * 0.55f;
				anchorPitch = Math.max(camPitch, -0.05f) + 0.16f + RANDOM.nextFloat() * 0.2f;
				anchorPitch = Math.min(anchorPitch, 1.2f);
			}
		}

		void die(long now) {
			if (dieAt == 0) dieAt = now;
		}

		/** @return false quand la ligne a fini de s'effacer. */
		boolean render(long t, long now, Camera camera, Font font, MultiBufferSource consumers) {
			Config cfg = Config.get();
			boolean floating = cfg.display == Config.Display.FLOAT;
			float camYaw = camera.yRot() * Mth.DEG_TO_RAD;
			float camPitch = -camera.xRot() * Mth.DEG_TO_RAD;
			if (floating) {
				anchorYaw += Mth.wrapDegrees((camYaw - anchorYaw) * Mth.RAD_TO_DEG) * Mth.DEG_TO_RAD * 0.08f;
				anchorPitch += (camPitch + 0.12f - anchorPitch) * 0.08f;
			}
			float fade = dieAt == 0 ? 1f : 1f - Mth.clamp((now - dieAt) / 450e6f, 0f, 1f);
			if (fade <= 0f) return false;

			int renderChunks = Minecraft.getInstance().options.getEffectiveRenderDistance();
			float maxD = Math.max(12f, renderChunks * 16f * 0.75f);
			float D = floating ? 9f : Math.min(cfg.distance, maxD);
			// k = taille d'une unité de police en blocs, pour que le texte fasse ~3,4° de haut
			float k = (float) (D * Math.tan(Math.toRadians(3.4 * cfg.textScale)) / FONT_H);
			float ct = Mth.cos(tilt), st = Mth.sin(tilt);
			Font.DisplayMode mode = floating ? Font.DisplayMode.SEE_THROUGH : Font.DisplayMode.NORMAL;
			float riseDie = dieAt == 0 ? 0 : (now - dieAt) / 1e6f * 0.05f / 10f;

			for (WordFx w : words) {
				long appear = cfg.animation == Config.Animation.LINE ? line.startMs() : w.word.startMs();
				float p = Mth.clamp((t - appear) / 320f, 0f, 1f);
				if (p <= 0f) continue;
				String txt = w.word.text();
				if (cfg.animation == Config.Animation.LETTER) {
					float lp = Mth.clamp((t - w.word.startMs()) / (float) Math.max(120, w.word.endMs() - w.word.startMs()), 0f, 1f);
					int n = Math.max(1, Math.min(txt.length(), (int) Math.ceil(txt.length() * lp)));
					txt = txt.substring(0, n);
				}
				float alpha = easeOut(p) * fade;
				if (alpha < 0.03f) continue;

				float rise = (1 - easeOut(p)) * FONT_H * 0.45f + riseDie;
				float x0 = w.lx, y0 = w.ly + rise;
				float x = x0 * ct - y0 * st;
				float y = x0 * st + y0 * ct;
				y += bend * x * x;
				float roll = tilt + (float) Math.atan(2 * bend * x);
				float pitch = anchorPitch - y * k / D;  // y vers le bas
				// plus on regarde haut, plus un degré de yaw est "court" : on compense pour garder l'espacement
				float yaw = anchorYaw + x * k / (D * Math.max(0.35f, Mth.cos(pitch))); // vers la droite = yaw croissant

				float cp = Mth.cos(pitch);
				float dx = -Mth.sin(yaw) * cp, dy = Mth.sin(pitch), dz = Mth.cos(yaw) * cp;

				PoseStack pose = new PoseStack();
				pose.translate(dx * D, dy * D, dz * D);
				// Fait face au joueur (même orientation qu'une caméra qui regarderait ce point)
				pose.mulPose(new Quaternionf().rotationYXZ((float) Math.PI - yaw, pitch, 0f));
				pose.mulPose(new Quaternionf().rotationZ(-roll));
				float s = (0.55f + 0.45f * easeBack(p)) * k;
				pose.scale(s, -s, s);

				Component comp = LyricStyle.text(txt, fontId);
				float tw = font.width(comp);
				float fx = -w.width / 2f, fy = -FONT_H / 2f;
				if (cfg.animation != Config.Animation.LETTER) fx = -tw / 2f;
				int a = Mth.clamp((int) (alpha * 255), 0, 255);

				// Lueur : copies décalées, translucides, derrière le texte
				Matrix4f m = pose.last().pose();
				int glow = (style.glow() & 0x00FFFFFF) | (Mth.clamp((int) (a * 0.33f), 0, 255) << 24);
				float o = 0.7f;
				pose.pushPose();
				pose.translate(0, 0, -0.02f);
				Matrix4f gm = pose.last().pose();
				font.drawInBatch(comp, fx + o, fy, glow, false, gm, consumers, mode, 0, LightTexture.FULL_BRIGHT);
				font.drawInBatch(comp, fx - o, fy, glow, false, gm, consumers, mode, 0, LightTexture.FULL_BRIGHT);
				font.drawInBatch(comp, fx, fy + o, glow, false, gm, consumers, mode, 0, LightTexture.FULL_BRIGHT);
				font.drawInBatch(comp, fx, fy - o, glow, false, gm, consumers, mode, 0, LightTexture.FULL_BRIGHT);
				pose.popPose();
				int color = (style.color() & 0x00FFFFFF) | (a << 24);
				font.drawInBatch(comp, fx, fy, color, false, m, consumers, mode, 0, LightTexture.FULL_BRIGHT);
			}
			return true;
		}
	}
}
