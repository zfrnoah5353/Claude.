package com.skylyrics.media;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Source qui interroge une commande système à intervalle régulier (macOS / Linux). */
abstract class PollingMediaSource implements MediaSource {
	private volatile boolean running;
	private Thread thread;

	protected abstract MediaState poll() throws Exception;

	@Override
	public void start(Consumer<MediaState> sink) {
		running = true;
		thread = new Thread(() -> {
			int fails = 0;
			while (running) {
				MediaState s;
				try {
					s = poll();
					fails = 0;
				} catch (Exception e) {
					s = MediaState.NONE;
					fails++;
				}
				sink.accept(s);
				try {
					Thread.sleep(fails > 3 ? 3000 : 500);
				} catch (InterruptedException e) {
					return;
				}
			}
		}, "SkyLyrics-Media");
		thread.setDaemon(true);
		thread.start();
	}

	protected static String run(String... cmd) throws Exception {
		Process p = new ProcessBuilder(cmd).redirectErrorStream(false).start();
		StringBuilder sb = new StringBuilder();
		try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
			String l;
			while ((l = r.readLine()) != null) {
				if (!sb.isEmpty()) sb.append('\n');
				sb.append(l);
			}
		}
		if (!p.waitFor(3, TimeUnit.SECONDS)) p.destroyForcibly();
		return sb.toString();
	}

	protected static double num(String s) {
		try {
			return Double.parseDouble(s.trim().replace(',', '.'));
		} catch (Exception e) {
			return 0;
		}
	}

	@Override
	public void close() {
		running = false;
		if (thread != null) thread.interrupt();
	}
}
