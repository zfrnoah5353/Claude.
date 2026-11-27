package com.skylyrics.media;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.skylyrics.SkyLyrics;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.function.Consumer;

/**
 * Windows : lance un petit script PowerShell (intégré au mod) qui lit les
 * "contrôles multimédias" de Windows. Spotify y publie titre, artiste, position et pochette.
 * Aucun compte ni clé API nécessaire.
 */
final class WindowsMediaSource implements MediaSource {
	private volatile boolean running;
	private volatile Process process;
	private Thread thread;
	volatile String lastError = "";

	@Override
	public String name() {
		return "Windows (contrôles multimédias)";
	}

	@Override
	public void start(Consumer<MediaState> sink) {
		running = true;
		thread = new Thread(() -> loop(sink), "SkyLyrics-Windows-Media");
		thread.setDaemon(true);
		thread.start();
	}

	private void loop(Consumer<MediaState> sink) {
		int failures = 0;
		while (running) {
			try {
				Path dir = Files.createTempDirectory("skylyrics");
				Path script = dir.resolve("media.ps1");
				try (InputStream in = WindowsMediaSource.class.getResourceAsStream("/skylyrics/media_windows.ps1")) {
					Files.copy(in, script, StandardCopyOption.REPLACE_EXISTING);
				}
				ProcessBuilder pb = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
						"-File", script.toString(), "-ArtDir", dir.toString(), "-ParentPid", Long.toString(ProcessHandle.current().pid()));
				pb.redirectErrorStream(false);
				pb.redirectError(ProcessBuilder.Redirect.DISCARD);
				process = pb.start();
				long started = System.currentTimeMillis();
				try (BufferedReader r = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
					String line;
					while (running && (line = r.readLine()) != null) {
						line = line.trim();
						if (line.startsWith("﻿")) line = line.substring(1);
						if (!line.startsWith("{")) continue;
						try {
							sink.accept(parse(JsonParser.parseString(line).getAsJsonObject()));
						} catch (Exception e) {
							SkyLyrics.LOGGER.debug("Ligne média ignorée: {}", line, e);
						}
					}
				}
				if (System.currentTimeMillis() - started > 60_000) failures = 0;
			} catch (Exception e) {
				SkyLyrics.LOGGER.warn("SkyLyrics: lecteur Windows en erreur", e);
				lastError = String.valueOf(e.getMessage());
			}
			if (!running) break;
			sink.accept(MediaState.NONE);
			failures++;
			try {
				Thread.sleep(Math.min(30_000, 2_000L * failures));
			} catch (InterruptedException ignored) {
				return;
			}
		}
	}

	private MediaState parse(JsonObject o) {
		if (!o.has("active") || !o.get("active").getAsBoolean()) {
			if (o.has("error")) {
				lastError = o.get("error").getAsString();
				SkyLyrics.LOGGER.debug("SMTC: {}", lastError);
			}
			return MediaState.NONE;
		}
		return new MediaState(true,
				str(o, "title"), str(o, "artist"), str(o, "album"),
				o.has("dur") ? o.get("dur").getAsLong() : 0,
				o.has("pos") ? o.get("pos").getAsLong() : 0,
				o.has("playing") && o.get("playing").getAsBoolean(),
				str(o, "art"));
	}

	private static String str(JsonObject o, String k) {
		return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsString() : "";
	}

	@Override
	public void close() {
		running = false;
		Process p = process;
		if (p != null) p.destroyForcibly();
		if (thread != null) thread.interrupt();
	}
}
