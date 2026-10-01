import type { FastifyPluginAsync } from "fastify";
import { db } from "../db.js";
import { config } from "../config.js";
import { queryMinecraft } from "../minecraft-status.js";
import { querySource } from "../source-status.js";
import { queryPterodactylRunning } from "../pterodactyl-status.js";

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const result = await db.query("select id,title,subtitle,address,manifest_version,manifest_path,manifest_public_key from profiles where enabled=true order by id");
    const minecraftProfiles = await Promise.all(result.rows.map(async (row) => {
      const status = await queryMinecraft(config.MINECRAFT_STATUS_ADDRESS ?? row.address);
      return {
        id: row.id,
        gameType: "minecraft" as const,
        title: row.title,
        subtitle: row.subtitle,
        version: "1.21.1",
        address: row.address,
        manifestUrl: `${config.PUBLIC_URL}/artifacts/${row.manifest_path}`,
        manifestPublicKey: row.manifest_public_key,
        ...status,
      };
    }));
    const queriedSourceStatus = await querySource(config.CSS_STATUS_ADDRESS ?? config.CSS_ADDRESS);
    const processRunning = queriedSourceStatus.online ? true : await queryPterodactylRunning(config.CSS_PTERODACTYL_SERVER_ID);
    const sourceStatus = queriedSourceStatus.online
      ? queriedSourceStatus
      : { ...queriedSourceStatus, online: processRunning === true, maxPlayers: processRunning === true ? 64 : 0, statusSource: "pterodactyl" };
    return [...minecraftProfiles, {
      id: "survival-jim-css",
      gameType: "source" as const,
      title: "SURVIVAL JIM SOUNDCLOUD SERVER",
      subtitle: "Counter-Strike: Source v34",
      version: "v34",
      address: config.CSS_ADDRESS,
      ...sourceStatus,
    }];
  });
};
