package com.skylyrics.lyrics;

import com.skylyrics.Config;
import com.skylyrics.SkyLyrics;
import com.skylyrics.media.MediaSource;
import com.skylyrics.media.MediaState;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Relie Spotify et les paroles : sait quel morceau joue, à quelle position, et quelle ligne afficher. */
public final class LyricsEngine {
	public enum Status { NO_PLAYER, SEARCHING, SYNCED, UNSYNCED, NOT_FOUND, INSTRUMENTAL, DEMO }

	private static final LyricsEngine INSTANCE = new LyricsEngine();

	public static LyricsEngine get() {
		return INSTANCE;
	}

	private final ExecutorService pool = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "SkyLyrics-Lyrics");
		t.setDaemon(true);
		return t;
	});
	private final Map<String, Optional<Lyrics>> cache = new ConcurrentHashMap<>();

	private MediaSource source;
	private volatile MediaState media = MediaState.NONE;
	private volatile Lyrics lyrics;
	private volatile Status status = Status.NO_PLAYER;
	private String loadingKey = "";

	// Horloge locale lissée : position (ms) au moment anchorNanos
	private volatile long anchorPos;
	private volatile long anchorNanos = System.nanoTime();
	private volatile boolean playing;
	private volatile String trackKey = "";

	// Démo
	private long demoStart = System.nanoTime();
	private static final Lyrics DEMO = buildDemo();

	public void start() {
		if (source != null) return;
		source = MediaSource.create();
		source.start(this::onMedia);
		SkyLyrics.LOGGER.info("SkyLyrics: source média = {}", source.name());
	}

	public void stop() {
		if (source != null) source.close();
		source = null;
	}

	public String sourceName() {
		return source == null ? "-" : source.name();
	}

	private void onMedia(MediaState s) {
		long now = System.nanoTime();
		if (!s.active()) {
			media = s;
			playing = false;
			return;
		}
		String key = s.key();
		if (!key.equals(trackKey)) {
			trackKey = key;
			anchorPos = s.positionMs();
			anchorNanos = now;
			playing = s.playing();
			media = s;
			requestLyrics(s);
			return;
		}
		long estimate = rawPosition(now);
		boolean playChanged = s.playing() != playing;
		// Re-synchronise si l'écart est notable (seek, pause, dérive) ; sinon on garde l'horloge locale fluide.
		if (playChanged || Math.abs(estimate - s.positionMs()) > 700) {
			anchorPos = s.positionMs();
			anchorNanos = now;
		} else if (s.playing()) {
			// petite correction douce
			long corrected = estimate + (s.positionMs() - estimate) / 8;
			anchorPos = corrected;
			anchorNanos = now;
		}
		playing = s.playing();
		media = s;
	}

	private long rawPosition(long now) {
		return playing ? anchorPos + (now - anchorNanos) / 1_000_000L : anchorPos;
	}

	private void requestLyrics(MediaState s) {
		String key = s.key();
		loadingKey = key;
		Optional<Lyrics> cached = cache.get(key);
		if (cached != null) {
			apply(cached);
			return;
		}
		lyrics = null;
		status = Status.SEARCHING;
		CompletableFuture.supplyAsync(() -> LrcLib.fetch(s.title(), s.artist(), s.album(), s.durationMs()), pool)
				.thenAccept(res -> {
					cache.put(key, res);
					if (key.equals(loadingKey)) apply(res);
				});
	}

	private void apply(Optional<Lyrics> res) {
		if (res.isEmpty()) {
			lyrics = null;
			status = Status.NOT_FOUND;
		} else if (res.get().lines.isEmpty()) {
			lyrics = null;
			status = Status.INSTRUMENTAL;
		} else {
			lyrics = res.get();
			status = res.get().synced ? Status.SYNCED : Status.UNSYNCED;
		}
	}

	// ---- API utilisée par le rendu ----

	public boolean demo() {
		return Config.get().demo;
	}

	public void restartDemo() {
		demoStart = System.nanoTime();
	}

	public MediaState media() {
		if (demo()) return new MediaState(true, "Lanterns Over the Bay", "SkyLyrics Demo", "Démo", DEMO.lines.get(DEMO.lines.size() - 1).endMs() + 2000,
				positionMs(), true, "");
		return media;
	}

	public Status status() {
		if (demo()) return Status.DEMO;
		if (!media.active()) return Status.NO_PLAYER;
		return status;
	}

	public Lyrics lyrics() {
		if (demo()) return DEMO;
		return media.active() ? lyrics : null;
	}

	/** Position actuelle (ms), décalage de synchro inclus. */
	public long positionMs() {
		if (demo()) {
			long total = DEMO.lines.get(DEMO.lines.size() - 1).endMs() + 2000;
			return ((System.nanoTime() - demoStart) / 1_000_000L) % total;
		}
		return rawPosition(System.nanoTime()) + Config.get().offsetMs;
	}

	public boolean isPlaying() {
		return demo() || (media.active() && playing);
	}

	/** Identifiant stable du morceau courant (change quand le morceau change). */
	public String trackKey() {
		return demo() ? "demo" : trackKey;
	}

	private static Lyrics buildDemo() {
		String[] text = {
				"Lanterns drifting over the bay",
				"Painting the clouds in orange and gray",
				"Every word you sing to me",
				"Floats a little higher than the sea",
				"So look up, look up tonight",
				"Your song is written in the light",
				"And when the sky turns violet",
				"I'll be the line you won't forget",
		};
		List<Lyrics.Line> lines = new ArrayList<>();
		long t = 1500;
		for (String s : text) {
			long d = 2600 + s.length() * 55L;
			lines.add(Lyrics.buildLine(t, t + d, s));
			t += d;
		}
		return new Lyrics(lines, true);
	}
}
