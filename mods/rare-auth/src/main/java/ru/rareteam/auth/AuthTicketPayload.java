package ru.rareteam.auth;

import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

public record AuthTicketPayload(String ticket) implements CustomPacketPayload {
    public static final Type<AuthTicketPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(RareAuthMod.MOD_ID, "ticket"));
    public static final StreamCodec<ByteBuf, AuthTicketPayload> STREAM_CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, AuthTicketPayload::ticket, AuthTicketPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}