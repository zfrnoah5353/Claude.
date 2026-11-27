package com.skylyrics.render;

import com.skylyrics.Config;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Styles prédéfinis (police + couleurs) et polices disponibles. */
public record LyricStyle(String id, String name, String font, int color, int glow, int accent) {

	public record FontEntry(String id, String name) {
	}

	public static final List<FontEntry> FONTS = List.of(
			new FontEntry("poppins", "Poppins"),
			new FontEntry("poppins_italic", "Poppins Italic"),
			new FontEntry("serif", "Serif"),
			new FontEntry("abril", "Abril"),
			new FontEntry("script", "Script"),
			new FontEntry("dreamy", "Dreamy"),
			new FontEntry("brush", "Brush"),
			new FontEntry("bangers", "Bangers"),
			new FontEntry("luckiest", "Luckiest"),
			new FontEntry("lilita", "Lilita"),
			new FontEntry("comic", "Comic"),
			new FontEntry("royal", "Royal"),
			new FontEntry("ice", "Rounded"),
			new FontEntry("minecraft", "Minecraft")
	);

	public static final Map<String, LyricStyle> STYLES = new LinkedHashMap<>();

	private static void add(LyricStyle s) {
		STYLES.put(s.id, s);
	}

	static {
		add(new LyricStyle("lavender", "Lavender", "poppins", 0xFFFFFFFF, 0xFFB89CFF, 0xFFC9B5FF));
		add(new LyricStyle("dreamy", "Dreamy", "dreamy", 0xFFFFF4FB, 0xFFFF9ED8, 0xFFFFB3E1));
		add(new LyricStyle("script", "Script", "script", 0xFFFFFFFF, 0xFFE58CFF, 0xFFF3C4FF));
		add(new LyricStyle("comic", "Comic", "comic", 0xFFFFE45C, 0xFFFF8A00, 0xFFFFE45C));
		add(new LyricStyle("ice", "Ice", "ice", 0xFFDFF6FF, 0xFF4FC3F7, 0xFF9BE3FF));
		add(new LyricStyle("royal", "Royal", "royal", 0xFFFFD86B, 0xFF8C5A00, 0xFFFFD86B));
		add(new LyricStyle("neon", "Neon", "lilita", 0xFFB6FFE4, 0xFF00E58F, 0xFF6BFFC4));
		add(new LyricStyle("sunset", "Sunset", "abril", 0xFFFFE1C7, 0xFFFF5E62, 0xFFFFB38A));
		add(new LyricStyle("bold", "Bold", "luckiest", 0xFFFFFFFF, 0xFF1A1A2E, 0xFFFFFFFF));
		add(new LyricStyle("brush", "Brush", "brush", 0xFFFFFFFF, 0xFF7C6CF0, 0xFFB9B0FF));
		add(new LyricStyle("cherry", "Cherry", "bangers", 0xFFFFD1DC, 0xFFE0115F, 0xFFFF7FA8));
		add(new LyricStyle("classic", "Classic", "minecraft", 0xFFFFFFFF, 0xFF404040, 0xFFFFFFFF));
	}

	public static LyricStyle current() {
		LyricStyle s = STYLES.get(Config.get().style);
		return s != null ? s : STYLES.get("lavender");
	}

	/** Police effective (celle forcée dans les réglages, sinon celle du style). */
	public static String currentFont() {
		String f = Config.get().font;
		return f == null || f.isEmpty() ? current().font : f;
	}

	public static Style fontStyle(String fontId) {
		if (fontId == null || fontId.equals("minecraft")) return Style.EMPTY;
		return Style.EMPTY.withFont(new FontDescription.Resource(Identifier.fromNamespaceAndPath("skylyrics", fontId)));
	}

	public static MutableComponent text(String s, String fontId) {
		return Component.literal(s).withStyle(fontStyle(fontId));
	}
}
