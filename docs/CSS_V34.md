# Survival Jim CSS v34 integration

## Scope

The launcher supports the `survival-jim-css` profile at
`play.rarenetwork.ru:27015` and queries the server through A2S_INFO. The profile
is shown alongside Minecraft with live online/player/map status.

The repository does **not** contain Counter-Strike: Source executables or Valve
assets. A user selects an existing CSS v34 client directory containing
`hl2.exe` and `cstrike`. Before launch, the launcher copies only the RareTeam-
owned theme layer from `apps/launcher/css-pack` and starts:

```text
hl2.exe -game cstrike +exec rareteam.cfg +connect play.rarenetwork.ru:27015
```

## Managed theme

- `cstrike/resource/GameMenu.res` — only Survival Jim connection and settings.
- `cstrike/materials/console/background01*.vtf` — RareTeam background generated
  by `scripts/build-css-background.py`.
- `cstrike/cfg/rareteam.cfg` — project defaults without replacing `config.cfg`.

The launcher rejects missing client binaries and symlinked managed directories
before copying files. CSS launch is currently Windows-only.

## Access model

The CSS server does not require RareLauncher or a RareTeam ticket. Players may
connect directly from any compatible CSS v34 client. RareLauncher is an
optional convenience for installing the RareTeam theme and opening the client.
Minecraft ticket authentication remains separate and unchanged.
