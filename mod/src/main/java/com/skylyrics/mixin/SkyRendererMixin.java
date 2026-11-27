package com.skylyrics.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import com.skylyrics.sky.CustomSky;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.SkyRenderer;
import net.minecraft.world.level.MoonPhase;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Remplace le ciel vanilla (disque, soleil, lune, étoiles) par le ciel personnalisé. */
@Mixin(SkyRenderer.class)
public abstract class SkyRendererMixin {
	@Inject(method = "renderSkyDisc", at = @At("HEAD"), cancellable = true)
	private void skylyrics$sky(int color, CallbackInfo ci) {
		if (CustomSky.active()) {
			Minecraft mc = Minecraft.getInstance();
			float rain = mc.level == null ? 1f : 1f - mc.level.getRainLevel(mc.getDeltaTracker().getGameTimeDeltaPartialTick(false));
			CustomSky.render(rain);
			ci.cancel();
		}
	}

	@Inject(method = "renderSunriseAndSunset", at = @At("HEAD"), cancellable = true)
	private void skylyrics$sunrise(PoseStack poseStack, float angle, int color, CallbackInfo ci) {
		if (CustomSky.active()) ci.cancel();
	}

	@Inject(method = "renderSunMoonAndStars", at = @At("HEAD"), cancellable = true)
	private void skylyrics$celestial(PoseStack poseStack, float sunAngle, float moonAngle, float starAngle, MoonPhase phase, float rain, float stars, CallbackInfo ci) {
		if (CustomSky.active()) ci.cancel();
	}

	@Inject(method = "renderDarkDisc", at = @At("HEAD"), cancellable = true)
	private void skylyrics$dark(CallbackInfo ci) {
		if (CustomSky.active()) ci.cancel();
	}
}
