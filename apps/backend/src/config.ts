import { z } from "zod";

const emptyAsUndefined = (value: unknown) => value === "" ? undefined : value;

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
  MINECRAFT_STATUS_ADDRESS: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  PTERODACTYL_URL: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  PTERODACTYL_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(20).optional()),
  PTERODACTYL_SERVER_ID: z.preprocess(emptyAsUndefined, z.string().regex(/^[a-z0-9-]+$/i).optional()),
  PTERODACTYL_MODS_DIRECTORY: z.string().default("/client-mods"),
  CONTROL_ALLOW_PUBLIC: z.preprocess((value) => value === true || value === "true", z.boolean()).default(false),
});

export const config = schema.parse(process.env);
