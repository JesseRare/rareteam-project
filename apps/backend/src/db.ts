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
    create table if not exists role_definitions (
      id uuid primary key, slug varchar(64) not null unique, name varchar(64) not null,
      color varchar(7) not null default '#9ca3af', icon_key text,
      position integer not null default 0, permissions jsonb not null default '[]'::jsonb,
      scopes jsonb not null default '["global"]'::jsonb,
      display_in_tab boolean not null default true, is_system boolean not null default false,
      created_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table if not exists user_role_assignments (
      id uuid primary key, user_id uuid not null references users(id) on delete cascade,
      role_id uuid not null references role_definitions(id) on delete cascade,
      server_id varchar(64), expires_at timestamptz,
      granted_by uuid references users(id) on delete set null, reason text,
      created_at timestamptz not null default now()
    );
    create unique index if not exists user_role_assignment_uq
      on user_role_assignments(user_id, role_id, coalesce(server_id, ''));
    create table if not exists bans (
      id uuid primary key, user_id uuid not null references users(id) on delete cascade,
      scope varchar(16) not null default 'global' check (scope in ('global','server')),
      server_id varchar(64), reason text not null, evidence_url text,
      expires_at timestamptz, revoked_at timestamptz,
      created_by uuid references users(id) on delete set null,
      revoked_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create table if not exists launcher_releases (
      id uuid primary key, version varchar(32) not null,
      platform varchar(16) not null check (platform in ('win32','darwin','linux')),
      arch varchar(16) not null, channel varchar(16) not null default 'stable',
      url text not null, sha512 text, size_bytes bigint, notes text,
      mandatory boolean not null default false, published_at timestamptz not null default now(),
      unique(version, platform, arch, channel)
    );
    insert into role_definitions(id,slug,name,color,position,permissions,scopes,display_in_tab,is_system)
    values(
      '00000000-0000-4000-8000-000000000001','owner','Владелец','#f5c542',100000,
      '["*"]'::jsonb,'["global"]'::jsonb,true,true
    ) on conflict (slug) do update set is_system=true;
    insert into user_role_assignments(id,user_id,role_id,reason)
    select ('10000000-0000-4000-8000-' || substr(replace(u.id::text,'-',''),1,12))::uuid,
      u.id,'00000000-0000-4000-8000-000000000001','Первоначальный владелец rareteam'
    from users u where lower(u.username)='jetarare'
    on conflict do nothing;
    create index if not exists refresh_sessions_user_idx on refresh_sessions(user_id);
    create index if not exists game_tickets_token_idx on game_tickets(token_hash);
    create index if not exists user_role_assignments_user_idx on user_role_assignments(user_id);
    create index if not exists bans_user_idx on bans(user_id);
    create index if not exists audit_log_created_idx on audit_log(created_at desc);
  `);
}
