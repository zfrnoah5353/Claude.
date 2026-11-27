package com.skylyrics.render;

import com.skylyrics.Clock;
import com.skylyrics.Config;
import com.skylyrics.lyrics.Lyrics;
import com.skylyrics.lyrics.LyricsEngine;
import com.skylyrics.media.MediaState;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

/** Barre en haut de l'écran : pochette, ligne en cours avec le mot chanté surligné, égaliseur. */
public final class TopBarHud {
	private static final float TEXT_SCALE = 0.8f;
	private static float scroll = 0f;

	private TopBarHud() {
	}

	public static void render(GuiGraphics g, DeltaTracker delta) {
		Config cfg = Config.get();
		Minecraft mc = Minecraft.getInstance();
		if (!cfg.topBar || !cfg.lyricsEnabled || mc.options.hideGui) return;
		LyricsEngine engine = LyricsEngine.get();
		MediaState media = engine.media();
		if (!media.active()) return;

		Font font = mc.font;
		LyricStyle style = LyricStyle.current();
		Lyrics lyrics = engine.lyrics();
		long t = engine.positionMs();
		int idx = lyrics == null ? -1 : lyrics.lineAt(t);
		Lyrics.Line line = idx >= 0 ? lyrics.lines.get(idx) : null;
		boolean showLine = line != null && !line.isBlank() && t <= line.endMs() + 1500;

		String fontId = "poppins";
		int maxText = Math.min(260, g.guiWidth() - 80);
		int textW;
		Component meta = null;
		if (showLine) {
			textW = (int) Math.min(maxText, font.width(LyricStyle.text(line.text(), fontId)) * TEXT_SCALE + 6);
		} else {
			String status = switch (engine.status()) {
				case SEARCHING -> "  ·  recherche des paroles…";
				case NOT_FOUND -> "  ·  pas de paroles trouvées";
				case INSTRUMENTAL -> "  ·  instrumental";
				default -> "";
			};
			String s = media.title() + (media.artist().isEmpty() ? "" : " · " + media.artist()) + status;
			meta = LyricStyle.text(s, fontId);
			textW = (int) Math.min(maxText, font.width(meta) * TEXT_SCALE + 2);
		}

		int h = 16, art = 12;
		int w = 2 + art + 6 + textW + 6 + 13;
		int x = (g.guiWidth() - w) / 2, y = 3;

		roundRect(g, x, y, x + w, y + h, 0xB80E0A1A);
		roundRect(g, x, y, x + w, y + 1, 0x14FFFFFF);

		// Pochette (ou disque coloré)
		Identifier artTex = AlbumArt.get(media.art());
		int ax = x + 2, ay = y + 2;
		if (artTex != null) {
			g.blit(RenderPipelines.GUI_TEXTURED, artTex, ax, ay, 0f, 0f, art, art, art, art, art, art);
		} else {
			g.fill(ax, ay, ax + art, ay + art, style.accent());
			g.fill(ax + 4, ay + 4, ax + art - 4, ay + art - 4, 0xFF0E0A1A);
		}

		// Texte
		int tx = ax + art + 6;
		int clipR = tx + textW;
		g.enableScissor(tx - 1, y, clipR + 1, y + h);
		g.pose().pushMatrix();
		float ty = y + (h - 9 * TEXT_SCALE) / 2f + 0.5f;
		if (showLine) {
			// position de chaque mot pour faire défiler si la ligne est trop longue
			float space = font.width(LyricStyle.text(" ", fontId));
			float cursor = 0, curStart = 0, curEnd = 0;
			int sung = line.wordsStarted(t);
			for (int i = 0; i < line.words().size(); i++) {
				float ww = font.width(LyricStyle.text(line.words().get(i).text(), fontId));
				if (i == sung - 1) {
					curStart = cursor;
					curEnd = cursor + ww;
				}
				cursor += ww + space;
			}
			float visible = textW / TEXT_SCALE;
			float target = Math.max(0, Math.min(cursor - space - visible + 4, curEnd - visible * 0.7f));
			scroll += (target - scroll) * 0.2f;
			g.pose().translate(tx + 3, ty);
			g.pose().scale(TEXT_SCALE, TEXT_SCALE);
			g.pose().translate(-scroll, 0);
			float cx = 0;
			for (int i = 0; i < line.words().size(); i++) {
				Lyrics.Word word = line.words().get(i);
				Component c = LyricStyle.text(word.text(), fontId);
				int ww = font.width(c);
				int color;
				if (i == sung - 1) {
					g.fill((int) cx - 2, -2, (int) cx + ww + 2, 11, style.accent());
					color = 0xFF1B1233;
				} else if (i < sung - 1) {
					color = 0xFFFFFFFF;
				} else {
					color = 0x73FFFFFF;
				}
				g.drawString(font, c, (int) cx, 0, color, false);
				cx += ww + space;
			}
		} else {
			scroll = 0;
			g.pose().translate(tx + 1, ty);
			g.pose().scale(TEXT_SCALE, TEXT_SCALE);
			g.drawString(font, meta, 0, 0, 0xFFCFC6EC, false);
		}
		g.pose().popMatrix();
		g.disableScissor();

		// Égaliseur
		int ex = clipR + 5, eBase = y + h - 4;
		double time = Clock.nanos() / 1e9;
		for (int i = 0; i < 4; i++) {
			float v = engine.isPlaying() ? (float) (0.5 + 0.5 * Math.sin(time * 7 + i * 1.7)) : 0.2f;
			int bh = 2 + Mth.floor(v * 6);
			g.fill(ex + i * 2, eBase - bh, ex + i * 2 + 1, eBase, style.accent());
		}
	}

	/** Rectangle aux coins arrondis (rayon ~3 px). */
	static void roundRect(GuiGraphics g, int x1, int y1, int x2, int y2, int color) {
		int h = y2 - y1;
		if (h <= 4) {
			g.fill(x1 + 1, y1, x2 - 1, y2, color);
			return;
		}
		g.fill(x1 + 3, y1, x2 - 3, y1 + 1, color);
		g.fill(x1 + 1, y1 + 1, x2 - 1, y1 + 3, color);
		g.fill(x1, y1 + 3, x2, y2 - 3, color);
		g.fill(x1 + 1, y2 - 3, x2 - 1, y2 - 1, color);
		g.fill(x1 + 3, y2 - 1, x2 - 3, y2, color);
	}
}
