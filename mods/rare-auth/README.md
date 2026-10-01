# RareTeam Auth

NeoForge 1.21.1 client-server authentication bridge for RareLauncher.

Authentication flow:

1. RareLauncher places a one-use ticket in `RARE_GAME_TICKET`.
2. The client mod sends the ticket during NeoForge's configuration phase.
3. The server mod consumes the ticket through the launcher backend.
4. Invalid, expired, reused or missing tickets are rejected before the player joins.

Server environment:

```text
RARE_AUTH_BACKEND_URL=https://launcher-api.rarenetwork.ru
RARE_AUTH_SERVER_ID=melchior-1
RARE_AUTH_SERVER_KEY=<same value as backend GAME_SERVER_KEY>
```

For Pterodactyl, the same values can be placed in
`config/rare-auth.properties`:

```properties
backend-url=https://launcher-api.rarenetwork.ru
server-id=melchior-1
server-key=<same value as backend GAME_SERVER_KEY>
```

System properties and environment variables take precedence over the file.
The server key must only exist in the Minecraft server environment. Never put it
in the client pack or launcher.

Build with Java 21:

```bash
./gradlew build
```
