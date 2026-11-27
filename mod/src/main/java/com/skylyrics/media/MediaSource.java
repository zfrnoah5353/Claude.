package com.skylyrics.media;

import com.skylyrics.SkyLyrics;

import java.util.Locale;
import java.util.function.Consumer;

/** Lit le morceau Spotify en cours (Windows, macOS ou Linux) et pousse des {@link MediaState}. */
public interface MediaSource extends AutoCloseable {
	void start(Consumer<MediaState> sink);

	/** Nom lisible de la source, pour l'écran d'infos. */
	String name();

	@Override
	void close();

	static MediaSource create() {
		String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
		if (os.contains("win")) return new WindowsMediaSource();
		if (os.contains("mac")) return new MacMediaSource();
		SkyLyrics.LOGGER.info("SkyLyrics: Linux détecté, lecture via playerctl");
		return new LinuxMediaSource();
	}
}
