package ru.rareteam.auth;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;

public final class AccessRegistry {
    private static final Map<UUID, Identity> IDENTITIES = new ConcurrentHashMap<>();
    private static final AtomicBoolean REFRESHING = new AtomicBoolean();
    private static int ticks;

    private AccessRegistry() {}

    public static void authenticate(UUID uuid, String username, List<AuthService.Role> roles) {
        IDENTITIES.put(uuid, new Identity(username, roles));
    }

    public static void onLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (event.getEntity() instanceof ServerPlayer) broadcast();
    }

    public static void onLogout(PlayerEvent.PlayerLoggedOutEvent event) {
        IDENTITIES.remove(event.getEntity().getUUID());
        broadcast();
    }

    public static void onTabName(PlayerEvent.TabListNameFormat event) {
        Identity identity = IDENTITIES.get(event.getEntity().getUUID());
        if (identity == null) return;
        AuthService.Role role = primaryRole(identity.roles());
        if (role == null) return;
        event.setDisplayName(Component.literal("[" + role.name() + "] ").withColor(parseColor(role.color()))
                .append(Component.literal(identity.username()).withColor(0xFFFFFF)));
    }

    public static void onTick(ServerTickEvent.Post event) {
        if (++ticks % 200 != 0 || !REFRESHING.compareAndSet(false, true)) return;
        List<UUID> uuids = event.getServer().getPlayerList().getPlayers().stream().map(ServerPlayer::getUUID).toList();
        AuthService.fetchSnapshot(uuids).whenComplete((players, error) -> {
            REFRESHING.set(false);
            if (error != null) {
                RareAuthMod.LOGGER.warn("Could not refresh rareteam access snapshot: {}", error.getMessage());
                return;
            }
            event.getServer().execute(() -> {
                for (AuthService.PlayerAccess access : players) {
                    ServerPlayer player = event.getServer().getPlayerList().getPlayer(access.minecraftUuid());
                    if (player == null) continue;
                    if (access.banned()) {
                        player.connection.disconnect(Component.literal("Вы заблокированы в rareteam: " + access.banReason()));
                        continue;
                    }
                    IDENTITIES.put(access.minecraftUuid(), new Identity(access.username(), access.roles()));
                    player.refreshTabListName();
                }
                broadcast();
            });
        });
    }

    private static void broadcast() {
        var server = net.neoforged.neoforge.server.ServerLifecycleHooks.getCurrentServer();
        if (server == null) return;
        JsonObject root = new JsonObject();
        root.addProperty("serverName", "Мельхиор-1");
        JsonArray players = new JsonArray();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            Identity identity = IDENTITIES.get(player.getUUID());
            JsonObject value = new JsonObject();
            value.addProperty("uuid", player.getUUID().toString());
            value.addProperty("username", player.getGameProfile().getName());
            JsonArray roles = new JsonArray();
            if (identity != null) {
                identity.roles().stream().sorted(Comparator.comparingInt(AuthService.Role::position).reversed()).forEach(role -> {
                    JsonObject item = new JsonObject();
                    item.addProperty("id", role.id());
                    item.addProperty("name", role.name());
                    item.addProperty("color", role.color());
                    item.addProperty("iconUrl", role.iconUrl());
                    item.addProperty("position", role.position());
                    item.addProperty("displayInTab", role.displayInTab());
                    roles.add(item);
                });
            }
            value.add("roles", roles);
            players.add(value);
        }
        root.add("players", players);
        PacketDistributor.sendToAllPlayers(new TabStatePayload(root.toString()));
    }

    private static AuthService.Role primaryRole(List<AuthService.Role> roles) {
        return roles.stream().filter(AuthService.Role::displayInTab)
                .max(Comparator.comparingInt(AuthService.Role::position)).orElse(null);
    }

    private static int parseColor(String value) {
        try { return Integer.parseInt(value.replace("#", ""), 16); }
        catch (NumberFormatException ignored) { return 0x9CA3AF; }
    }

    private record Identity(String username, List<AuthService.Role> roles) {}
}