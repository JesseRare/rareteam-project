# RareTeam Auth

NeoForge 1.21.1 client-server authentication bridge for RareLauncher.

Planned flow:

1. RareLauncher places a one-use ticket in `RARE_GAME_TICKET`.
2. The client mod sends the ticket during NeoForge's configuration phase.
3. The server mod consumes the ticket through the launcher backend.
4. Invalid, expired, reused or missing tickets are rejected before the player joins.

Build with Java 21:

```bash
./gradlew build
```
