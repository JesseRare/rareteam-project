package ru.rareteam.auth;

import java.util.function.Consumer;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.network.ConfigurationTask;
import net.neoforged.neoforge.network.configuration.ICustomConfigurationTask;

public record AuthConfigurationTask() implements ICustomConfigurationTask {
    public static final ConfigurationTask.Type TYPE =
            new ConfigurationTask.Type(RareAuthMod.MOD_ID + ":verify_ticket");

    @Override
    public void run(Consumer<CustomPacketPayload> sender) {
        sender.accept(new AuthRequestPayload());
    }

    @Override
    public ConfigurationTask.Type type() {
        return TYPE;
    }
}