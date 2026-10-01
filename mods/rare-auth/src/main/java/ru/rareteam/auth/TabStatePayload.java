package ru.rareteam.auth;

import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

public record TabStatePayload(String json) implements CustomPacketPayload {
    public static final Type<TabStatePayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(RareAuthMod.MOD_ID, "tab_state"));
    public static final StreamCodec<ByteBuf, TabStatePayload> STREAM_CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, TabStatePayload::json, TabStatePayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}