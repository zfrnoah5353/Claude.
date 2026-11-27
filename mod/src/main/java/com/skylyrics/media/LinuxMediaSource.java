package com.skylyrics.media;

/** Linux : utilise playerctl (MPRIS), Spotify en priorité. */
final class LinuxMediaSource extends PollingMediaSource {
	private static final String FORMAT = "{{title}}\t{{artist}}\t{{album}}\t{{mpris:length}}\t{{position}}\t{{status}}\t{{mpris:artUrl}}";

	@Override
	public String name() {
		return "Linux (playerctl)";
	}

	@Override
	protected MediaState poll() throws Exception {
		String out = run("playerctl", "-p", "spotify,%any", "metadata", "--format", FORMAT);
		String[] p = out.split("\t", -1);
		if (p.length < 6 || p[0].isBlank()) return MediaState.NONE;
		long dur = (long) (num(p[3]) / 1000);
		long pos = (long) (num(p[4]) / 1000);
		return new MediaState(true, p[0], p[1], p[2], dur, pos, p[5].trim().equalsIgnoreCase("Playing"), p.length > 6 ? p[6].trim() : "");
	}
}
