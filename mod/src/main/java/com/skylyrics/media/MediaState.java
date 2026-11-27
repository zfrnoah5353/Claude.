package com.skylyrics.media;

/** Un instantané de ce que joue Spotify. */
public record MediaState(
		boolean active,
		String title,
		String artist,
		String album,
		long durationMs,
		long positionMs,
		boolean playing,
		/** Chemin local ou URL http(s) de la pochette ("" si aucune). */
		String art
) {
	public static final MediaState NONE = new MediaState(false, "", "", "", 0, 0, false, "");

	public String key() {
		return artist + "\u0000" + title;
	}
}
