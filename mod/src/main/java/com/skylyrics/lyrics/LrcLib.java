package com.skylyrics.lyrics;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.skylyrics.SkyLyrics;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

/** Récupère les paroles synchronisées sur lrclib.net (gratuit, sans clé). */
public final class LrcLib {
	private static final HttpClient HTTP = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(8))
			.followRedirects(HttpClient.Redirect.NORMAL)
			.build();
	private static final String UA = "SkyLyrics/1.0 (Minecraft mod; https://lrclib.net)";

	private LrcLib() {
	}

	public static Optional<Lyrics> fetch(String title, String artist, String album, long durationMs) {
		try {
			// 1) Correspondance exacte
			StringBuilder q = new StringBuilder("https://lrclib.net/api/get?track_name=").append(enc(title))
					.append("&artist_name=").append(enc(artist));
			if (album != null && !album.isBlank()) q.append("&album_name=").append(enc(album));
			if (durationMs > 0) q.append("&duration=").append(Math.round(durationMs / 1000.0));
			JsonElement exact = get(q.toString());
			if (exact != null && exact.isJsonObject()) {
				Optional<Lyrics> l = toLyrics(exact.getAsJsonObject(), durationMs);
				if (l.isPresent() && l.get().synced) return l;
			}

			// 2) Recherche (titre nettoyé, premier artiste)
			String cleanTitle = clean(title);
			String firstArtist = artist.split(",| & | feat\\.? | ft\\.? | x ")[0].trim();
			JsonElement found = get("https://lrclib.net/api/search?track_name=" + enc(cleanTitle) + "&artist_name=" + enc(firstArtist));
			Optional<Lyrics> best = pickBest(found, durationMs);
			if (best.isPresent()) return best;

			found = get("https://lrclib.net/api/search?q=" + enc(cleanTitle + " " + firstArtist));
			best = pickBest(found, durationMs);
			if (best.isPresent()) return best;

			// 3) Paroles non synchronisées en dernier recours
			if (exact != null && exact.isJsonObject()) return toLyrics(exact.getAsJsonObject(), durationMs);
		} catch (Exception e) {
			SkyLyrics.LOGGER.warn("SkyLyrics: erreur lrclib pour {} - {}: {}", artist, title, e.toString());
		}
		return Optional.empty();
	}

	private static Optional<Lyrics> pickBest(JsonElement found, long durationMs) {
		if (found == null || !found.isJsonArray()) return Optional.empty();
		JsonArray arr = found.getAsJsonArray();
		JsonObject best = null;
		double bestDiff = Double.MAX_VALUE;
		for (JsonElement e : arr) {
			JsonObject o = e.getAsJsonObject();
			if (!has(o, "syncedLyrics")) continue;
			double d = durationMs > 0 && o.has("duration") && !o.get("duration").isJsonNull()
					? Math.abs(o.get("duration").getAsDouble() * 1000 - durationMs) : 0;
			if (d < bestDiff) {
				bestDiff = d;
				best = o;
			}
		}
		if (best == null || bestDiff > 8000) return Optional.empty();
		return toLyrics(best, durationMs);
	}

	private static Optional<Lyrics> toLyrics(JsonObject o, long durationMs) {
		if (o.has("instrumental") && !o.get("instrumental").isJsonNull() && o.get("instrumental").getAsBoolean())
			return Optional.of(new Lyrics(java.util.List.of(), true));
		if (has(o, "syncedLyrics")) {
			Lyrics l = Lyrics.parseLrc(o.get("syncedLyrics").getAsString(), durationMs);
			if (!l.lines.isEmpty()) return Optional.of(l);
		}
		if (has(o, "plainLyrics")) return Optional.of(Lyrics.fromPlain(o.get("plainLyrics").getAsString(), durationMs));
		return Optional.empty();
	}

	private static boolean has(JsonObject o, String k) {
		return o.has(k) && !o.get(k).isJsonNull() && !o.get(k).getAsString().isBlank();
	}

	static String clean(String title) {
		String t = title;
		t = t.replaceAll("(?i)\\s*[-–]\\s*(remaster(ed)?|live|radio edit|single version|mono|stereo|bonus track|from .*|\\d{4} remaster).*$", "");
		t = t.replaceAll("(?i)\\s*[(\\[](feat\\.?|ft\\.?|with|remaster|live|radio edit|from)[^)\\]]*[)\\]]", "");
		return t.trim().isEmpty() ? title : t.trim();
	}

	private static String enc(String s) {
		return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
	}

	private static JsonElement get(String url) throws Exception {
		HttpRequest req = HttpRequest.newBuilder(URI.create(url))
				.timeout(Duration.ofSeconds(12))
				.header("User-Agent", UA)
				.header("Accept", "application/json")
				.GET().build();
		HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
		if (res.statusCode() == 404) return null;
		if (res.statusCode() / 100 != 2) {
			SkyLyrics.LOGGER.debug("lrclib {} -> HTTP {}", url, res.statusCode());
			return null;
		}
		return JsonParser.parseString(res.body());
	}

	static String lower(String s) {
		return s.toLowerCase(Locale.ROOT);
	}
}
