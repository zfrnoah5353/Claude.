package com.skylyrics.gui;

import com.skylyrics.Config;
import com.skylyrics.SkyLyrics;
import com.skylyrics.lyrics.LyricsEngine;
import com.skylyrics.media.MediaState;
import com.skylyrics.render.AlbumArt;
import com.skylyrics.render.LyricStyle;
import com.skylyrics.render.SkyTextRenderer;
import com.skylyrics.sky.CustomSky;
import com.skylyrics.sky.SkyPreset;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

import java.util.ArrayList;
import java.util.List;

/** Menu du mod (touche K) : Aperçu, Paroles, Styles, Ciels. */
public final class SkyLyricsScreen extends Screen {
	private enum Tab {
		OVERVIEW("Aperçu"), LYRICS("Paroles"), STYLES("Styles"), SKIES("Ciels");
		final String label;

		Tab(String label) {
			this.label = label;
		}
	}

	// Couleurs
	private static final int PANEL = 0xE6140F24, SIDE = 0x14FFFFFF, LINE = 0x29C4B0FF, ROW = 0x0AFFFFFF;
	private static final int INK = 0xFFF3EFFF, DIM = 0xFFB9B0D6, FAINT = 0xFF7D7499, ACCENT_INK = 0xFF1B1233;

	private record Hit(int x1, int y1, int x2, int y2, Runnable action) {
		boolean contains(double x, double y) {
			return x >= x1 && x < x2 && y >= y1 && y < y2;
		}
	}

	private static Tab tab = Tab.LYRICS;
	private final List<Hit> hits = new ArrayList<>();
	private float scroll = 0, scrollTarget = 0;
	private int contentHeight = 0;
	private int px, py, pw, ph, cx, cy, cw, ch;

	public SkyLyricsScreen() {
		super(Component.literal("SkyLyrics"));
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float delta) {
		g.fill(0, 0, width, height, 0x50080510);
	}

	private int accent() {
		return LyricStyle.current().accent();
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float delta) {
		hits.clear();
		pw = Math.min(440, width - 16);
		ph = Math.min(280, height - 40);
		px = (width - pw) / 2;
		py = Math.max(24, (height - ph) / 2);
		int side = Math.min(96, pw / 4);

		panel(g, px, py, px + pw, py + ph, PANEL);
		g.fill(px, py, px + side, py + ph, SIDE);
		g.fill(px + side, py, px + side + 1, py + ph, LINE);

		// Logo
		g.fill(px + 8, py + 9, px + 22, py + 23, accent());
		g.drawString(font, "S", px + 13, py + 12, ACCENT_INK, false);
		g.drawString(font, "SkyLyrics", px + 27, py + 9, INK, false);
		g.drawString(font, small("Fabric 1.21.11"), px + 27, py + 19, FAINT, false);

		int ty = py + 34;
		for (Tab t : Tab.values()) {
			boolean sel = t == tab;
			boolean hover = in(mouseX, mouseY, px + 5, ty, px + side - 5, ty + 16);
			if (sel) g.fill(px + 5, ty, px + side - 5, ty + 16, accent());
			else if (hover) g.fill(px + 5, ty, px + side - 5, ty + 16, 0x12FFFFFF);
			g.drawString(font, t.label, px + 11, ty + 4, sel ? ACCENT_INK : DIM, false);
			final Tab target = t;
			hits.add(new Hit(px + 5, ty, px + side - 5, ty + 16, () -> {
				tab = target;
				scroll = scrollTarget = 0;
			}));
			ty += 19;
		}
		g.drawString(font, small("Touche K · Échap"), px + 8, py + ph - 12, FAINT, false);

		// Contenu (défilant)
		cx = px + side + 12;
		cy = py + 10;
		cw = pw - side - 24;
		ch = ph - 20;
		scroll += (scrollTarget - scroll) * 0.35f;
		g.enableScissor(cx - 2, cy, cx + cw + 2, cy + ch);
		int start = cy - Math.round(scroll);
		int end = switch (tab) {
			case OVERVIEW -> overview(g, start, mouseX, mouseY);
			case LYRICS -> lyrics(g, start, mouseX, mouseY);
			case STYLES -> styles(g, start, mouseX, mouseY);
			case SKIES -> skies(g, start, mouseX, mouseY);
		};
		g.disableScissor();
		contentHeight = end - start;
		float max = Math.max(0, contentHeight - ch + 6);
		scrollTarget = Mth.clamp(scrollTarget, 0, max);
		if (max > 0) {
			int barH = Math.max(16, (int) (ch * ch / (float) contentHeight));
			int barY = cy + (int) ((ch - barH) * (scroll / max));
			g.fill(px + pw - 5, barY, px + pw - 3, barY + barH, 0x40FFFFFF);
		}
		super.render(g, mouseX, mouseY, delta);
	}

	// ---------------- Onglets ----------------

	private int heading(GuiGraphics g, int y, String title, String lead) {
		g.drawString(font, Component.literal(title).withStyle(LyricStyle.fontStyle("poppins")), cx, y, INK, false);
		g.drawString(font, small(lead), cx, y + 13, FAINT, false);
		return y + 28;
	}

	private int overview(GuiGraphics g, int y, int mx, int my) {
		y = heading(g, y, "Aperçu", "Ce que le mod lit en ce moment.");
		LyricsEngine e = LyricsEngine.get();
		MediaState m = e.media();
		int h = 52;
		g.fill(cx, y, cx + cw, y + h, ROW);
		outline(g, cx, y, cx + cw, y + h, LINE);
		Identifier art = AlbumArt.get(m.art());
		if (art != null) g.blit(RenderPipelines.GUI_TEXTURED, art, cx + 6, y + 6, 0f, 0f, 40, 40, 40, 40, 40, 40);
		else {
			g.fill(cx + 6, y + 6, cx + 46, y + 46, accent());
			g.fill(cx + 20, y + 20, cx + 32, y + 32, PANEL | 0xFF000000);
		}
		int tx = cx + 54, tw = cw - 60;
		if (m.active()) {
			g.drawString(font, font.plainSubstrByWidth(m.title(), tw), tx, y + 7, INK, false);
			g.drawString(font, small(font.plainSubstrByWidth(m.artist(), (int) (tw / 0.8f))), tx, y + 18, DIM, false);
			String status = switch (e.status()) {
				case SYNCED -> "Paroles synchronisées";
				case UNSYNCED -> "Paroles non synchronisées";
				case SEARCHING -> "Recherche des paroles…";
				case NOT_FOUND -> "Pas de paroles trouvées";
				case INSTRUMENTAL -> "Instrumental";
				case DEMO -> "Démo";
				default -> "";
			};
			g.drawString(font, small(status), tx, y + 28, e.status() == LyricsEngine.Status.NOT_FOUND ? 0xFFFF8A8A : 0xFF7EE2A8, false);
			long pos = Math.max(0, e.positionMs() - Config.get().offsetMs), dur = Math.max(1, m.durationMs());
			g.fill(tx, y + 40, tx + tw, y + 42, 0x1AFFFFFF);
			g.fill(tx, y + 40, tx + (int) (tw * Math.min(1, pos / (double) dur)), y + 42, accent());
			String times = mmss(pos) + " / " + mmss(dur);
			g.drawString(font, small(times), tx + tw - (int) (font.width(times) * 0.8f), y + 30, FAINT, false);
		} else {
			g.drawString(font, "Aucune musique détectée", tx, y + 9, INK, false);
			g.drawString(font, small("Lance un son dans Spotify, il apparaîtra ici."), tx, y + 22, DIM, false);
			g.drawString(font, small("Source : " + e.sourceName()), tx, y + 33, FAINT, false);
		}
		y += h + 8;
		y = toggleRow(g, y, mx, my, "Essayer dans le ciel", "Joue une démo pour voir le rendu sans Spotify.", Config.get().demo, () -> {
			Config.get().demo = !Config.get().demo;
			LyricsEngine.get().restartDemo();
			SkyTextRenderer.reset();
		});
		y += 6;
		g.drawString(font, small("Les paroles viennent de lrclib.net (gratuit, sans compte)."), cx, y, FAINT, false);
		g.drawString(font, small("Source : " + e.sourceName()), cx, y + 10, FAINT, false);
		return y + 24;
	}

	private int lyrics(GuiGraphics g, int y, int mx, int my) {
		Config c = Config.get();
		y = heading(g, y, "Paroles", "Les paroles de Spotify en 3D dans le ciel.");
		y = label(g, y, "GÉNÉRAL");
		y = toggleRow(g, y, mx, my, "Paroles activées", "Lit le son en cours dans Spotify.", c.lyricsEnabled, () -> c.lyricsEnabled = !c.lyricsEnabled);
		y = segRow(g, y, mx, my, "Affichage",
				c.display == Config.Display.SKY ? "Dans le ciel. Les blocs devant les cachent." : "Flotte devant toi où que tu regardes.",
				new String[]{"Ciel", "Flottant"}, c.display.ordinal(), i -> c.display = Config.Display.values()[i]);
		y = segRow(g, y, mx, my, "Animation", "Comment les paroles arrivent.",
				new String[]{"Mot", "Lettre", "Ligne"}, c.animation.ordinal(), i -> c.animation = Config.Animation.values()[i]);
		y = toggleRow(g, y, mx, my, "Barre du haut", "Ligne en cours, mot chanté surligné.", c.topBar, () -> c.topBar = !c.topBar);
		y = toggleRow(g, y, mx, my, "Essayer dans le ciel", "Démo sans Spotify.", c.demo, () -> {
			c.demo = !c.demo;
			LyricsEngine.get().restartDemo();
		});
		y = label(g, y + 4, "RÉGLAGES FINS");
		y = stepRow(g, y, mx, my, "Taille du texte", String.format("×%.2f", c.textScale), () -> c.textScale = Math.max(0.5f, round(c.textScale - 0.1f)), () -> c.textScale = Math.min(2.5f, round(c.textScale + 0.1f)));
		y = stepRow(g, y, mx, my, "Distance", (int) c.distance + " blocs", () -> c.distance = Math.max(12, c.distance - 4), () -> c.distance = Math.min(96, c.distance + 4));
		y = stepRow(g, y, mx, my, "Décalage synchro", (c.offsetMs > 0 ? "+" : "") + c.offsetMs + " ms", () -> c.offsetMs -= 100, () -> c.offsetMs += 100);
		g.drawString(font, small("Paroles en retard ? Mets un décalage positif."), cx, y + 2, FAINT, false);
		return y + 16;
	}

	private int styles(GuiGraphics g, int y, int mx, int my) {
		Config c = Config.get();
		y = heading(g, y, "Styles", "Couleur, lueur et police des paroles.");
		y = label(g, y, "LOOK");
		int cols = Math.max(2, cw / 70), gap = 4, cwid = (cw - gap * (cols - 1)) / cols, chh = 34;
		int i = 0;
		for (LyricStyle s : LyricStyle.STYLES.values()) {
			int x = cx + (i % cols) * (cwid + gap), yy = y + (i / cols) * (chh + gap);
			boolean sel = s.id().equals(c.style);
			card(g, x, yy, x + cwid, yy + chh, sel, in(mx, my, x, yy, x + cwid, yy + chh));
			Component aa = LyricStyle.text("Aa", s.font());
			int aw = font.width(aa);
			int ax = x + (cwid - aw) / 2, ay = yy + 6;
			int glow = (s.glow() & 0xFFFFFF) | 0x70000000;
			g.drawString(font, aa, ax + 1, ay, glow, false);
			g.drawString(font, aa, ax - 1, ay, glow, false);
			g.drawString(font, aa, ax, ay + 1, glow, false);
			g.drawString(font, aa, ax, ay - 1, glow, false);
			g.drawString(font, aa, ax, ay, s.color(), false);
			centered(g, small(s.name()), x + cwid / 2, yy + 22, sel ? INK : DIM);
			hits.add(new Hit(x, yy, x + cwid, yy + chh, () -> {
				c.style = s.id();
				SkyTextRenderer.reset();
			}));
			i++;
		}
		y += ((i + cols - 1) / cols) * (chh + gap) + 4;
		y = label(g, y, "POLICE");
		int fh = 22;
		List<LyricStyle.FontEntry> fonts = new ArrayList<>();
		fonts.add(new LyricStyle.FontEntry("", "Auto (style)"));
		fonts.addAll(LyricStyle.FONTS);
		i = 0;
		for (LyricStyle.FontEntry f : fonts) {
			int x = cx + (i % cols) * (cwid + gap), yy = y + (i / cols) * (fh + gap);
			boolean sel = f.id().equals(c.font);
			card(g, x, yy, x + cwid, yy + fh, sel, in(mx, my, x, yy, x + cwid, yy + fh));
			String fid = f.id().isEmpty() ? LyricStyle.current().font() : f.id();
			Component name = LyricStyle.text(f.name(), fid);
			int nw = Math.min(font.width(name), cwid - 4);
			g.drawString(font, name, x + (cwid - nw) / 2, yy + 7, sel ? INK : DIM, false);
			hits.add(new Hit(x, yy, x + cwid, yy + fh, () -> {
				c.font = f.id();
				SkyTextRenderer.reset();
			}));
			i++;
		}
		y += ((i + cols - 1) / cols) * (fh + gap);
		return y + 4;
	}

	private int skies(GuiGraphics g, int y, int mx, int my) {
		Config c = Config.get();
		y = heading(g, y, "Ciels", "Remplace le ciel. Le brouillard s'accorde à l'horizon.");
		y = toggleRow(g, y, mx, my, "Ciel personnalisé", "Désactivé : ciel normal du jeu.", c.skyEnabled, () -> c.skyEnabled = !c.skyEnabled);
		y = toggleRow(g, y, mx, my, "Rotation lente", "Le ciel tourne doucement avec le temps.", c.skyRotation, () -> c.skyRotation = !c.skyRotation);
		y += 4;
		int cols = Math.max(2, cw / 96), gap = 5, cwid = (cw - gap * (cols - 1)) / cols, imgH = cwid / 2, chh = imgH + 13;
		int i = 0;
		for (SkyPreset p : SkyPreset.ALL.values()) {
			int x = cx + (i % cols) * (cwid + gap), yy = y + (i / cols) * (chh + gap);
			boolean sel = c.skyEnabled && p.id.equals(c.sky);
			card(g, x, yy, x + cwid, yy + chh, sel, in(mx, my, x, yy, x + cwid, yy + chh));
			Identifier thumb = CustomSky.thumbnail(p.id);
			g.blit(RenderPipelines.GUI_TEXTURED, thumb, x + 1, yy + 1, 0f, 0f, cwid - 2, imgH, cwid - 2, imgH, cwid - 2, imgH);
			g.drawString(font, small(p.name), x + 4, yy + imgH + 3, sel ? INK : DIM, false);
			hits.add(new Hit(x, yy, x + cwid, yy + chh, () -> {
				c.sky = p.id;
				c.skyEnabled = true;
				CustomSky.texture(p.id);
			}));
			i++;
		}
		y += ((i + cols - 1) / cols) * (chh + gap);
		return y + 4;
	}

	// ---------------- Composants ----------------

	private int label(GuiGraphics g, int y, String s) {
		g.drawString(font, small(s), cx, y + 2, FAINT, false);
		return y + 12;
	}

	private int row(GuiGraphics g, int y, String title, String desc) {
		int h = 26;
		g.fill(cx, y, cx + cw, y + h, ROW);
		outline(g, cx, y, cx + cw, y + h, LINE);
		g.drawString(font, title, cx + 7, y + 5, INK, false);
		if (desc != null) g.drawString(font, small(font.plainSubstrByWidth(desc, (int) ((cw - 90) / 0.8f))), cx + 7, y + 16, FAINT, false);
		return h;
	}

	private int toggleRow(GuiGraphics g, int y, int mx, int my, String title, String desc, boolean on, Runnable toggle) {
		int h = row(g, y, title, desc);
		int sx = cx + cw - 30, sy = y + 8;
		g.fill(sx, sy, sx + 22, sy + 11, on ? accent() : 0x30FFFFFF);
		int kx = on ? sx + 12 : sx + 1;
		g.fill(kx, sy + 1, kx + 9, sy + 10, 0xFFFFFFFF);
		hits.add(new Hit(cx, y, cx + cw, y + h, () -> {
			toggle.run();
			Config.save();
		}));
		return y + h + 3;
	}

	private int segRow(GuiGraphics g, int y, int mx, int my, String title, String desc, String[] opts, int selected, java.util.function.IntConsumer set) {
		int h = row(g, y, title, desc);
		int total = 4;
		for (String o : opts) total += (int) (font.width(o) * 0.8f) + 10;
		int x = cx + cw - 6 - total, sy = y + 6;
		g.fill(x, sy, x + total, sy + 14, 0x14FFFFFF);
		x += 2;
		for (int i = 0; i < opts.length; i++) {
			int w = (int) (font.width(opts[i]) * 0.8f) + 10;
			boolean sel = i == selected;
			if (sel) g.fill(x, sy + 2, x + w, sy + 12, accent());
			else if (in(mx, my, x, sy, x + w, sy + 14)) g.fill(x, sy + 2, x + w, sy + 12, 0x12FFFFFF);
			g.pose().pushMatrix();
			g.pose().translate(x + 5, sy + 4);
			g.pose().scale(0.8f, 0.8f);
			g.drawString(font, opts[i], 0, 0, sel ? ACCENT_INK : DIM, false);
			g.pose().popMatrix();
			final int idx = i;
			hits.add(new Hit(x, sy, x + w, sy + 14, () -> {
				set.accept(idx);
				Config.save();
				SkyTextRenderer.reset();
			}));
			x += w;
		}
		return y + h + 3;
	}

	private int stepRow(GuiGraphics g, int y, int mx, int my, String title, String value, Runnable minus, Runnable plus) {
		int h = row(g, y, title, null);
		int bx = cx + cw - 96, by = y + 6;
		button(g, bx, by, bx + 16, by + 14, "−", in(mx, my, bx, by, bx + 16, by + 14));
		centered(g, Component.literal(value), bx + 48, by + 3, INK);
		button(g, bx + 80, by, bx + 96, by + 14, "+", in(mx, my, bx + 80, by, bx + 96, by + 14));
		hits.add(new Hit(bx, by, bx + 16, by + 14, () -> {
			minus.run();
			Config.save();
		}));
		hits.add(new Hit(bx + 80, by, bx + 96, by + 14, () -> {
			plus.run();
			Config.save();
		}));
		return y + h + 3;
	}

	private void button(GuiGraphics g, int x1, int y1, int x2, int y2, String s, boolean hover) {
		g.fill(x1, y1, x2, y2, hover ? accent() : 0x1EFFFFFF);
		centered(g, Component.literal(s), (x1 + x2) / 2, y1 + 3, hover ? ACCENT_INK : INK);
	}

	private void card(GuiGraphics g, int x1, int y1, int x2, int y2, boolean sel, boolean hover) {
		g.fill(x1, y1, x2, y2, sel ? (accent() & 0xFFFFFF) | 0x26000000 : ROW);
		outline(g, x1, y1, x2, y2, sel ? accent() : hover ? 0x80C4B0FF : LINE);
	}

	private void panel(GuiGraphics g, int x1, int y1, int x2, int y2, int color) {
		g.fill(x1 + 2, y1, x2 - 2, y2, color);
		g.fill(x1, y1 + 2, x1 + 2, y2 - 2, color);
		g.fill(x2 - 2, y1 + 2, x2, y2 - 2, color);
		g.fill(x1 + 1, y1 + 1, x1 + 2, y1 + 2, color);
		g.fill(x2 - 2, y1 + 1, x2 - 1, y1 + 2, color);
		g.fill(x1 + 1, y2 - 2, x1 + 2, y2 - 1, color);
		g.fill(x2 - 2, y2 - 2, x2 - 1, y2 - 1, color);
		outline(g, x1, y1, x2, y2, LINE);
	}

	private static void outline(GuiGraphics g, int x1, int y1, int x2, int y2, int color) {
		g.fill(x1 + 1, y1, x2 - 1, y1 + 1, color);
		g.fill(x1 + 1, y2 - 1, x2 - 1, y2, color);
		g.fill(x1, y1 + 1, x1 + 1, y2 - 1, color);
		g.fill(x2 - 1, y1 + 1, x2, y2 - 1, color);
	}

	private void centered(GuiGraphics g, Component c, int x, int y, int color) {
		g.drawString(font, c, x - font.width(c) / 2, y, color, false);
	}

	/** Petit texte (80 %) : rendu via une échelle locale. */
	private Component small(String s) {
		return Component.literal(s).withStyle(LyricStyle.fontStyle("minecraft"));
	}

	private static boolean in(double mx, double my, int x1, int y1, int x2, int y2) {
		return mx >= x1 && mx < x2 && my >= y1 && my < y2;
	}

	private static float round(float v) {
		return Math.round(v * 100) / 100f;
	}

	private static String mmss(long ms) {
		long s = ms / 1000;
		return (s / 60) + ":" + String.format("%02d", s % 60);
	}

	// ---------------- Entrées ----------------

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (event.button() == 0) {
			for (Hit h : hits) {
				boolean isSidebar = h.x2 <= cx - 2;
				boolean inViewport = in(event.x(), event.y(), cx - 2, cy, cx + cw + 2, cy + ch);
				if (h.contains(event.x(), event.y()) && (isSidebar || inViewport)) {
					h.action.run();
					return true;
				}
			}
		}
		return super.mouseClicked(event, doubleClick);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		scrollTarget -= (float) scrollY * 24;
		return true;
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (SkyLyrics.MENU_KEY.matches(event)) {
			onClose();
			return true;
		}
		return super.keyPressed(event);
	}

	@Override
	public void onClose() {
		Config.save();
		super.onClose();
	}
}
