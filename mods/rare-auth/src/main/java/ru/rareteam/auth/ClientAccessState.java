package ru.rareteam.auth;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class ClientAccessState {
    private static final Map<UUID, PlayerRole> PLAYERS = new ConcurrentHashMap<>();
    private static volatile String serverName = "Мельхиор-1";

    private ClientAccessState() {}

    public static void update(String json) {
        try {
            JsonObject root = JsonParser.parseString(json).getAsJsonObject();
            serverName = root.has("serverName") ? root.get("serverName").getAsString() : "Мельхиор-1";
            Map<UUID, PlayerRole> next = new ConcurrentHashMap<>();
            for (var item : root.getAsJsonArray("players")) {
                JsonObject player = item.getAsJsonObject();
                UUID uuid = UUID.fromString(player.get("uuid").getAsString());
                String username = player.get("username").getAsString();
                String roleName = "";
                String roleColor = "#9ca3af";
                String roleIconUrl = "";
                int rolePosition = -1;
                if (player.has("roles")) {
                    for (var roleItem : player.getAsJsonArray("roles")) {
                        JsonObject role = roleItem.getAsJsonObject();
                        if (role.has("displayInTab") && !role.get("displayInTab").getAsBoolean()) continue;
                        int position = role.has("position") ? role.get("position").getAsInt() : 0;
                        if (position > rolePosition) {
                            rolePosition = position;
                            roleName = role.get("name").getAsString();
                            roleColor = role.get("color").getAsString();
                            roleIconUrl = role.has("iconUrl") && !role.get("iconUrl").isJsonNull()
                                    ? role.get("iconUrl").getAsString()
                                    : "";
                        }
                    }
                }
                next.put(uuid, new PlayerRole(username, roleName, roleColor, roleIconUrl, rolePosition));
            }
            PLAYERS.clear();
            PLAYERS.putAll(next);
        } catch (RuntimeException exception) {
            RareAuthMod.LOGGER.warn("Could not parse rareteam tab state", exception);
        }
    }

    public static PlayerRole player(UUID uuid) {
        return PLAYERS.get(uuid);
    }

    public static String serverName() {
        return serverName;
    }

    public static List<PlayerRole> players() {
        return List.copyOf(PLAYERS.values());
    }

    public record PlayerRole(String username, String roleName, String roleColor, String roleIconUrl, int rolePosition) {}
}