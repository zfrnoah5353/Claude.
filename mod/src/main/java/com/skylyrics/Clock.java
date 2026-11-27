package com.skylyrics;

import java.util.function.LongSupplier;

/** Horloge du mod (remplaçable pour enregistrer une vidéo image par image). */
public final class Clock {
	public static volatile LongSupplier source = System::nanoTime;

	private Clock() {
	}

	public static long nanos() {
		return source.getAsLong();
	}
}
