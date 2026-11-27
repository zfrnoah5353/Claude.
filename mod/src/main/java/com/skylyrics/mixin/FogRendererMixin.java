package com.skylyrics.mixin;

import com.skylyrics.sky.CustomSky;
import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogRenderer;
import net.minecraft.world.level.material.FogType;
import org.joml.Vector4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Accorde la couleur du brouillard à l'horizon du ciel choisi (sinon on voit une "bande" au loin). */
@Mixin(FogRenderer.class)
public abstract class FogRendererMixin {
	@Inject(method = "computeFogColor", at = @At("RETURN"), cancellable = true)
	private void skylyrics$fogColor(Camera camera, float partialTick, ClientLevel level, int renderDistance, float darkenAmount, CallbackInfoReturnable<Vector4f> cir) {
		if (camera.getFluidInCamera() != FogType.NONE || !CustomSky.active()) return;
		int c = CustomSky.horizonColor();
		float rain = 1f - level.getRainLevel(partialTick) * 0.4f;
		cir.setReturnValue(new Vector4f(((c >> 16) & 255) / 255f * rain, ((c >> 8) & 255) / 255f * rain, (c & 255) / 255f * rain, 1f));
	}
}
