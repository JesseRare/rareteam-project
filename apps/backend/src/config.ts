import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("0.0.0.0"),
  PUBLIC_URL: z.string().url().default("http://localhost:8080"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  GAME_SERVER_KEY: z.string().min(32),
  ARTIFACT_ROOT: z.string().default("./data/artifacts"),
  MANIFEST_PRIVATE_KEY: z.string().optional(),
  MANIFEST_PUBLIC_KEY: z.string().optional(),
  PACK_SOURCE: z.string().optional(),
  PACK_POLL_SECONDS: z.coerce.number().int().min(10).default(30),
  PACK_PROFILE_ID: z.string().regex(/^[a-z0-9._-]+$/i).default("survival"),
  PACK_TITLE: z.string().default("Мельхиор-1"),
  PACK_SUBTITLE: z.string().default("Minecraft 1.21.1 · NeoForge 21.1.252"),
  MINECRAFT_ADDRESS: z.string().default("play.rarenetwork.ru:25565"),
  MINECRAFT_STATUS_ADDRESS: z.string().optional(),
});

export const config = schema.parse(process.env);
