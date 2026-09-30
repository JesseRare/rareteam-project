import type { FastifyPluginAsync } from "fastify";
import { db } from "../db.js";
import { config } from "../config.js";
import { queryMinecraft } from "../minecraft-status.js";

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const result = await db.query("select id,title,subtitle,address,manifest_version,manifest_path,manifest_public_key from profiles where enabled=true order by id");
    return Promise.all(result.rows.map(async (row) => {
      // The public hostname may point back through NAT and be unreachable from
      // the Pterodactyl network. Allow a private probe address while keeping the
      // public address in the profile returned to players.
      const status = await queryMinecraft(config.MINECRAFT_STATUS_ADDRESS ?? row.address);
      return {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        address: row.address,
        manifestUrl: `${config.PUBLIC_URL}/artifacts/${row.manifest_path}`,
        manifestPublicKey: row.manifest_public_key,
        ...status,
      };
    }));
  });
};
