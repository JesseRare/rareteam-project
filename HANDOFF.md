# HANDOFF — rareteam launcher platform

**Updated:** 2026-10-02

**Repository:** `JesseRare/rareteam-project`

**Branch:** `main`

**Current source head when written:** the commit containing this document

This is the canonical concise handoff for humans and AI agents. Verify only facts that may have changed since this timestamp; do not repeat the old discovery work.

## 1. Product and architecture

rareteam is a custom game-platform stack. The active game is Minecraft server **Мельхиор-1**.

- **Launcher:** Electron/React desktop app named `rareteam`. Account auth, news feed, signed pack sync, Java 21 bootstrap, one-use game ticket, Minecraft/CSS launch and self-update.
- **Backend:** Fastify/PostgreSQL. Accounts, rotating sessions, profiles, signed artifact manifests, game tickets, cosmetics, dynamic roles, bans, audit log, LAN control panel and launcher release feeds.
- **Minecraft integration:** NeoForge mod `rare-auth` runs on client and server. It consumes game tickets, receives live access snapshots, enforces bans and renders the custom TAB overlay.
- **CSS v34 integration:** `survival-jim-css` exposes live A2S status and launches a user-provided base client with the rareteam-owned menu/theme layer. No Valve binaries are stored in Git.
- **Central access model:** role definitions, assignments and bans are global by default and can be scoped to a server. Only the Minecraft adapter exists today; the data model is intended for other games later.

Main public endpoints:

- API: `https://launcher-api.rarenetwork.ru`
- Minecraft: `play.rarenetwork.ru:25565`
- Health: `GET /health`

## 2. Current production state

### Backend

- Deployed and running in Pterodactyl.
- Health verified after the latest deployment.
- Public `/control/` intentionally returns 404.
- LAN control panel: `http://192.168.1.118:18080/control/`.
- Panel login JavaScript was previously blocked by Helmet CSP. Fixed in commit `4c02727` by setting a route-specific CSP; the fix is deployed.
- Backend startup marker is `.melchior-v3`; update archive name is `Мельхиор-1-backend-update.tar.gz`.
- Startup extracts the archive only when the marker is removed. Never overwrite production `.env`.

### Dynamic roles and moderation

Implemented:

- Discord-like role creation/editing: name, color, priority, permissions, scopes, TAB visibility and uploaded PNG icon.
- Role assignment with optional server scope and expiry.
- Global/server bans with expiry and audit logging.
- Bans revoke active refresh sessions; Minecraft polls access state and kicks newly banned users.
- Server-scoped ban requests now require a non-empty server ID, preventing silently unenforced bans.
- Exact username `jetarare` is idempotently assigned the system owner role (`*`) during backend migration.
- Role icons are PNG only, maximum 256 KiB, because the Minecraft client decodes them directly.

Relevant files:

- `apps/backend/src/access.ts`
- `apps/backend/src/db.ts`
- `apps/backend/src/routes/control.ts`
- `apps/backend/src/control-panel.ts`
- `apps/backend/src/routes/game.ts`
- `docs/CONTROL_SYSTEM.md`

### Minecraft mod

- Deployed version: `rare-auth 0.2.1`.
- JAR name: `rare_auth-0.2.1.jar`.
- SHA-256: `d2f699ff8226e9f5f54f18b62ee1a8ce5a7eb85857a29d650e17a2626f010f33`.
- Installed in server `/mods`, server `/client-mods`, and backend `client-pack/mods`.
- Minecraft restarted successfully; logs showed `rareteam Auth 0.2.1`, `rareteam Auth initialized`, and normal server readiness.
- Public client manifest includes the 0.2.1 JAR with the same SHA-256.
- TAB now renders only while the player-list key is held; the old version canceled the vanilla layer every frame and therefore stayed visible continuously.
- The 0.2.1 TAB is narrower and shorter, uses bordered column/row separators, and shows online users, primary role/icon, role ordering, colored ping, live TPS and available Minecraft JVM heap memory in the footer.

### Launcher UX and news

- Browsing the home page and server details is public; launching either Minecraft or CSS requires the same rareteam account.
- Login/registration is available from the top account menu, home hero, Minecraft profile and both server launch actions.
- The home page renders published news cards with optional PNG/JPEG/WebP images from `GET /v1/news/`.
- The LAN control panel has a permission-protected **Новости** section for creating drafts, publishing, editing, deleting and uploading images.
- Browser-like text selection and image dragging are disabled in the launcher UI; text remains selectable in form fields.
- The redundant four-cell home status strip and the inactive home launch bar were removed.

### Launcher releases

Manual baseline version: `0.2.0`. Automated releases use `0.3.<GitHub Actions run number>`.

GitHub release: `https://github.com/JesseRare/rareteam-project/releases/tag/v0.2.0`

Current corrected archives:

- `Melchior-1-0.2.0-macOS-arm64.zip`
- `Melchior-1-0.2.0-macOS-x64.zip`
- `Melchior-1-0.2.0-Windows-Portable-x64.zip`

Important release history:

- macOS archives preserve symlinks (`zip -y`); do not repack them with a tool that dereferences or drops symlinks.
- The first 0.2.0 macOS upload crashed because `electron-updater` was imported as an ESM named export even though it is CommonJS.
- Fixed in `bdbb04e` using the default import and destructuring. All macOS and Windows portable archives were rebuilt and replaced in the GitHub release.
- Corrected macOS release metadata and SHA-512 values are deployed on the backend.
- macOS feeds are architecture-specific:
  - `/artifacts/launcher/darwin-arm64/latest-mac.yml`
  - `/artifacts/launcher/darwin-x64/latest-mac.yml`
- Backend serves those YAML files and redirects ZIP downloads to the GitHub release from `apps/backend/src/routes/launcher-releases.ts`.
- First installation of 0.2.0 is manual. Later checks run after 5 seconds and every 30 minutes.

New automated releases use lowercase `rareteam` for the product, application/EXE, installer/archive filenames and release title. `Мельхиор-1` remains only the Minecraft server name. The 0.2.0 filenames below are historical.

Known release limitations:

- macOS builds are unsigned and not notarized. Gatekeeper may require:
  `xattr -dr com.apple.quarantine "/Applications/Melchior-1.app"`
- Reliable production macOS auto-install requires Apple Developer ID signing/notarization.
- GitHub Actions now builds native Windows NSIS + portable artifacts and macOS arm64/x64 archives after every push to `main`.
- Backend serves architecture-specific metadata from the latest GitHub Release, including `/artifacts/launcher/win32-x64/latest.yml`.
- Windows portable now has its own `latest-portable.json` channel, verifies size and SHA-512, replaces its own EXE after exit, and relaunches from the same path.
- Existing portable builds from before this change require one manual download of the first self-updating portable release; later portable updates are in-place.
- NSIS updates no longer auto-install on ordinary app exit. Stale pending installers are cleared at startup and before download, and same/older versions are rejected.

Relevant files:

- `apps/launcher/electron/updater.ts`
- `apps/launcher/package.json`
- `apps/backend/src/routes/launcher-releases.ts`
- `docs/LAUNCHER_UPDATES.md`

## 3. Pterodactyl inventory

Panel: `https://pt.rarenetwork.ru`

- Minecraft server ID: `176effbd`
- Backend API server ID: `a841f300`
- PostgreSQL server ID: `431ccdf1`

Observed infrastructure:

- Pterodactyl host: `192.168.1.118`
- Backend allocation: port `18080`
- Public API reverse proxy points to the backend allocation.

These IDs are identifiers, not credentials. Authentication tokens/API keys must stay outside Git.

## 4. Development commands

From repository root:

```bash
pnpm install
pnpm --filter @rare/launcher lint
pnpm --filter @rare/launcher test
pnpm --filter @rare/backend lint
pnpm --filter @rare/backend test
pnpm --filter @rare/backend build
```

Launcher renderer/Electron compile without packaging:

```bash
cd apps/launcher
pnpm exec tsc -b
VITE_API_URL=https://launcher-api.rarenetwork.ru pnpm exec vite build
```

Package macOS directories from Linux:

```bash
pnpm exec electron-builder --mac dir --x64 --arm64 --publish never
```

Then create symlink-preserving ZIPs from each `.app` directory using `zip -y`. A universal macOS app cannot be assembled by `@electron/universal` on Linux; keep separate x64 and arm64 feeds unless building on macOS.

Package Windows unpacked directory from Linux:

```bash
pnpm exec electron-builder --win dir --x64 --publish never
```

Creating NSIS or electron-builder portable targets on Linux requires Wine. The unpacked directory can be zipped as a portable distribution.

Build the mod:

```bash
cd mods/rare-auth
./gradlew build
```

## 5. Deployment notes

Backend production archive contains only:

- `dist/`
- standalone `package.json` without workspace dependency `@rare/contracts`
- `package-lock.json`

Production deployment pattern:

1. Build backend.
2. Create the small standalone archive locally.
3. Upload it to Pterodactyl root.
4. Replace `Мельхиор-1-backend-update.tar.gz`.
5. Remove `.melchior-v3` only for an intentional update.
6. Restart backend.
7. Verify Pterodactyl state and public `/health`.

The current startup command runs `npm install --omit=dev` when applying an archive. Do not package or upload `.env`.

Large release artifacts are stored in GitHub Releases. Backend release routes redirect there because Pterodactyl/reverse-proxy uploads returned HTTP 413 for large ZIP files.

## 6. Security invariants

Do not weaken these behaviors:

- Argon2id password hashes.
- Short-lived JWT access tokens and rotated refresh tokens.
- Refresh tokens stored hashed server-side and protected with Electron `safeStorage` client-side.
- Game tickets are SHA-256 hashed, one-use, and short-lived.
- Signed Ed25519 pack manifests.
- SHA-256 and size verification for every downloaded pack file.
- Path traversal rejection and managed-file-only deletion.
- Control panel restricted to private/loopback addresses unless explicitly configured otherwise.
- Owner and administrative actions enforced by permissions and written to audit log.

Never commit or expose:

- `DATABASE_URL`
- `JWT_SECRET`
- `GAME_SERVER_KEY`
- `MANIFEST_PRIVATE_KEY`
- Pterodactyl API keys
- passwords, access/refresh tokens, game tickets

## 7. Verified tests/builds

At the latest handoff:

- Launcher TypeScript lint passed.
- Launcher Vitest: 12 tests passed, including stale updater cache, portable metadata validation and version ordering.
- Launcher Vite build passed.
- Backend TypeScript lint passed.
- Backend Vitest passed: 10 unit tests.
- Backend PostgreSQL security integration suite passed: 6 tests covering refresh/game-ticket single use, admin cookies, role hierarchy/permission grants, server/global ban enforcement, and news publication with an uploaded image.
- Backend production build passed.
- Launcher release-route tests cover architecture-specific metadata, upstream failures, safe redirects and nested-path rejection.
- rare-auth 0.2.1 Gradle clean build passed; the JAR was deployed to all three required locations and verified in Minecraft logs and the public manifest.
- Corrected macOS and Windows ZIP integrity tests passed.
- Backend health and both macOS update YAML endpoints were verified after deployment.

Actual end-user verification still needed:

1. Launch corrected macOS build on Apple Silicon and Intel hardware.
2. Confirm login, update check, pack sync, Java download and Minecraft launch.
3. Log into the LAN control panel as `jetarare` and confirm owner permissions.
4. Hold and release TAB to confirm the 0.2.1 overlay no longer remains permanently visible; verify the compact grid, TPS, available RAM, role icon/order and ping.
5. Create a role with a PNG icon, assign it, and verify it in TAB.
6. Ban/unban a test account and verify live Minecraft enforcement.

## 8. Immediate next work

Priority order:

1. Test the first Survival Jim CSS v34 client launch on Windows using a clean base client directory.
2. Keep CSS direct-connect compatible; only add optional SteamID-based roles/bans if needed later.
3. Migrate Windows users from the extracted portable build to the NSIS installer once; later versions can auto-update.
4. Sign/notarize macOS builds and Authenticode-sign Windows builds.
5. Add real server metrics/history (TPS, MSPT, memory, uptime) to the control dashboard.
6. Add adapters for future non-Minecraft game servers while reusing global roles/bans.
7. Expand remaining control-panel tests around role icon uploads, assignment expiry and audit history.

## 9. Recent commits that explain current state

- `656983a` — make TAB key-bound and compact; add grid separators, TPS and available server JVM memory; bump rare-auth to 0.2.1.
- `bdbb04e` — fix CommonJS `electron-updater` import and corrected release hashes.
- `4c02727` — fix control-panel CSP/login behavior and distinct Windows artifact names.
- `6cde21a` — architecture-specific macOS update routes.
- `f70f6e6` — architecture-specific launcher feed selection.
- `81a8225` — harden LAN control panel and prepare launcher 0.2.0.
- `882ce75` — dynamic roles, moderation, TAB overlay and launcher updates.
- `895c1be` — separate client/server mod synchronization.
- `c940030` — macOS packaging corrections.

## 10. Handoff maintenance rule

Whenever a task changes production state, release files, architecture, known bugs, commands, or the next-step order:

1. update this document in the same commit;
2. remove superseded statements rather than preserving contradictory history;
3. keep exact hashes/IDs only when they are operationally useful and non-secret;
4. leave a clean `git status` and push to `main` when requested by the user.
