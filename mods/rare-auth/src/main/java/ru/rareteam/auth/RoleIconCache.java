package ru.rareteam.auth;

import com.mojang.blaze3d.platform.NativeImage;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;

public final class RoleIconCache {
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final Map<String, Icon> ICONS = new ConcurrentHashMap<>();
    private static final Set<String> LOADING = ConcurrentHashMap.newKeySet();

    private RoleIconCache() {}

    public static Icon get(String url) {
        if (url == null || url.isBlank()) return null;
        Icon loaded = ICONS.get(url);
        if (loaded != null) return loaded;
        if (LOADING.add(url)) download(url);
        return null;
    }

    private static void download(String value) {
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || !uri.getHost().endsWith("rarenetwork.ru")) {
                LOADING.remove(value);
                return;
            }
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET().build();
            HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray()).whenComplete((response, error) -> {
                if (error != null || response.statusCode() != 200 || response.body().length > 256 * 1024) {
                    LOADING.remove(value);
                    return;
                }
                Minecraft.getInstance().execute(() -> {
                    try {
                        NativeImage image = NativeImage.read(response.body());
                        DynamicTexture texture = new DynamicTexture(image);
                        ResourceLocation location = Minecraft.getInstance().getTextureManager()
                                .register("rare_role_" + Integer.toUnsignedString(value.hashCode()), texture);
                        ICONS.put(value, new Icon(location, image.getWidth(), image.getHeight()));
                    } catch (Exception exception) {
                        RareAuthMod.LOGGER.warn("Could not load role icon {}", value, exception);
                    } finally {
                        LOADING.remove(value);
                    }
                });
            });
        } catch (RuntimeException exception) {
            LOADING.remove(value);
        }
    }

    public record Icon(ResourceLocation location, int width, int height) {}
}