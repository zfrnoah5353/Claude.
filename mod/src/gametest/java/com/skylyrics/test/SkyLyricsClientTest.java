package com.skylyrics.test;

import com.skylyrics.Config;
import com.skylyrics.gui.SkyLyricsScreen;
import com.skylyrics.lyrics.LyricsEngine;
import com.skylyrics.render.SkyTextRenderer;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

public class SkyLyricsClientTest implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext ctx) {
		if (System.getenv("SKYLYRICS_VIDEO") != null) {
			VideoRecorder.record(ctx);
			return;
		}
		try (TestSingleplayerContext sp = ctx.worldBuilder().create()) {
			sp.getClientWorld().waitForChunksRender();
			setup(ctx, "sunset", "lavender", Config.Display.SKY, 1500);
			ctx.takeScreenshot("01_sunset_lavender");
			setup(ctx, "nebula", "script", Config.Display.SKY, 9000);
			ctx.takeScreenshot("02_nebula_script");
			setup(ctx, "aurora", "comic", Config.Display.FLOAT, 15000);
			ctx.takeScreenshot("03_aurora_float");
			ctx.runOnClient(mc -> mc.setScreen(new SkyLyricsScreen()));
			ctx.waitTicks(10);
			ctx.takeScreenshot("04_menu_lyrics");
			ctx.runOnClient(mc -> {
				try {
					var f = SkyLyricsScreen.class.getDeclaredField("tab");
					f.setAccessible(true);
					Class<?> tabCls = Class.forName("com.skylyrics.gui.SkyLyricsScreen$Tab");
					f.set(null, tabCls.getEnumConstants()[2]);
				} catch (Exception e) { throw new RuntimeException(e); }
			});
			ctx.waitTicks(5);
			ctx.takeScreenshot("05_menu_styles");
			ctx.runOnClient(mc -> {
				try {
					var f = SkyLyricsScreen.class.getDeclaredField("tab");
					f.setAccessible(true);
					Class<?> tabCls = Class.forName("com.skylyrics.gui.SkyLyricsScreen$Tab");
					f.set(null, tabCls.getEnumConstants()[3]);
				} catch (Exception e) { throw new RuntimeException(e); }
			});
			ctx.waitTicks(40);
			ctx.takeScreenshot("06_menu_skies");
			ctx.runOnClient(mc -> mc.setScreen(null));
		}
	}

	private void setup(ClientGameTestContext ctx, String sky, String style, Config.Display display, long atMs) {
		ctx.runOnClient(mc -> {
			Config c = Config.get();
			c.demo = true;
			c.sky = sky;
			c.style = style;
			c.font = "";
			c.display = display;
			c.skyEnabled = true;
			mc.options.hideGui = false;
			mc.player.setYRot(30f);
			mc.player.setXRot(-12f);
			LyricsEngine.get().restartDemo();
			SkyTextRenderer.reset();
		});
		// laisse le ciel se générer et avance la démo jusqu'au moment voulu
		ctx.waitTicks(40);
		ctx.runOnClient(mc -> {
			try {
				var f = LyricsEngine.class.getDeclaredField("demoStart");
				f.setAccessible(true);
				f.setLong(LyricsEngine.get(), System.nanoTime() - atMs * 1_000_000L);
			} catch (Exception e) { throw new RuntimeException(e); }
		});
		ctx.waitTicks(30);
	}
}
