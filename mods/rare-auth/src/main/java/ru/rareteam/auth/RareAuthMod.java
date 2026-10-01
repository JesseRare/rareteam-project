package ru.rareteam.auth;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;

@Mod(RareAuthMod.MOD_ID)
public final class RareAuthMod {
    public static final String MOD_ID = "rare_auth";
    public static final Logger LOGGER = LogUtils.getLogger();

    public RareAuthMod(IEventBus modEventBus, ModContainer modContainer) {
        modEventBus.addListener(AuthNetwork::registerPayloads);
        modEventBus.addListener(AuthNetwork::registerConfigurationTask);
        LOGGER.info("RareTeam Auth initialized");
    }
}
