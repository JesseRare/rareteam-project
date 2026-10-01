package ru.rareteam.auth;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public final class AuthService {
    private static final Properties FILE_SETTINGS = loadFileSettings();
    private static final String BACKEND_URL =
            setting("rare.auth.backendUrl", "RARE_AUTH_BACKEND_URL", "backend-url", "https://launcher-api.rarenetwork.ru");
    private static final String SERVER_ID =
            setting("rare.auth.serverId", "RARE_AUTH_SERVER_ID", "server-id", "melchior-1");
    private static final String SERVER_KEY =
            setting("rare.auth.serverKey", "RARE_AUTH_SERVER_KEY", "server-key", "");
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private AuthService() {}

    public static boolean isConfigured() {
        return !SERVER_KEY.isBlank();
    }

    public static CompletableFuture<AuthResult> consumeTicket(String ticket) {
        if (ticket == null || ticket.length() < 20 || ticket.length() > 512) {
            return CompletableFuture.failedFuture(new AuthException("Invalid ticket format"));
        }
        if (!isConfigured()) {
            return CompletableFuture.failedFuture(new AuthException("Server authentication is not configured"));
        }

        JsonObject body = new JsonObject();
        body.addProperty("ticket", ticket);
        body.addProperty("serverId", SERVER_ID);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(trimTrailingSlash(BACKEND_URL) + "/v1/game/ticket/consume"))
                .timeout(Duration.ofSeconds(8))
                .header("content-type", "application/json")
                .header("x-server-key", SERVER_KEY)
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();

        return HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(response -> {
                    if (response.statusCode() != 200) {
                        throw new AuthException("Ticket was rejected");
                    }
                    JsonObject json = JsonParser.parseString(response.body()).getAsJsonObject();
                    String username = requiredString(json, "username");
                    UUID minecraftUuid = UUID.fromString(requiredString(json, "minecraft_uuid"));
                    return new AuthResult(username, minecraftUuid);
                });
    }

    private static String requiredString(JsonObject json, String field) {
        if (!json.has(field) || !json.get(field).isJsonPrimitive()) {
            throw new AuthException("Invalid backend response");
        }
        return json.get(field).getAsString();
    }

    private static String setting(String property, String environment, String fileKey, String fallback) {
        String propertyValue = System.getProperty(property);
        if (propertyValue != null && !propertyValue.isBlank()) {
            return propertyValue.trim();
        }
        String environmentValue = System.getenv(environment);
        if (environmentValue != null && !environmentValue.isBlank()) {
            return environmentValue.trim();
        }
        String fileValue = FILE_SETTINGS.getProperty(fileKey);
        return fileValue == null || fileValue.isBlank() ? fallback : fileValue.trim();
    }

    private static Properties loadFileSettings() {
        Properties properties = new Properties();
        Path path = Path.of("config", "rare-auth.properties");
        if (!Files.isRegularFile(path)) {
            return properties;
        }
        try (InputStream input = Files.newInputStream(path)) {
            properties.load(input);
            return properties;
        } catch (IOException exception) {
            RareAuthMod.LOGGER.error("Could not read {}", path, exception);
            return properties;
        }
    }

    private static String trimTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    public record AuthResult(String username, UUID minecraftUuid) {}

    public static final class AuthException extends RuntimeException {
        public AuthException(String message) {
            super(message);
        }
    }
}