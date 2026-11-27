package com.skylyrics.test;

import com.skylyrics.Clock;
import com.skylyrics.Config;
import com.skylyrics.gui.SkyLyricsScreen;
import com.skylyrics.lyrics.LyricsEngine;
import com.skylyrics.render.SkyTextRenderer;
import com.skylyrics.sky.CustomSky;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.minecraft.client.Minecraft;

import java.nio.file.Path;

/** Enregistre une vidéo du mod image par image (horloge virtuelle à 30 i/s). */
final class VideoRecorder {
	static final int FPS = 30, SIZE = 900;
	static volatile long virtualNanos = 0;

	private record Scene(double seconds, String sky, String style, Config.Display display, String menuTab) {
	}

	static void record(ClientGameTestContext ctx) {
		Path out = Path.of(System.getenv("SKYLYRICS_VIDEO"));
		Scene[] scenes = {
				new Scene(11, "sunset", "lavender", Config.Display.SKY, null),
				new Scene(9, "nebula", "script", Config.Display.SKY, null),
				new Scene(7, "aurora", "comic", Config.Display.FLOAT, null),
				new Scene(6, "pink", "dreamy", Config.Display.SKY, null),
				new Scene(3, "golden", "royal", Config.Display.SKY, "STYLES"),
				new Scene(4, "midnight", "ice", Config.Display.SKY, "SKIES"),
		};
		try (TestSingleplayerContext sp = ctx.worldBuilder().create()) {
			ctx.getInput().resizeWindow(SIZE, SIZE);
			ctx.waitTicks(5);
			sp.getClientWorld().waitForChunksRender();
			ctx.runOnClient(mc -> {
				Clock.source = () -> virtualNanos;
				for (String id : new String[]{"sunset", "nebula", "aurora", "pink", "golden", "midnight"}) CustomSky.texture(id);
				mc.options.hideGui = false;
			});
			ctx.waitTicks(120); // génération des ciels
			int frame = 0;
			double yaw = 15, songMs = 1200;
			for (Scene sc : scenes) {
				final Scene scene = sc;
				ctx.runOnClient(mc -> {
					Config c = Config.get();
					c.demo = true;
					c.sky = scene.sky;
					c.style = scene.style;
					c.font = "";
					c.display = scene.display;
					c.skyEnabled = true;
					c.topBar = true;
					SkyTextRenderer.reset();
					if (scene.menuTab != null) {
						setTab(scene.menuTab);
						if (!(mc.screen instanceof SkyLyricsScreen)) mc.setScreen(new SkyLyricsScreen());
					} else if (mc.screen != null) mc.setScreen(null);
				});
				int frames = (int) (scene.seconds * FPS);
				for (int i = 0; i < frames; i++, frame++) {
					double dt = 1.0 / FPS;
					songMs += dt * 1000;
					// caméra : panoramique doux, plus rapide en mode flottant
					yaw += (scene.display == Config.Display.FLOAT ? 9 : 2.2) * dt;
					double pitch = -14 + 4 * Math.sin(frame / (FPS * 3.0));
					final float fy = (float) yaw, fp = (float) pitch;
					final long t = (long) (songMs * 1_000_000L);
					ctx.runOnClient(mc -> {
						virtualNanos = t;
						setDemoStart(0);
						if (mc.player != null) {
							mc.player.setYRot(fy);
							mc.player.setXRot(fp);
							mc.player.yRotO = fy;
							mc.player.xRotO = fp;
						}
					});
					ctx.takeScreenshot(TestScreenshotOptions.of(String.format("f%05d", frame)).disableCounterPrefix().withDestinationDir(out));
				}
			}
			ctx.runOnClient(mc -> mc.setScreen(null));
		}
	}

	private static void setDemoStart(long v) {
		try {
			var f = LyricsEngine.class.getDeclaredField("demoStart");
			f.setAccessible(true);
			f.setLong(LyricsEngine.get(), v);
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}

	private static void setTab(String name) {
		try {
			var f = SkyLyricsScreen.class.getDeclaredField("tab");
			f.setAccessible(true);
			Class<?> tabCls = Class.forName("com.skylyrics.gui.SkyLyricsScreen$Tab");
			for (Object o : tabCls.getEnumConstants()) if (((Enum<?>) o).name().equals(name)) f.set(null, o);
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}
}
