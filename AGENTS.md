# AGENTS.md — rareteam project instructions

Read this file first, then `HANDOFF.md`. The handoff is the canonical current-state snapshot; do not reconstruct project history unless something is missing.

## Non-negotiable conventions

- Brand spelling is always lowercase: `rareteam`.
- Never commit or print secrets: `.env`, database credentials, JWT/game keys, Pterodactyl API keys, signing private keys, access/refresh tokens, or game tickets.
- Preserve signed-manifest verification, SHA-256 checks, safe path validation, one-use game tickets, and refresh-token rotation. Do not disable security to make a test pass.
- Load existing code and docs before editing. Prefer the smallest targeted change.
- Run the relevant lint/tests/build before committing.
- Commit successful changes to `main` immediately when the user requests continuous commits.
- After any material architecture, deployment, release, or known-state change, update `HANDOFF.md` in the same commit. Keep it concise and replace stale facts instead of appending a session transcript.
- Generated release directories, credentials, production `.env`, and local runtime data do not belong in Git.

## Repository map

- `apps/launcher` — Electron 38 + React/Vite desktop launcher.
- `apps/backend` — Fastify + PostgreSQL API, control panel, artifacts, roles/bans, launcher release feeds.
- `packages/contracts` — shared TypeScript contracts.
- `mods/rare-auth` — NeoForge 1.21.1 client/server auth and TAB overlay mod.
- `docs` — focused architecture/control/update documentation.
- `deploy` — Docker/Pterodactyl deployment material.

## Standard validation

```bash
pnpm --filter @rare/launcher lint
pnpm --filter @rare/launcher test
pnpm --filter @rare/backend lint
pnpm --filter @rare/backend test
pnpm --filter @rare/backend build
cd mods/rare-auth && ./gradlew build
```

For release mechanics and production state, use `HANDOFF.md`; it intentionally contains the details most likely to save another agent time.
