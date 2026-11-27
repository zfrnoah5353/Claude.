package com.skylyrics.sky;

import com.mojang.blaze3d.buffers.GpuBuffer;
import com.mojang.blaze3d.buffers.GpuBufferSlice;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderPass;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.AddressMode;
import com.mojang.blaze3d.textures.FilterMode;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.ByteBufferBuilder;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.MeshData;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.skylyrics.Config;
import com.skylyrics.SkyLyrics;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.Level;
import org.joml.Matrix4f;
import org.joml.Matrix4fStack;
import org.joml.Vector3f;
import org.joml.Vector4f;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.OptionalDouble;
import java.util.OptionalInt;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/** Remplace le ciel de l'Overworld par une sphère texturée générée à la volée. */
public final class CustomSky {
	private static final int W = 1024, H = 512;
	private static final int LON = 64, LAT = 32;
	private static final float RADIUS = 100f;

	private static final Map<String, Identifier> TEXTURES = new HashMap<>();
	private static final Map<String, Identifier> THUMBS = new HashMap<>();
	private static final Set<String> PENDING = new HashSet<>();
	private static GpuBuffer vertexBuffer;
	private static int indexCount;

	private CustomSky() {
	}

	/** Le ciel perso est-il actif (et prêt) pour le monde en cours ? */
	public static boolean active() {
		Config cfg = Config.get();
		Minecraft mc = Minecraft.getInstance();
		if (!cfg.skyEnabled || mc.level == null || mc.level.dimension() != Level.OVERWORLD) return false;
		return texture(cfg.sky) != null;
	}

	public static int horizonColor() {
		return SkyPreset.get(Config.get().sky).horizon;
	}

	/** Texture du ciel ; lance la génération en arrière-plan si besoin (renvoie null tant qu'elle n'est pas prête). */
	public static Identifier texture(String id) {
		SkyPreset p = SkyPreset.get(id);
		Identifier tex = TEXTURES.get(p.id);
		if (tex == null && PENDING.add(p.id)) {
			CompletableFuture.supplyAsync(() -> SkyPainter.paint(p, W, H)).whenComplete((px, err) -> {
				if (err != null) {
					SkyLyrics.LOGGER.error("Génération du ciel {} impossible", p.id, err);
					return;
				}
				Minecraft.getInstance().execute(() -> {
					Identifier loc = Identifier.fromNamespaceAndPath(SkyLyrics.MOD_ID, "sky/" + p.id);
					Minecraft.getInstance().getTextureManager().register(loc, new SkyTexture("SkyLyrics sky " + p.id, toImage(px, W, H), true));
					TEXTURES.put(p.id, loc);
					PENDING.remove(p.id);
				});
			});
		}
		return tex;
	}

	/** Petite vignette pour le menu. */
	public static Identifier thumbnail(String id) {
		SkyPreset p = SkyPreset.get(id);
		return THUMBS.computeIfAbsent(p.id, k -> {
			Identifier loc = Identifier.fromNamespaceAndPath(SkyLyrics.MOD_ID, "sky_thumb/" + p.id);
			// vignette : du haut du ciel jusqu'un peu sous l'horizon
			int tw = 192, th = 96, fw = tw * 2, fh = th * 4;
			int[] full = SkyPainter.paint(p, fw, fh);
			int[] crop = new int[tw * th];
			for (int y = 0; y < th; y++) {
				int sy = Math.min(fh - 1, (int) ((0.10f + 0.45f * y / th) * fh));
				for (int x = 0; x < tw; x++) crop[y * tw + x] = full[sy * fw + x + tw / 2];
			}
			Minecraft.getInstance().getTextureManager().register(loc, new SkyTexture("SkyLyrics thumb " + p.id, toImage(crop, tw, th), false));
			return loc;
		});
	}

	private static NativeImage toImage(int[] px, int w, int h) {
		NativeImage img = new NativeImage(w, h, false);
		for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) img.setPixel(x, y, px[y * w + x]);
		return img;
	}

	private static void buildMesh() {
		int verts = LON * LAT * 4;
		try (ByteBufferBuilder bytes = ByteBufferBuilder.exactlySized(verts * DefaultVertexFormat.POSITION_TEX_COLOR.getVertexSize())) {
			BufferBuilder b = new BufferBuilder(bytes, VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX_COLOR);
			for (int j = 0; j < LAT; j++) {
				float v0 = (float) j / LAT, v1 = (float) (j + 1) / LAT;
				for (int i = 0; i < LON; i++) {
					float u0 = (float) i / LON, u1 = (float) (i + 1) / LON;
					// ordre inversé pour que la face intérieure soit visible
					vertex(b, u0, v0);
					vertex(b, u0, v1);
					vertex(b, u1, v1);
					vertex(b, u1, v0);
				}
			}
			try (MeshData mesh = b.buildOrThrow()) {
				indexCount = mesh.drawState().indexCount();
				vertexBuffer = RenderSystem.getDevice().createBuffer(() -> "SkyLyrics sky sphere", GpuBuffer.USAGE_VERTEX | GpuBuffer.USAGE_COPY_DST, mesh.vertexBuffer());
			}
		}
	}

	private static void vertex(BufferBuilder b, float u, float v) {
		double lat = (0.5 - v) * Math.PI, lon = u * Math.PI * 2;
		float cy = (float) Math.cos(lat);
		float x = (float) (cy * Math.cos(lon)) * RADIUS, y = (float) Math.sin(lat) * RADIUS, z = (float) (cy * Math.sin(lon)) * RADIUS;
		b.addVertex(x, y, z).setUv(u, v).setColor(-1);
	}

	/** Appelé à la place du disque de ciel vanilla. */
	public static void render(float rainBrightness) {
		Identifier texId = texture(Config.get().sky);
		if (texId == null) return;
		if (vertexBuffer == null) buildMesh();
		Minecraft mc = Minecraft.getInstance();
		var texture = mc.getTextureManager().getTexture(texId);
		RenderSystem.AutoStorageIndexBuffer indices = RenderSystem.getSequentialBuffer(VertexFormat.Mode.QUADS);
		GpuBuffer indexBuffer = indices.getBuffer(indexCount);

		float spin = 0f;
		if (Config.get().skyRotation && mc.level != null) {
			spin = (float) ((mc.level.getGameTime() % 72000L + mc.getDeltaTracker().getGameTimeDeltaPartialTick(false)) / 72000.0 * Math.PI * 2);
		}
		float bright = 0.55f + 0.45f * rainBrightness;
		Matrix4fStack mv = RenderSystem.getModelViewStack();
		mv.pushMatrix();
		mv.rotateY(spin);
		GpuBufferSlice transform = RenderSystem.getDynamicUniforms()
				.writeTransform(mv, new Vector4f(bright, bright, bright, 1f), new Vector3f(), new Matrix4f());
		mv.popMatrix();

		RenderTarget target = mc.getMainRenderTarget();
		try (RenderPass pass = RenderSystem.getDevice().createCommandEncoder()
				.createRenderPass(() -> "SkyLyrics sky", target.getColorTextureView(), OptionalInt.empty(), target.getDepthTextureView(), OptionalDouble.empty())) {
			pass.setPipeline(RenderPipelines.END_SKY);
			RenderSystem.bindDefaultUniforms(pass);
			pass.setUniform("DynamicTransforms", transform);
			pass.bindTexture("Sampler0", texture.getTextureView(), texture.getSampler());
			pass.setVertexBuffer(0, vertexBuffer);
			pass.setIndexBuffer(indexBuffer, indices.type());
			pass.drawIndexed(0, 0, indexCount, 1);
		}
	}

	/** Texture dynamique avec filtrage lissé (le ciel ne doit pas être pixelisé). */
	static final class SkyTexture extends DynamicTexture {
		SkyTexture(String label, NativeImage image, boolean wrapX) {
			super(() -> label, image);
			this.sampler = RenderSystem.getSamplerCache().getSampler(
					wrapX ? AddressMode.REPEAT : AddressMode.CLAMP_TO_EDGE, AddressMode.CLAMP_TO_EDGE, FilterMode.LINEAR, FilterMode.LINEAR, false);
		}
	}
}
