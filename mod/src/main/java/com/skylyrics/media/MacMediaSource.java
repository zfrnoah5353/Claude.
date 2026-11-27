package com.skylyrics.media;

/** macOS : interroge l'appli Spotify via AppleScript. */
final class MacMediaSource extends PollingMediaSource {
	private static final String SCRIPT = """
			if application "Spotify" is running then
				tell application "Spotify"
					set t to current track
					return (name of t) & linefeed & (artist of t) & linefeed & (album of t) & linefeed & (duration of t) & linefeed & (player position as string) & linefeed & (player state as string) & linefeed & (artwork url of t)
				end tell
			end if
			return ""
			""";

	@Override
	public String name() {
		return "macOS (AppleScript Spotify)";
	}

	@Override
	protected MediaState poll() throws Exception {
		String out = run("osascript", "-e", SCRIPT);
		String[] p = out.split("\n", -1);
		if (p.length < 6 || p[0].isBlank()) return MediaState.NONE;
		long dur = (long) num(p[3]);
		long pos = (long) (num(p[4]) * 1000);
		return new MediaState(true, p[0], p[1], p[2], dur, pos, p[5].trim().equalsIgnoreCase("playing"), p.length > 6 ? p[6].trim() : "");
	}
}
