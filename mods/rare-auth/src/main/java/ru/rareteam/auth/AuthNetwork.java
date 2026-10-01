package ru.rareteam.auth;

import com.mojang.authlib.GameProfile;
import java.util.concurrent.CompletionException;
import net.minecraft.network.chat.Component;
import net.minecraft.server.network.ServerCommonPacketListenerImpl;
import net.neoforged.neoforge.network.event.RegisterConfigurationTasksEvent;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.HandlerThread;
import net.neoforged.neoforge.network.handling.IPayloadContext;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

public final class AuthNetwork {
    private AuthNetwork() {}

    public static void registerPayloads(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar registrar = event.registrar("1").executesOn(HandlerThread.NETWORK);
        registrar.configurationToClient(
                AuthRequestPayload.TYPE,
                AuthRequestPayload.STREAM_CODEC,
                AuthNetwork::handleAuthRequest);
        registrar.configurationToServer(
                AuthTicketPayload.TYPE,
                AuthTicketPayload.STREAM_CODEC,
                AuthNetwork::handleAuthTicket);
    }

    public static void registerConfigurationTask(RegisterConfigurationTasksEvent event) {
        event.register(new AuthConfigurationTask());
    }

    private static void handleAuthRequest(AuthRequestPayload payload, IPayloadContext context) {
        String ticket = System.getenv("RARE_GAME_TICKET");
        if (ticket == null || ticket.isBlank()) {
            context.disconnect(Component.literal("RareTeam authorization ticket is missing. Start the game from RareLauncher."));
            return;
        }
        context.reply(new AuthTicketPayload(ticket));
    }

    private static void handleAuthTicket(AuthTicketPayload payload, IPayloadContext context) {
        if (!(context.listener() instanceof ServerCommonPacketListenerImpl listener)) {
            context.disconnect(Component.literal("RareTeam authorization failed: invalid connection state."));
            return;
        }

        GameProfile profile = listener.getOwner();
        AuthService.consumeTicket(payload.ticket()).whenComplete((result, error) ->
                context.channelHandlerContext().executor().execute(() -> {
                    if (error != null) {
                        Throwable cause = error instanceof CompletionException && error.getCause() != null
                                ? error.getCause()
                                : error;
                        RareAuthMod.LOGGER.warn("RareTeam authentication failed for {}: {}", profile.getName(), cause.getMessage());
                        context.disconnect(Component.literal("RareTeam authorization failed. Restart the game from RareLauncher."));
                        return;
                    }
                    if (!profile.getName().equalsIgnoreCase(result.username())
                            || !profile.getId().equals(result.minecraftUuid())) {
                        RareAuthMod.LOGGER.warn("RareTeam ticket identity mismatch for {}", profile.getName());
                        context.disconnect(Component.literal("RareTeam authorization failed: player identity mismatch."));
                        return;
                    }
                    RareAuthMod.LOGGER.info("RareTeam authenticated {}", profile.getName());
                    context.finishCurrentTask(AuthConfigurationTask.TYPE);
                }));
    }
}