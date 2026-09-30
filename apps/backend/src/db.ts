import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });

function normalizeRow(row: any): any {
  if (typeof row.roles === "string") row.roles = JSON.parse(row.roles);
  return row;
}

export const db = {
  async query(sql: string, params: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const result = await pool.query(sql, params);
    return { rows: result.rows.map((row) => normalizeRow(row)), rowCount: result.rowCount ?? 0 };
  },
  async close() { await pool.end(); },
};

export async function migrate() {
  await pool.query(`
    create table if not exists users (
      id uuid primary key, username varchar(16) not null, email varchar(254) not null,
      password_hash text not null, minecraft_uuid uuid not null unique, roles jsonb not null default '["player"]'::jsonb,
      skin_key text, cape_key text, skin_model varchar(7) not null default 'classic' check (skin_model in ('classic','slim')),
      disabled_at timestamptz, created_at timestamptz not null default now()
    );
    create unique index if not exists users_username_lower_uq on users(lower(username));
    create unique index if not exists users_email_lower_uq on users(lower(email));
    create table if not exists refresh_sessions (
      id uuid primary key, user_id uuid not null references users(id) on delete cascade, token_hash text not null unique,
      expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
    );
    create table if not exists game_tickets (
      id uuid primary key, user_id uuid not null references users(id) on delete cascade, server_id varchar(64) not null,
      token_hash text not null unique, expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now()
    );
    create table if not exists profiles (
      id varchar(64) primary key, title text not null, subtitle text not null, address text not null,
      manifest_version text not null, manifest_path text not null, manifest_public_key text not null default '',
      enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table if not exists audit_log (
      id bigserial primary key, actor_id uuid references users(id) on delete set null,
      action text not null, target text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
    );
    create index if not exists refresh_sessions_user_idx on refresh_sessions(user_id);
    create index if not exists game_tickets_token_idx on game_tickets(token_hash);
  `);
}
