package com.skylyrics;

import com.mojang.blaze3d.platform.InputConstants;
import com.skylyrics.gui.SkyLyricsScreen;
import com.skylyrics.lyrics.LyricsEngine;
import com.skylyrics.render.SkyTextRenderer;
import com.skylyrics.render.TopBarHud;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Point d'entrée du mod (client uniquement). */
public final class SkyLyrics implements ClientModInitializer {
	public static final String MOD_ID = "skylyrics";
	public static final Logger LOGGER = LoggerFactory.getLogger("SkyLyrics");

	private static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "main"));
	public static KeyMapping MENU_KEY;
	public static KeyMapping TOGGLE_KEY;
	public static KeyMapping EARLIER_KEY;
	public static KeyMapping LATER_KEY;

	@Override
	public void onInitializeClient() {
		Config.load();

		MENU_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.skylyrics.menu", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_K, CATEGORY));
		TOGGLE_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.skylyrics.toggle", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_UNKNOWN, CATEGORY));

		EARLIER_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.skylyrics.earlier", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_EQUAL, CATEGORY));
		LATER_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.skylyrics.later", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_MINUS, CATEGORY));

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			int step = 0;
			while (EARLIER_KEY.consumeClick()) step += 100;
			while (LATER_KEY.consumeClick()) step -= 100;
			if (step != 0) {
				Config.get().offsetMs += step;
				Config.save();
				int o = Config.get().offsetMs;
				client.gui.setOverlayMessage(Component.literal("SkyLyrics · synchro : " + (o > 0 ? "+" : "") + o + " ms  (" + (o >= 0 ? "paroles avancées" : "paroles retardées") + ")"), false);
			}
			while (MENU_KEY.consumeClick()) {
				if (client.screen == null) client.setScreen(new SkyLyricsScreen());
			}
			while (TOGGLE_KEY.consumeClick()) {
				Config.get().lyricsEnabled = !Config.get().lyricsEnabled;
				Config.save();
			}
		});

		WorldRenderEvents.END_MAIN.register(context -> SkyTextRenderer.render(context.consumers()));
		HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "top_bar"), TopBarHud::render);

		ClientLifecycleEvents.CLIENT_STARTED.register(client -> LyricsEngine.get().start());
		ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
			LyricsEngine.get().stop();
			Config.save();
		});
		LOGGER.info("SkyLyrics prêt — touche K pour le menu");
	}
}
