package com.skylyrics.lyrics;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Paroles synchronisées : des lignes, chacune découpée en mots minutés. */
public final class Lyrics {
	public record Word(String text, long startMs, long endMs) {
	}

	public record Line(long startMs, long endMs, String text, List<Word> words) {
		public boolean isBlank() {
			return words.isEmpty();
		}

		/** Nombre de mots déjà commencés à l'instant t. */
		public int wordsStarted(long t) {
			int n = 0;
			for (Word w : words) if (t >= w.startMs) n++;
			return n;
		}
	}

	public final List<Line> lines;
	public final boolean synced;

	public Lyrics(List<Line> lines, boolean synced) {
		this.lines = lines;
		this.synced = synced;
	}

	/** Index de la ligne en cours à l'instant t (-1 avant la première). */
	public int lineAt(long t) {
		int lo = 0, hi = lines.size() - 1, ans = -1;
		while (lo <= hi) {
			int mid = (lo + hi) >>> 1;
			if (lines.get(mid).startMs <= t) {
				ans = mid;
				lo = mid + 1;
			} else hi = mid - 1;
		}
		return ans;
	}

	private static final Pattern TIME = Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?]");
	private static final Pattern WORD_TIME = Pattern.compile("<(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?>");

	private static long ms(Matcher m) {
		long min = Long.parseLong(m.group(1));
		long sec = Long.parseLong(m.group(2));
		long frac = 0;
		if (m.group(3) != null) {
			String f = m.group(3);
			frac = Long.parseLong(f);
			if (f.length() == 1) frac *= 100;
			else if (f.length() == 2) frac *= 10;
		}
		return min * 60_000 + sec * 1000 + frac;
	}

	/** Lit un fichier LRC (y compris le format "enhanced" avec <mm:ss.xx> par mot). */
	public static Lyrics parseLrc(String lrc, long durationMs) {
		record Raw(long t, String text) {
		}
		List<Raw> raws = new ArrayList<>();
		long offset = 0;
		for (String rawLine : lrc.split("\\r?\\n")) {
			String l = rawLine.trim();
			if (l.startsWith("[offset:")) {
				try {
					offset = Long.parseLong(l.substring(8, l.length() - 1).trim());
				} catch (Exception ignored) {
				}
				continue;
			}
			Matcher m = TIME.matcher(l);
			List<Long> times = new ArrayList<>();
			int end = 0;
			while (m.find() && m.start() == end) {
				times.add(ms(m));
				end = m.end();
			}
			if (times.isEmpty()) continue;
			String text = l.substring(end).trim();
			for (long t : times) raws.add(new Raw(Math.max(0, t - offset), text));
		}
		raws.sort((a, b) -> Long.compare(a.t, b.t));
		List<Line> lines = new ArrayList<>();
		for (int i = 0; i < raws.size(); i++) {
			Raw r = raws.get(i);
			long next = i + 1 < raws.size() ? raws.get(i + 1).t : (durationMs > r.t ? Math.min(durationMs, r.t + 8000) : r.t + 6000);
			lines.add(buildLine(r.t, Math.max(r.t + 200, next), r.text));
		}
		return new Lyrics(lines, true);
	}

	/** Paroles non synchronisées : réparties uniformément sur la durée du morceau. */
	public static Lyrics fromPlain(String plain, long durationMs) {
		List<String> texts = new ArrayList<>();
		for (String l : plain.split("\\r?\\n")) if (!l.isBlank()) texts.add(l.trim());
		if (texts.isEmpty()) return new Lyrics(List.of(), false);
		long dur = durationMs > 0 ? durationMs : texts.size() * 3500L;
		long intro = Math.min(15_000, dur / 12);
		long step = Math.max(1500, (dur - intro) / texts.size());
		List<Line> lines = new ArrayList<>();
		for (int i = 0; i < texts.size(); i++) {
			long s = intro + i * step;
			lines.add(buildLine(s, s + step, texts.get(i)));
		}
		return new Lyrics(lines, false);
	}

	static Line buildLine(long start, long end, String text) {
		// Format "enhanced" : <00:12.34>mot <00:12.80>mot
		if (WORD_TIME.matcher(text).find()) {
			List<Word> words = new ArrayList<>();
			Matcher m = WORD_TIME.matcher(text);
			long t = start;
			int last = 0;
			List<long[]> marks = new ArrayList<>();
			List<String> chunks = new ArrayList<>();
			while (m.find()) {
				chunks.add(text.substring(last, m.start()));
				marks.add(new long[]{t});
				t = ms(m);
				last = m.end();
			}
			chunks.add(text.substring(last));
			marks.add(new long[]{t});
			StringBuilder plain = new StringBuilder();
			for (int i = 0; i < chunks.size(); i++) {
				long ws = marks.get(i)[0];
				long we = i + 1 < marks.size() ? marks.get(i + 1)[0] : end;
				for (String w : chunks.get(i).trim().split("\\s+")) {
					if (w.isEmpty()) continue;
					words.add(new Word(w, ws, Math.max(ws + 80, we)));
					if (!plain.isEmpty()) plain.append(' ');
					plain.append(w);
				}
			}
			return new Line(start, end, plain.toString(), words);
		}

		String[] parts = text.trim().isEmpty() ? new String[0] : text.trim().split("\\s+");
		List<Word> words = new ArrayList<>();
		if (parts.length == 0) return new Line(start, end, "", words);
		long dur = end - start;
		// On chante en général ~85 % de la ligne, sans traîner plus de ~0,65 s par mot.
		long sing = Math.max(250, Math.min((long) (dur * 0.85), parts.length * 650L));
		double total = 0;
		for (String p : parts) total += p.length() + 2.5;
		double acc = 0;
		for (String p : parts) {
			long ws = start + (long) (sing * acc / total);
			acc += p.length() + 2.5;
			long we = start + (long) (sing * acc / total);
			words.add(new Word(p, ws, we));
		}
		return new Line(start, end, text.trim(), words);
	}
}
