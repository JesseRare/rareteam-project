# Security review — 2026-10-01

Reviewed backend routes, Electron trust boundaries, pack synchronization,
process launch, uploads, deployment workflows and production dependencies.

## Fixed

- Refresh-token rotation is now an atomic consume operation, preventing two
  concurrent requests from reusing the same token.
- Fastify trusts forwarded addresses only from private/loopback proxy ranges,
  rather than trusting arbitrary proxy chains.
- Unexpected HTTP 500 responses no longer expose internal exception messages.
- Control panel scripts use a per-response CSP nonce; inline event attributes
  are forbidden. Admin authentication uses a 15-minute HttpOnly, Secure,
  SameSite=Strict cookie instead of browser localStorage tokens.
- Role icons validate the PNG signature in addition to MIME type and size.
- Game-server API keys are compared with `timingSafeEqual`.
- Electron main process fetches manifest URLs and public keys from the trusted
  production API; renderer input can no longer select an arbitrary signed pack.
- CSS theme installation rejects symlinked managed directories.
- Production dependency audit reports zero known vulnerabilities after updating
  `@fastify/static`.

## Existing protections verified

- Argon2id passwords, short JWT lifetime, hashed rotating refresh tokens.
- Atomic one-use game tickets with 90-second expiry.
- Ed25519 manifest signatures and SHA-256/size checks for every managed file.
- Relative-path validation and managed-file-only deletion.
- Electron sandbox, context isolation and disabled Node integration.
- Multipart limits and PNG header/dimension checks for cosmetics.

## Residual work

- Add integration tests with PostgreSQL for auth races, role hierarchy and bans.
- Add signing/notarization for macOS and Authenticode for Windows.
- If CSS roles/bans are added later, map them to a verified Steam identity without making RareLauncher mandatory.
