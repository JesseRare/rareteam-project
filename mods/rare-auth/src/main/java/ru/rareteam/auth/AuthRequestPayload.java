package ru.rareteam.auth;

import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import io.netty.buffer.ByteBuf;

public record AuthRequestPayload() implements CustomPacketPayload {
    public static final Type<AuthRequestPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(RareAuthMod.MOD_ID, "request"));
    public static final StreamCodec<ByteBuf, AuthRequestPayload> STREAM_CODEC =
            StreamCodec.unit(new AuthRequestPayload());

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}