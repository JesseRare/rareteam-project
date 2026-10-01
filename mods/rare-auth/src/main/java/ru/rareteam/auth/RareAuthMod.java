package ru.rareteam.auth;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.loading.FMLEnvironment;

@Mod(RareAuthMod.MOD_ID)
public final class RareAuthMod {
    public static final String MOD_ID = "rare_auth";
    public static final Logger LOGGER = LogUtils.getLogger();

    public RareAuthMod(IEventBus modEventBus, ModContainer modContainer) {
        modEventBus.addListener(AuthNetwork::registerPayloads);
        modEventBus.addListener(AuthNetwork::registerConfigurationTask);
        NeoForge.EVENT_BUS.addListener(AccessRegistry::onLogin);
        NeoForge.EVENT_BUS.addListener(AccessRegistry::onLogout);
        NeoForge.EVENT_BUS.addListener(AccessRegistry::onTick);
        NeoForge.EVENT_BUS.addListener(AccessRegistry::onTabName);
        if (FMLEnvironment.dist == Dist.CLIENT) {
            NeoForge.EVENT_BUS.addListener(ClientTabOverlay::onRender);
        }
        LOGGER.info("rareteam Auth initialized");
    }
}
