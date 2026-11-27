package com.skylyrics.render;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.FilterMode;
import com.skylyrics.SkyLyrics;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import org.lwjgl.stb.STBImage;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;

import java.nio.ByteBuffer;
import java.nio.IntBuffer;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

/** Charge la pochette du morceau (fichier local ou URL) en texture. */
public final class AlbumArt {
	private static final Identifier ID = Identifier.fromNamespaceAndPath(SkyLyrics.MOD_ID, "album_art");
	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).followRedirects(HttpClient.Redirect.NORMAL).build();
	private static String loadedSource = "";
	private static volatile boolean ready = false;

	private AlbumArt() {
	}

	/** @return l'identifiant de texture si la pochette est prête, sinon null. */
	public static Identifier get(String source) {
		if (source == null || source.isBlank()) {
			if (!loadedSource.isEmpty()) {
				loadedSource = "";
				ready = false;
			}
			return null;
		}
		if (!source.equals(loadedSource)) {
			loadedSource = source;
			ready = false;
			final String src = source;
			CompletableFuture.supplyAsync(() -> read(src)).thenAccept(bytes -> {
				if (bytes == null) return;
				Minecraft.getInstance().execute(() -> {
					if (!src.equals(loadedSource)) return;
					try {
						NativeImage img = new NativeImage(SIZE, SIZE, false);
						for (int y = 0; y < SIZE; y++) for (int x = 0; x < SIZE; x++) img.setPixel(x, y, bytes[y * SIZE + x]);
						Minecraft.getInstance().getTextureManager().register(ID, new ArtTexture(img));
						ready = true;
					} catch (Exception e) {
						SkyLyrics.LOGGER.debug("Pochette illisible", e);
					}
				});
			});
		}
		return ready ? ID : null;
	}

	private static final int SIZE = 128;

	/** Lit l'image (PNG ou JPEG) avec stb_image, recadre en carré et réduit en 128x128 (ARGB). */
	private static int[] read(String src) {
		try {
			byte[] raw;
			if (src.startsWith("http://") || src.startsWith("https://")) {
				HttpResponse<byte[]> res = HTTP.send(HttpRequest.newBuilder(URI.create(src)).timeout(Duration.ofSeconds(10)).GET().build(),
						HttpResponse.BodyHandlers.ofByteArray());
				if (res.statusCode() / 100 != 2) return null;
				raw = res.body();
			} else if (src.startsWith("file://")) {
				raw = Files.readAllBytes(Path.of(URI.create(src)));
			} else {
				raw = Files.readAllBytes(Path.of(src));
			}
			ByteBuffer buf = MemoryUtil.memAlloc(raw.length);
			try (MemoryStack stack = MemoryStack.stackPush()) {
				buf.put(raw).flip();
				IntBuffer w = stack.mallocInt(1), h = stack.mallocInt(1), c = stack.mallocInt(1);
				ByteBuffer px = STBImage.stbi_load_from_memory(buf, w, h, c, 4);
				if (px == null) return null;
				try {
					int iw = w.get(0), ih = h.get(0), size = Math.min(iw, ih);
					int ox = (iw - size) / 2, oy = (ih - size) / 2;
					int[] out = new int[SIZE * SIZE];
					for (int y = 0; y < SIZE; y++) {
						for (int x = 0; x < SIZE; x++) {
							// moyenne 2x2 pour un rendu plus doux
							int r = 0, g = 0, b = 0;
							for (int sy = 0; sy < 2; sy++) for (int sx = 0; sx < 2; sx++) {
								int ix = ox + Math.min(size - 1, (int) ((x + sx * 0.5f + 0.25f) * size / SIZE));
								int iy = oy + Math.min(size - 1, (int) ((y + sy * 0.5f + 0.25f) * size / SIZE));
								int i = (iy * iw + ix) * 4;
								r += px.get(i) & 255;
								g += px.get(i + 1) & 255;
								b += px.get(i + 2) & 255;
							}
							out[y * SIZE + x] = 0xFF000000 | ((r / 4) << 16) | ((g / 4) << 8) | (b / 4);
						}
					}
					return out;
				} finally {
					STBImage.stbi_image_free(px);
				}
			} finally {
				MemoryUtil.memFree(buf);
			}
		} catch (Exception e) {
			SkyLyrics.LOGGER.debug("Pochette indisponible: {}", src, e);
			return null;
		}
	}

	static final class ArtTexture extends DynamicTexture {
		ArtTexture(NativeImage img) {
			super(() -> "SkyLyrics album art", img);
			this.sampler = RenderSystem.getSamplerCache().getClampToEdge(FilterMode.LINEAR);
		}
	}
}
