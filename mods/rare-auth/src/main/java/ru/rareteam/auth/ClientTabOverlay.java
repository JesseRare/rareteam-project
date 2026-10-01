package ru.rareteam.auth;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.neoforged.neoforge.client.event.RenderGuiLayerEvent;
import net.neoforged.neoforge.client.gui.VanillaGuiLayers;

public final class ClientTabOverlay {
    private static final int BACKGROUND = 0xEA070C13;
    private static final int SURFACE = 0xE9111924;
    private static final int GRID = 0x88405A70;
    private static final int CYAN = 0xFF35D5FF;
    private static final int MUTED = 0xFF8290A3;
    private static final int GREEN = 0xFF43E19B;

    private ClientTabOverlay() {}

    public static void onRender(RenderGuiLayerEvent.Pre event) {
        if (!event.getName().equals(VanillaGuiLayers.TAB_LIST)) return;
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.getConnection() == null || !minecraft.options.keyPlayerList.isDown()) return;
        event.setCanceled(true);
        render(event.getGuiGraphics(), minecraft);
    }

    private static void render(GuiGraphics graphics, Minecraft minecraft) {
        List<PlayerInfo> players = new ArrayList<>(minecraft.getConnection().getOnlinePlayers());
        players.sort(Comparator
                .comparingInt((PlayerInfo info) -> {
                    ClientAccessState.PlayerRole role = ClientAccessState.player(info.getProfile().getId());
                    return role == null ? 1 : -role.rolePosition();
                })
                .thenComparing(info -> info.getProfile().getName(), String.CASE_INSENSITIVE_ORDER));

        int width = Math.min(440, graphics.guiWidth() - 40);
        int headerHeight = 34;
        int columnHeight = 16;
        int rowHeight = 18;
        int footerHeight = 22;
        int height = headerHeight + columnHeight + Math.max(1, players.size()) * rowHeight + footerHeight;
        int left = (graphics.guiWidth() - width) / 2;
        int top = 14;
        int right = left + width;
        int bottom = top + height;
        int nameDivider = left + Math.round(width * 0.43F);
        int roleDivider = left + Math.round(width * 0.78F);
        int rowsTop = top + headerHeight + columnHeight;
        int footerTop = bottom - footerHeight;

        graphics.fill(left, top, right, bottom, BACKGROUND);
        border(graphics, left, top, right, bottom, GRID);
        graphics.fill(left + 1, top + 1, right - 1, top + headerHeight, SURFACE);
        graphics.fill(left + 1, top + 1, left + 4, bottom - 1, CYAN);
        lineH(graphics, left + 4, right - 1, top + headerHeight, GRID);
        lineH(graphics, left + 4, right - 1, rowsTop, GRID);
        lineH(graphics, left + 4, right - 1, footerTop, GRID);
        lineV(graphics, nameDivider, top + headerHeight, footerTop, GRID);
        lineV(graphics, roleDivider, top + headerHeight, footerTop, GRID);

        graphics.drawString(minecraft.font, "rareteam", left + 13, top + 8, 0xFFFFFFFF, true);
        graphics.drawString(minecraft.font, ClientAccessState.serverName(), left + 13, top + 20, MUTED, false);
        String online = "ОНЛАЙН  " + players.size();
        graphics.drawString(minecraft.font, online, right - 12 - minecraft.font.width(online), top + 13, GREEN, false);

        int columnY = top + headerHeight + 4;
        graphics.drawString(minecraft.font, "ИГРОК", left + 13, columnY, MUTED, false);
        graphics.drawString(minecraft.font, "РОЛЬ", nameDivider + 8, columnY, MUTED, false);
        String pingHeader = "ПИНГ";
        graphics.drawString(minecraft.font, pingHeader, right - 10 - minecraft.font.width(pingHeader), columnY, MUTED, false);

        if (players.isEmpty()) {
            String empty = "Нет игроков";
            int y = rowsTop + 5;
            graphics.drawString(minecraft.font, empty, left + (width - minecraft.font.width(empty)) / 2, y, MUTED, false);
        } else {
            int y = rowsTop;
            for (int index = 0; index < players.size(); index++) {
                PlayerInfo info = players.get(index);
                if ((index & 1) == 1) graphics.fill(left + 4, y, right - 1, y + rowHeight, 0x33172230);
                if (index > 0) lineH(graphics, left + 4, right - 1, y, 0x44324659);

                int textY = y + 5;
                graphics.drawString(minecraft.font, info.getProfile().getName(), left + 13, textY, 0xFFFFFFFF, false);
                drawRole(graphics, minecraft, ClientAccessState.player(info.getProfile().getId()), nameDivider + 8, textY);

                int latency = info.getLatency();
                int pingColor = latency < 80 ? GREEN : latency < 160 ? 0xFFF5C542 : 0xFFFF5267;
                String ping = latency + " ms";
                graphics.drawString(minecraft.font, ping, right - 10 - minecraft.font.width(ping), textY, pingColor, false);
                y += rowHeight;
            }
        }

        String tps = String.format(Locale.ROOT, "TPS %.1f", ClientAccessState.tps());
        int tpsColor = ClientAccessState.tps() >= 19.0 ? GREEN : ClientAccessState.tps() >= 15.0 ? 0xFFF5C542 : 0xFFFF5267;
        String memory = "RAM " + formatMemory(ClientAccessState.availableMemoryMb()) + " свободно";
        int footerY = footerTop + 7;
        graphics.drawString(minecraft.font, tps, left + 13, footerY, tpsColor, false);
        graphics.drawString(minecraft.font, memory, right - 10 - minecraft.font.width(memory), footerY, MUTED, false);
    }

    private static void drawRole(
            GuiGraphics graphics,
            Minecraft minecraft,
            ClientAccessState.PlayerRole role,
            int x,
            int y
    ) {
        if (role == null || role.roleName().isBlank()) {
            graphics.drawString(minecraft.font, "—", x, y, MUTED, false);
            return;
        }
        RoleIconCache.Icon icon = RoleIconCache.get(role.roleIconUrl());
        if (icon != null) {
            graphics.blit(icon.location(), x, y - 2, 0, 0, 11, 11, icon.width(), icon.height());
            x += 14;
        }
        graphics.drawString(minecraft.font, role.roleName(), x, y, parseColor(role.roleColor()), true);
    }

    private static String formatMemory(long memoryMb) {
        if (memoryMb >= 1024) return String.format(Locale.ROOT, "%.1f GB", memoryMb / 1024.0);
        return memoryMb + " MB";
    }

    private static void border(GuiGraphics graphics, int left, int top, int right, int bottom, int color) {
        lineH(graphics, left, right, top, color);
        lineH(graphics, left, right, bottom - 1, color);
        lineV(graphics, left, top, bottom, color);
        lineV(graphics, right - 1, top, bottom, color);
    }

    private static void lineH(GuiGraphics graphics, int left, int right, int y, int color) {
        graphics.fill(left, y, right, y + 1, color);
    }

    private static void lineV(GuiGraphics graphics, int x, int top, int bottom, int color) {
        graphics.fill(x, top, x + 1, bottom, color);
    }

    private static int parseColor(String value) {
        try { return 0xFF000000 | Integer.parseInt(value.replace("#", ""), 16); }
        catch (NumberFormatException ignored) { return 0xFF9CA3AF; }
    }
}
