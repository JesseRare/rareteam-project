import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { db } from "../db.js";

export const newsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const result = await db.query(`
      select id,title,summary,image_key,published_at
      from announcements
      where published=true and published_at is not null and published_at<=now()
      order by published_at desc,created_at desc
      limit 12
    `);
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      imageUrl: row.image_key ? `${config.PUBLIC_URL}/artifacts/${row.image_key}` : null,
      publishedAt: row.published_at,
    }));
  });
};
