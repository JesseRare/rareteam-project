package ru.rareteam.auth;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.neoforged.neoforge.client.event.RenderGuiLayerEvent;
import net.neoforged.neoforge.client.gui.VanillaGuiLayers;

public final class ClientTabOverlay {
    private ClientTabOverlay() {}

    public static void onRender(RenderGuiLayerEvent.Pre event) {
        if (!event.getName().equals(VanillaGuiLayers.TAB_LIST)) return;
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.getConnection() == null) return;
        event.setCanceled(true);
        render(event.getGuiGraphics(), minecraft);
    }

    private static void render(GuiGraphics graphics, Minecraft minecraft) {
        List<PlayerInfo> players = new ArrayList<>(minecraft.getConnection().getOnlinePlayers());
        players.sort(Comparator
                .comparingInt((PlayerInfo info) -> {
                    ClientAccessState.PlayerRole role = ClientAccessState.player(info.getProfile().getId());
                    return role == null ? -1 : -role.rolePosition();
                })
                .thenComparing(info -> info.getProfile().getName(), String.CASE_INSENSITIVE_ORDER));
        int width = Math.min(620, graphics.guiWidth() - 28);
        int rowHeight = 22;
        int height = 54 + players.size() * rowHeight + 18;
        int left = (graphics.guiWidth() - width) / 2;
        int top = 18;
        graphics.fill(left, top, left + width, top + height, 0xEE080D14);
        graphics.fill(left, top, left + 4, top + height, 0xFF35D5FF);
        graphics.fill(left + 4, top, left + width, top + 1, 0x5535D5FF);
        graphics.drawString(minecraft.font, "rareteam", left + 18, top + 12, 0xFFFFFFFF, true);
        graphics.drawString(minecraft.font, ClientAccessState.serverName(), left + 18, top + 28, 0xFF8290A3, false);
        String online = "ОНЛАЙН " + players.size();
        graphics.drawString(minecraft.font, online, left + width - 18 - minecraft.font.width(online), top + 18, 0xFF43E19B, false);
        int y = top + 50;
        for (PlayerInfo info : players) {
            ClientAccessState.PlayerRole role = ClientAccessState.player(info.getProfile().getId());
            int rowColor = (y / rowHeight) % 2 == 0 ? 0x221B2C3E : 0x111B2C3E;
            graphics.fill(left + 10, y - 4, left + width - 10, y + 16, rowColor);
            graphics.drawString(minecraft.font, info.getProfile().getName(), left + 20, y, 0xFFFFFFFF, false);
            if (role != null && !role.roleName().isBlank()) {
                String label = "◆ " + role.roleName();
                int roleX = left + width / 2;
                RoleIconCache.Icon icon = RoleIconCache.get(role.roleIconUrl());
                if (icon != null) {
                    graphics.blit(icon.location(), roleX, y - 2, 0, 0, 12, 12, icon.width(), icon.height());
                    roleX += 16;
                    label = role.roleName();
                }
                graphics.drawString(minecraft.font, label, roleX, y, parseColor(role.roleColor()), true);
            }
            int latency = info.getLatency();
            int pingColor = latency < 80 ? 0xFF43E19B : latency < 160 ? 0xFFF5C542 : 0xFFFF5267;
            String ping = latency + " ms";
            graphics.drawString(minecraft.font, ping, left + width - 20 - minecraft.font.width(ping), y, pingColor, false);
            y += rowHeight;
        }
        String footer = "roles & access synchronized by rareteam";
        graphics.drawString(minecraft.font, footer, left + (width - minecraft.font.width(footer)) / 2, top + height - 13, 0xFF58697D, false);
    }

    private static int parseColor(String value) {
        try { return 0xFF000000 | Integer.parseInt(value.replace("#", ""), 16); }
        catch (NumberFormatException ignored) { return 0xFF9CA3AF; }
    }
}