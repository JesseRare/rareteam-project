# HANDOFF — RareTeam launcher platform / «Мельхиор-1»

Актуально на 2026-09-30. Этот документ составлен по фактическим исходникам и локальным артефактам workspace, а не только по README. Репозиторий локально **не является Git checkout** (в `rare-launcher` нет `.git`), поэтому историю изменений через Git восстановить нельзя.

## 1. Что это за проект

Это собственная игровая платформа RareTeam. Сейчас реализуется Minecraft-направление «Мельхиор-1»; в UI уже заложен будущий сервер Counter-Strike: Source «Каспер-3», но его мониторинг и загрузка сборки ещё не реализованы.

Основные компоненты:

- Launcher: portable Electron-приложение для Windows и ZIP-приложение для macOS. Авторизует игрока, получает профиль сервера, проверяет подписанный Ed25519-манифест, синхронизирует клиентские файлы, получает одноразовый игровой билет и запускает Minecraft.
- Backend/API: Fastify + PostgreSQL. Хранит аккаунты/сессии/профили, выдаёт JWT и game tickets, принимает скины/плащи, публикует и подписывает client-pack.
- Minecraft server: Minecraft 1.21.1 + NeoForge 21.1.252 в Pterodactyl. Публичный адрес `play.rarenetwork.ru:25565`.
- Infrastructure: Proxmox, Pterodactyl, PostgreSQL, NGINX reverse proxy и HTTPS API.

Связь компонентов:

1. Launcher обращается к `https://launcher-api.rarenetwork.ru`.
2. Backend возвращает профиль `melchior-1`, публичный ключ манифеста и URL манифеста.
3. Backend читает `PACK_SOURCE`, строит content-addressed артефакты в `ARTIFACT_ROOT`, подписывает manifest приватным Ed25519-ключом.
4. Launcher проверяет подпись, размер и SHA-256 каждого файла, затем скачивает только отсутствующие/изменённые файлы.
5. Launcher получает 90-секундный ticket и передаёт его игре через `RARE_GAME_TICKET`.
6. Предполагается, что серверный auth-мод поглотит ticket через `/v1/game/ticket/consume`. Сейчас этот end-to-end путь не завершён и мод не входит в текущую работу.

## 2. Важная структура директорий

Workspace: `C:\Users\youngpussydestroyer\Desktop\minecraft сборк`

```text
minecraft сборк/
├─ rare-launcher/                         # основной monorepo
│  ├─ apps/launcher/
│  │  ├─ electron/main.ts                # Electron main process + IPC
│  │  ├─ electron/preload.cts            # CommonJS preload / window.rare bridge
│  │  ├─ electron/sync.ts                # manifest verify + file sync
│  │  ├─ electron/launch.ts              # Minecraft process/args
│  │  ├─ electron/runtime.ts             # platform Java 21 downloader
│  │  ├─ src/App.tsx                     # главный React UI
│  │  ├─ src/api.ts                      # backend client/auth refresh
│  │  ├─ src/styles.css
│  │  ├─ src/additions.css
│  │  ├─ vite.config.ts
│  │  ├─ tsconfig*.json
│  │  └─ package.json
│  ├─ apps/backend/
│  │  ├─ src/server.ts                   # API entrypoint
│  │  ├─ src/config.ts                   # env schema
│  │  ├─ src/db.ts                       # pg Pool + startup migrations
│  │  ├─ src/pack-publisher.ts           # signed pack publication
│  │  ├─ src/minecraft-status.ts         # Minecraft status ping
│  │  ├─ src/routes/{auth,game,profiles,cosmetics}.ts
│  │  ├─ src/security.ts
│  │  ├─ src/cli/build-manifest.ts
│  │  └─ package.json
│  ├─ packages/contracts/src/index.ts    # shared API/manifest TypeScript types
│  ├─ scripts/build-client-pack.mjs      # новый builder Minecraft client-pack
│  ├─ client-pack/                       # готовый локальный pack, 0.89 GiB
│  ├─ .staging-client/                   # NeoForge installer staging/input
│  ├─ deploy/
│  │  ├─ Dockerfile.backend
│  │  ├─ docker-compose.yml
│  │  ├─ generate-env.mjs
│  │  ├─ .env.example
│  │  ├─ PTERODACTYL.md
│  │  ├─ egg-nodejs.json
│  │  ├─ egg-postgresql.json
│  │  └─ pterodactyl-backend/            # production archive staging
│  ├─ docs/{ARCHITECTURE,PACK_FORMAT,GRAVIT_PARITY}.md
│  ├─ package.json
│  ├─ pnpm-workspace.yaml
│  └─ pnpm-lock.yaml
├─ server/                               # локально подготовленный NeoForge server
│  ├─ libraries/
│  ├─ mods/
│  ├─ config/, defaultconfigs/
│  ├─ unix_args.txt, run.sh, run.bat
│  ├─ server.properties
│  ├─ eula.txt
│  └─ PTERODACTYL.md
├─ .setup/                               # локальные installer/runtime inputs
│  ├─ neoforge-installer.jar
│  ├─ neoforge-version.txt
│  └─ java21/                            # локальный Temurin JRE для установки
├─ Мельхиор-1-client-pack-1.21.1-neoforge-21.1.252.tar.gz
├─ Мельхиор-1-backend-update.tar.gz
└─ Мельхиор-1-Windows-x64.exe            # СТАРЫЙ EXE, без последних исправлений
```

`mods/rare-auth` намеренно не анализировался глубоко: моды сейчас вне scope.

## 3. Технологии и версии

- Node.js: production Dockerfile использует Node 24 Alpine; локально проверено `v24.16.0`.
- Package manager: pnpm 11.19.0, workspace `apps/*` + `packages/*`.
- TypeScript 5.9.x, ESM (`"type": "module"`); builder client-pack — JavaScript ESM.
- Launcher: Electron 38.1.x, React 19.1.x, Vite 7.1.x, electron-builder 26.x, electron-store 11.x, lucide-react.
- Backend: Fastify 5.6.x, `pg` 8.16.x, Zod 4.1.x, Argon2 0.44.x; plugins CORS, helmet, JWT, multipart, rate limit, static.
- Tests: Vitest 3.2.x.
- Database: PostgreSQL 17 по документации deployment; фактический код использует стандартный `pg.Pool`.
- Java: Java 21. Лаунчер скачивает Temurin 21 JRE из Adoptium отдельно для текущих OS/arch.
- Minecraft: 1.21.1, protocol 767 в status ping.
- NeoForge: 21.1.252; FML 4.0.44; NeoForm `20240808.144430` в launch args.
- Container/deploy: Docker Compose и Pterodactyl. Minecraft image: `ghcr.io/ptero-eggs/yolks:java_21`.

## 4. Запуск компонентов

### Launcher

- Working directory: `C:\Users\youngpussydestroyer\Desktop\minecraft сборк\rare-launcher`
- Install: `pnpm install`
- Dev: `pnpm dev` или `pnpm --filter @rare/launcher dev`
- Lint/typecheck: `pnpm --filter @rare/launcher lint`
- Tests: `pnpm --filter @rare/launcher test`
- Build/package: `pnpm --filter @rare/launcher build`
- Output targets: portable Windows EXE и macOS ZIP из `apps/launcher/package.json`.
- Required build-time env: `VITE_API_URL=https://launcher-api.rarenetwork.ru`.
- Dev Vite port: `5173`.
- Production launcher не слушает входящий порт.

Важно: текущий production EXE в корне старый. Новая сборка не завершилась из-за исчерпанного Windows commit/pagefile (`Zone Allocation failed` / error 1455), а не из-за TypeScript errors. До упаковки проверить, что Electron binary установлен: `pnpm-workspace.yaml` сейчас содержит `electron: false` в `allowBuilds`, а локальный `node_modules/electron/dist` отсутствовал при последней проверке.

### Backend/API

- Working directory: тот же monorepo root или `apps/backend`.
- Install: `pnpm install`; standalone production archive использует `npm install --omit=dev`.
- Dev: `pnpm dev:api` или `pnpm --filter @rare/backend dev`.
- Build: `pnpm --filter @rare/backend build`.
- Tests: `pnpm --filter @rare/backend test`.
- Production: `node --env-file=.env dist/server.js`.
- Default port: 8080; actual Pterodactyl allocation: 18080.
- Health: `GET /health`.

Pterodactyl startup, фактически сообщённый как рабочий (он новее текста в `deploy/PTERODACTYL.md`):

```sh
if [ ! -f .melchior-v3 ]; then tar -xzf "Мельхиор-1-backend-update.tar.gz" && npm install --omit=dev && touch .melchior-v3 || exit 1; fi; exec env PORT="${SERVER_PORT}" node --env-file=.env dist/server.js
```

Env backend:

- required: `DATABASE_URL`, `JWT_SECRET` (>=32 chars), `GAME_SERVER_KEY` (>=32 chars)
- public/network: `HOST`, `PORT`, `PUBLIC_URL`, `MINECRAFT_ADDRESS`, optional `MINECRAFT_STATUS_ADDRESS`
- pack: `PACK_SOURCE`, `ARTIFACT_ROOT`, `PACK_POLL_SECONDS`, `PACK_PROFILE_ID`, `PACK_TITLE`, `PACK_SUBTITLE`, `MANIFEST_PRIVATE_KEY`, `MANIFEST_PUBLIC_KEY`
- Compose-only host mount helper: `PACK_SOURCE_HOST`

## 5. Backend/API

Entrypoint: `apps/backend/src/server.ts` → compiled `apps/backend/dist/server.js`.

Startup order:

1. Create Fastify with logger, `trustProxy`, 2 MiB body limit.
2. Register helmet/CORS/rate-limit/JWT/multipart/static files.
3. Register routes.
4. Run `migrate()` from `src/db.ts`.
5. Start periodic pack publisher.
6. Listen on `HOST:PORT`.

Routes:

- `GET /health` — health check.
- `POST /v1/auth/register` — username/email/password, Argon2id, offline-style Minecraft UUID.
- `POST /v1/auth/login` — username or email + password.
- `POST /v1/auth/refresh` — rotates refresh session; new access/refresh pair.
- `GET /v1/auth/me` — authenticated current user; launcher currently does not call it.
- `POST /v1/auth/logout` — revokes refresh token.
- `GET /v1/profiles/` — enabled profiles + manifest URL/key + live status.
- `POST /v1/game/ticket` — JWT required, creates one-use 90-second ticket.
- `POST /v1/game/ticket/consume` — server-only endpoint protected by `x-server-key`.
- `POST /v1/cosmetics/skin` — JWT, PNG 64x64 or 64x32.
- `POST /v1/cosmetics/cape` — JWT, PNG 64x32 or 22x17.
- `PATCH /v1/cosmetics/skin-model` — JWT, `classic|slim`.
- `GET /artifacts/*` — manifests, objects, skins, capes; immutable cache 1 year.

Auth flow:

- Access JWT: 15 minutes.
- Refresh token: random 48 bytes, DB stores only SHA-256 hash, expires in 30 days.
- Every refresh revokes old refresh row and creates a new one.
- Launcher retries authorized request once after HTTP 401 by refreshing.
- Launcher stores serialized token response through Electron `safeStorage` in `session.bin`.

Database layer: one `pg.Pool`, max 10 connections, 30-second idle timeout. No migration framework and no numbered migration files; idempotent `CREATE TABLE/INDEX IF NOT EXISTS` executes on every API startup.

Pack publishing (`apps/backend/src/pack-publisher.ts`):

- Reads all files under `PACK_SOURCE`, except `.rare-pack.json` itself.
- `.rare-pack.json` contributes signed launch config.
- Sorts paths and computes SHA-256/size.
- Pack version = first 16 hex chars of SHA-256 over launch config and file metadata.
- Stores objects as `profiles/<profile>/objects/<sha-prefix>/<sha>`.
- Writes and atomically renames signed `manifest.json`.
- Upserts `profiles` row even when files did not change, so DB reset does not hide an existing pack.
- Poll interval defaults to 30 seconds.

Launcher actually uses: register/login/refresh/logout, profiles, game ticket, skin/cape/model, artifact manifest/objects. It does not currently call `/auth/me` or `/game/ticket/consume` directly.

## 6. Launcher

Entrypoints:

- Renderer: `apps/launcher/src/main.tsx` → `App.tsx`.
- Electron main: `apps/launcher/electron/main.ts`.
- Preload: `apps/launcher/electron/preload.cts`, compiled as `preload.cjs`.

Architecture/security:

- Frameless 1180x760 window; now `resizable:false`, `maximizable:false`.
- `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`.
- Renderer receives a narrow `window.rare` IPC bridge.
- External windows only allow `https://` and open through system browser.

UI state:

- Top navigation: `Главная`, `Мельхиор-1`, placeholder `Каспер-3`.
- Brand now shows logo + `RARETEAM`, not `MELCHIOR`.
- Home is project-level; Minecraft page contains build/status/launch; CSS is placeholder only.
- Profiles are polled every 30 seconds.

Login flow:

1. `restoreSession()` loads encrypted session via IPC.
2. Refresh token is immediately rotated through `/v1/auth/refresh`.
3. Login/register saves the complete `AuthTokens` JSON through `safeStorage`.
4. `App.play()` now distinguishes missing session, missing profile and missing preload bridge.

Update/download flow (`electron/sync.ts`):

1. Fetch manifest from profile.
2. Validate schema/file paths and verify Ed25519 signature.
3. Compare local file size, then SHA-256.
4. Resume `.part` downloads with HTTP Range; restart if server does not return 206.
5. Verify final size and SHA-256, then atomic rename.
6. Remove only files listed in the previous managed state and absent from new manifest.
7. Write `.rare-launcher-state.json` and `.rare-manifest.json`.

Local state:

- Settings: `electron-store`; fields `memoryMb` and optional custom `gameRoot`.
- Default instance root: `app.getPath("userData")/instances/<profileId>`.
- Session: encrypted `app.getPath("userData")/session.bin` via Electron `safeStorage`.
- Launch log: `<instance>/logs/latest-launcher.log`.
- Java runtime cache: `<instance>/.runtime/<platform>-<architecture>`.

Java (`electron/runtime.ts`):

- Supports only Windows/macOS.
- Maps `x64` and `arm64→aarch64`.
- Downloads latest Temurin JRE 21 metadata/package from Adoptium.
- Verifies package SHA-256 before extraction.
- Windows extraction uses `powershell.exe Expand-Archive`; macOS uses `tar -xzf`.
- Java is deliberately outside signed pack to avoid shipping a Windows-only JRE to macOS.

Minecraft launch (`electron/launch.ts`):

- Re-verifies locally stored signed manifest before executing launch config.
- Resolves classpath relative to instance and rejects unsafe paths.
- Expands placeholders for game/assets/natives/libraries/user/UUID/ticket/version/server host+port.
- Removes manifest-provided Xms/Xmx and applies UI memory setting (`-Xms512M`, `-Xmx...`).
- Adds `-XstartOnFirstThread` on macOS.
- Passes `RARE_GAME_TICKET` and `RARE_SERVER_ADDRESS` in process environment.
- Spawns Java hidden with stdout/stderr written to launcher log.

Installer/updater logic is not a separate installer: electron-builder target is portable. Content updater is `sync.ts`; Java bootstrapper is `runtime.ts`; pack generator is `scripts/build-client-pack.mjs`.

## 7. Server / infrastructure

Known actual infrastructure:

- Proxmox panel: `https://pve.rarenetwork.ru:8006`
- VM 102 `ptero`: `192.168.1.118`
- LXC 101 `nginx`: `192.168.1.137`
- Pterodactyl backend server ID `a841f300`, allocation `18080`, internal observed/configured address `172.18.0.5:18080`.
- PostgreSQL server ID `431ccdf1`, internal observed/configured address `172.18.0.4:18081`, DB `melchior`.
- Minecraft server ID `176effbd`, allocation/public port `25565`.
- Public API `https://launcher-api.rarenetwork.ru` → NGINX → `http://192.168.1.118:18080`.
- Public game server `play.rarenetwork.ru:25565` is forwarded separately.
- API TLS certificate was reported valid through 2026-12-29 with Certbot renewal enabled.
- Backend port 18080 does not need Internet router forwarding; only NGINX 443 reaches it.

Minecraft local source is `C:\Users\youngpussydestroyer\Desktop\minecraft сборк\server`. It contains installed NeoForge libraries and run args. `server.properties` has survival, normal difficulty, max 20, view 8, simulation 6, `online-mode=true`, query disabled. Local `eula.txt` remains `eula=false`; production server was reported running separately.

PostgreSQL Pterodactyl workaround: container runs UID 999, uses `nss_wrapper`, starts PostgreSQL with socket directory `-k /tmp`, and `pg_hba.conf` includes `host all all 172.18.0.0/16 trust`. Backend still authenticates through `DATABASE_URL`; do not infer that production password is absent.

Production files:

- backend archive: `C:\Users\youngpussydestroyer\Desktop\minecraft сборк\Мельхиор-1-backend-update.tar.gz` (new, 8,769 bytes, contains `dist/` + `package.json`, no `.env`).
- client pack archive: `C:\Users\youngpussydestroyer\Desktop\minecraft сборк\Мельхиор-1-client-pack-1.21.1-neoforge-21.1.252.tar.gz` (new, 852,154,260 bytes).
- current EXE: `C:\Users\youngpussydestroyer\Desktop\minecraft сборк\Мельхиор-1-Windows-x64.exe` (old, not rebuilt with latest source).

## 8. Текущее состояние разработки

### WORKING

- Public API and HTTPS were previously verified: `/health`, `/v1/profiles/`, manifest.
- Backend register/login/refresh/logout code and PostgreSQL persistence exist.
- Backend lint/build/tests passed in the last session.
- Signed content-addressed pack publication exists.
- Launcher source typecheck passed after latest changes.
- NeoForge installer successfully generated client files in `.staging-client` in low-memory mode.
- Full local `client-pack` exists: 4,034 files, 952,093,932 bytes (0.89 GiB), 3,888 assets, 125 library files, 8 Windows natives, 9 macOS natives; every generated classpath entry existed during validation.
- New backend and client-pack archives exist locally and are ready for manual upload.
- Pterodactyl panel login/session works and showed backend, DB and Minecraft servers.

### PARTIALLY WORKING

- Launcher auth HTTP flow worked in old EXE, but old preload was broken; source fix exists but is not packaged.
- Server status ping code exists; local public-host probe returned offline while Pterodactyl showed Minecraft running. Optional private `MINECRAFT_STATUS_ADDRESS` was added but is not deployed/tested.
- Java 21 platform downloader compiles but has not been tested end-to-end inside packaged Windows/macOS builds.
- Client-pack was structurally validated but Minecraft was not actually launched from it.
- CSS/Kasper-3 UI tab exists only as placeholder.

### BROKEN

- Latest launcher source is not present in a new EXE. The root EXE predates preload/UI/runtime fixes.
- Production backend still has the old almost-empty client-pack until the user uploads/extracts the 812.7 MiB archive.
- Current `online-mode=true` Minecraft authentication is incompatible with the launcher's custom/offline UUID + non-Microsoft access token unless the auth mod/proxy integration takes over authentication. A vanilla online-mode connection will likely fail session validation.
- macOS package has not been built or tested.

### TODO

1. Build a fresh Windows EXE after freeing Windows commit/pagefile and ensuring Electron binary is installed.
2. Upload/extract client-pack manually on backend Pterodactyl and allow publisher to generate new manifest.
3. Deploy new backend archive and add `MINECRAFT_STATUS_ADDRESS=192.168.1.118:25565` (verify address from backend container first).
4. Test fresh launcher profile: login → 0.89 GiB download → Java 21 download → actual NeoForge process.
5. Inspect `latest-launcher.log`, correct classpath/NeoForge args if needed.
6. Decide temporary authentication strategy: secure rare-auth implementation is preferred; `online-mode=false` is only an insecure temporary diagnostic.
7. Only after Windows succeeds, build/test macOS x64 and arm64.

### KNOWN BUGS

- Old EXE: minimize/close and play bridge fail because preload was emitted as ESM `preload.js` but Electron sandbox preload did not load it. Source now uses `preload.cts`→`preload.cjs`.
- Old EXE: clicking Play after visible login reports that login/profile is missing; same root cause (`window.rare` undefined).
- Status can falsely show offline due to public-host hairpin/NAT/container routing; private probe env added but not deployed.
- Launcher build/test Vite phase failed under current machine memory pressure (`Zone Allocation failed`, Windows error 1455). TypeScript lint itself passed.
- `deploy/PTERODACTYL.md` still mentions `.melchior-v2`/older archive name; actual production startup uses `.melchior-v3` and `Мельхиор-1-backend-update.tar.gz`.

## 9. Последние изменения

Recently changed source:

- `apps/launcher/electron/preload.ts` removed; `preload.cts` added so TypeScript emits CommonJS `preload.cjs` compatible with sandbox preload.
- `apps/launcher/electron/main.ts`: points to `preload.cjs`; window made non-resizable/non-maximizable.
- `apps/launcher/tsconfig.node.json`: includes `.cts`.
- `apps/launcher/src/App.tsx`: RareTeam global navigation, Home/Melchior/Kasper sections, clearer play errors, 30-second profile refresh.
- `apps/launcher/src/additions.css`: placeholder/disabled styles.
- `apps/launcher/electron/runtime.ts`: new verified platform Java 21 downloader.
- `apps/launcher/electron/launch.ts`: Java resolver, full placeholder expansion, macOS JVM flag, server host/port args.
- `apps/backend/src/config.ts`: optional `MINECRAFT_STATUS_ADDRESS`.
- `apps/backend/src/routes/profiles.ts`: status probe can use private address while public profile address remains unchanged.
- `deploy/.env.example`, `deploy/generate-env.mjs`: status address entry.
- `scripts/build-client-pack.mjs`: reproducible library/assets/native/client-pack builder.
- root `package.json`: `build:client-pack` script.

Generated/rebuilt:

- `client-pack/` full local pack.
- `.staging-client/` successful NeoForge client install.
- `Мельхиор-1-client-pack-1.21.1-neoforge-21.1.252.tar.gz`.
- `Мельхиор-1-backend-update.tar.gz`.
- backend `dist/` and `deploy/pterodactyl-backend/dist/`.

Not finished: launcher renderer/package build, production uploads, real game launch, auth-to-server integration test.

## 10. Важные архитектурные решения

- Manifest is signed; do not bypass signature verification to “make it work”. Public key travels in profile, private key stays only on backend.
- File URLs are content-addressed by SHA-256 and served immutable. Changing a pack creates new objects/manifest version.
- `.rare-pack.json` is control metadata, not a downloaded client file, but it is included in version hashing/signature through `launch`.
- Launcher only deletes previously managed files; this protects saves, screenshots, logs and user files.
- Java runtime is platform-specific and intentionally outside common pack.
- Public Minecraft address and internal status-probe address are separate by design.
- Session secrets are encrypted locally with OS-backed Electron `safeStorage`; do not replace with plaintext localStorage.
- DB migrations are embedded startup SQL. Schema changes must stay idempotent or introduce a proper migration system carefully.
- Backend archives must never contain/overwrite production `.env`.
- Game tickets are hashed, one-use and 90 seconds; do not make them reusable just to simplify integration.

Temporary/hard-coded dependencies to revisit:

- Minecraft version, NeoForge version, asset index `17`, launcher version and version name are hard-coded in `launch.ts`/builder.
- Builder currently targets Windows x64 plus a union of macOS native variants; actual macOS architectures are untested.
- UI uses the first profile returned by `/v1/profiles/`; it is not a general multi-profile selector yet.

## 11. Workarounds / костыли / technical debt

- NeoForge installer was run through mapped drive `R:` because elevated Java failed on the Cyrillic workspace path; low-memory JVM options were required (`-Xmx384m`, SerialGC, limited metaspace).
- Pterodactyl PostgreSQL uses `nss_wrapper` for UID 999 and Unix socket `/tmp`.
- `pg_hba.conf` trusts the whole Pterodactyl `172.18.0.0/16` network; this is convenient but broad.
- PostgreSQL container IP is not guaranteed stable; current `172.18.0.4` can change after recreation.
- Status private address is hard-coded by env generator as `192.168.1.118:25565`; validate network reachability before trusting it.
- Pterodactyl backend has a 2 GiB disk allocation as observed in panel. Pack source and published artifacts duplicate roughly 0.89 GiB, so headroom is tight; increase to 3–4 GiB before future larger packs.
- Client-pack upload automation failed because the in-app browser did not expose Pterodactyl's hidden file input/file chooser. User must upload the archive manually.
- `@tanstack/react-query` is installed but current `App.tsx` uses direct React state/fetch helpers.
- `pnpm-workspace.yaml` disables Electron install scripts, while packaging needs an Electron distribution. Validate this before rebuilding.

## 12. Database

Database: PostgreSQL database `melchior`. The actual username/password are secret and only appear inside production `DATABASE_URL`; never copy them into source or this document.

Tables created by `migrate()`:

- `users`: UUID id, case-insensitive unique username/email indexes, Argon2 hash, unique `minecraft_uuid`, JSONB roles, skin/cape keys, skin model, disabled/created timestamps.
- `refresh_sessions`: UUID id, user FK cascade, unique token hash, expiry/revocation/created timestamps.
- `game_tickets`: UUID id, user FK cascade, server id, unique token hash, expiry/consumed/created timestamps.
- `profiles`: profile id, title/subtitle/address, manifest version/path/public key, enabled flag, timestamps.
- `audit_log`: bigserial id, optional actor FK, action/target/metadata/timestamp.

Indexes: lowercase unique username/email, refresh session by user, game ticket token hash.

Startup migrations are only `CREATE ... IF NOT EXISTS`; they cannot alter an old incompatible column automatically. There is no migrations history table.

Required DB env: `DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/melchior`.

Recently solved DB issues:

- Backend was migrated from obsolete SQLite assumptions to PostgreSQL/`DATABASE_URL`.
- Profile row is recreated after DB reset even if pack files/version are unchanged.
- Container-network connection uses PostgreSQL internal address, not host published address.
- UID 999 startup required `nss_wrapper` and `/tmp` socket.

## 13. Deployment

Backend current deployment:

- Pterodactyl server `a841f300`, port/allocation 18080.
- Files expected at `/home/container`: `.env`, `package.json`, `dist/`, installed `node_modules/`, `client-pack/`, `data/artifacts/`, marker `.melchior-v3`, update archive.
- Startup command shown in section 4.
- Server log was previously reported: `Server listening at http://172.18.0.5:18080` and `Pack is published`.

Docker alternative:

- `deploy/Dockerfile.backend`: Node 24 Alpine multi-stage build.
- `deploy/docker-compose.yml`: API at 8080 inside compose, named artifact volume, read-only pack mount.
- Compose currently does not pass `MINECRAFT_STATUS_ADDRESS`; add it if Compose deployment is used.

Manual deployment still required:

1. In Pterodactyl backend Files, upload `Мельхиор-1-client-pack-1.21.1-neoforge-21.1.252.tar.gz` (812.7 MiB).
2. Stop backend before changing pack.
3. Extract archive in `/home/container`; it contains top-level `client-pack/`.
4. Delete the uploaded compressed archive after successful extraction to stay under disk quota.
5. Add `MINECRAFT_STATUS_ADDRESS=192.168.1.118:25565` to existing server `.env` only after verifying the backend container can reach it. Do not replace `.env` wholesale.
6. Upload `Мельхиор-1-backend-update.tar.gz`.
7. Remove `.melchior-v3` only when intentionally triggering update extraction, then restart. This is a deployment action, not needed on every boot.
8. Watch console for `Pack is published`; first publish hashes/copies ~0.89 GiB and can take time.
9. Verify public `/v1/profiles/` manifest now contains ~4,034 files, not only `.keep`.
10. Increase backend disk quota if publication approaches 2 GiB.

## 14. Секреты

Never commit, print or include values for:

- `DATABASE_URL`
- `JWT_SECRET`
- `GAME_SERVER_KEY`
- `MANIFEST_PRIVATE_KEY`
- any production PostgreSQL password/user secret
- auth access/refresh tokens or game tickets

`MANIFEST_PUBLIC_KEY` is public by design but should still be sourced from the correct production pair. `deploy/generate-env.mjs` refuses to overwrite an existing `deploy/.env`; preserve that safety behavior.

## 15. Следующие шаги в правильном порядке

1. Free Windows commit/pagefile by closing memory-heavy apps or rebooting; do not kill unrelated Codex/browser processes blindly.
2. Fix/confirm Electron installation policy, then run launcher lint/test/build. Confirm output contains `dist-electron/electron/preload.cjs` and main points to it.
3. Launch unpacked/package build and verify minimize, close, non-resizable window, persisted login and navigation before distributing EXE.
4. Manually deploy backend archive + client-pack using the exact order in section 13; leave production `.env` untouched except deliberate single-variable edit.
5. Verify new public manifest count/size/signature and server status from the public API.
6. On a clean Windows profile, test complete download and automatic Java 21 installation.
7. Attempt actual NeoForge launch. Read `<instance>/logs/latest-launcher.log`; validate main class, module path, classpath and natives.
8. Resolve authentication architecture before claiming server join works: complete/verify rare-auth or a secure proxy-compatible solution. Do not silently disable online authentication in production.
9. Run a real join test to `play.rarenetwork.ru:25565` with a fresh ticket and verify one-time consume.
10. Only then build/test macOS x64/arm64 and adjust native/classpath selection.
11. After Minecraft path is stable, implement Kasper-3 monitoring and CSS build download as a separate profile/type rather than overloading Minecraft manifest assumptions.

## 16. READ THIS FIRST

1. The root Windows EXE is old and does **not** include latest fixes.
2. Latest source typechecks; packaging failed because Windows ran out of commit/pagefile, not because of a reported TS error.
3. Old minimize/close/play failures share one root cause: broken ESM preload. Source now uses `preload.cts` → `preload.cjs`.
4. A complete local Minecraft client-pack already exists; do not redownload 3,888 assets unless validation shows corruption.
5. Ready archive: `C:\Users\youngpussydestroyer\Desktop\minecraft сборк\Мельхиор-1-client-pack-1.21.1-neoforge-21.1.252.tar.gz`.
6. Ready backend archive: `C:\Users\youngpussydestroyer\Desktop\minecraft сборк\Мельхиор-1-backend-update.tar.gz`; it contains no `.env`.
7. The large upload was intentionally left to the user because browser automation could not attach the file.
8. Never overwrite production `.env`; it contains real DB credentials and signing/auth keys.
9. Actual production startup uses `.melchior-v3`, even though `deploy/PTERODACTYL.md` still says v2.
10. Backend pack source and published artifacts duplicate about 0.89 GiB; the observed 2 GiB disk quota is tight.
11. Public API/NGINX previously worked, but the new pack/backend have not been deployed.
12. Server monitoring still needs a deployed/verified private `MINECRAFT_STATUS_ADDRESS`.
13. The game launch generated by the new pack has never completed a real end-to-end run; treat classpath/args as unverified.
14. `online-mode=true` plus custom/offline identities is a hard authentication blocker without working server-side auth integration.
15. Game tickets are one-use, SHA-256-hashed in DB and expire after 90 seconds; preserve this behavior.
16. Manifest verification/signing and safe path checks are security boundaries; do not bypass them.
17. PostgreSQL schema is created at startup from `apps/backend/src/db.ts`; there is no external migration tool.
18. PostgreSQL internal container IP and `nss_wrapper` setup are infrastructure workarounds and may change after container recreation.
19. CSS/Kasper-3 is only a UI placeholder; no backend profile/download/monitoring exists for it.
20. Mods are out of current scope, except that auth cannot be considered complete until server-side ticket consumption is integrated.
