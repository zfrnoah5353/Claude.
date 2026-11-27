package com.skylyrics;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Réglages du mod, sauvegardés dans config/skylyrics.json. */
public final class Config {
	public enum Display { SKY, FLOAT }
	public enum Animation { WORD, LETTER, LINE }

	// Paroles
	public boolean lyricsEnabled = true;
	public Display display = Display.SKY;
	public Animation animation = Animation.WORD;
	public boolean topBar = true;
	public String style = "lavender";
	/** Police forcée ("" = police du style). */
	public String font = "";
	public float textScale = 1.0f;
	/** Distance des paroles dans le ciel (blocs). */
	public float distance = 48f;
	/** Décalage de synchro en ms (positif = paroles plus tôt). */
	public int offsetMs = 0;

	// Ciel
	public boolean skyEnabled = true;
	public String sky = "sunset";
	public boolean skyRotation = true;

	/** Mode démo ("Essayer dans le ciel"), pas sauvegardé. */
	public transient boolean demo = false;

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Config instance;

	public static Config get() {
		if (instance == null) load();
		return instance;
	}

	private static Path path() {
		return FabricLoader.getInstance().getConfigDir().resolve("skylyrics.json");
	}

	public static void load() {
		Path p = path();
		if (Files.exists(p)) {
			try (Reader r = Files.newBufferedReader(p, StandardCharsets.UTF_8)) {
				instance = GSON.fromJson(r, Config.class);
			} catch (Exception e) {
				SkyLyrics.LOGGER.warn("Config illisible, valeurs par défaut", e);
			}
		}
		if (instance == null) instance = new Config();
		if (instance.display == null) instance.display = Display.SKY;
		if (instance.animation == null) instance.animation = Animation.WORD;
		if (instance.style == null) instance.style = "lavender";
		if (instance.font == null) instance.font = "";
		if (instance.sky == null) instance.sky = "sunset";
	}

	public static void save() {
		try {
			Files.createDirectories(path().getParent());
			try (Writer w = Files.newBufferedWriter(path(), StandardCharsets.UTF_8)) {
				GSON.toJson(get(), w);
			}
		} catch (Exception e) {
			SkyLyrics.LOGGER.warn("Impossible de sauvegarder la config", e);
		}
	}
}
