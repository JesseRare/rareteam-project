# Survival Jim CSS v34 integration

## Scope

The launcher supports the `survival-jim-css` profile at
`play.rarenetwork.ru:27015` and queries the server through A2S_INFO. The profile
is shown alongside Minecraft with live online/player/map status.

The repository does **not** contain Counter-Strike: Source executables or Valve
assets. A user selects an existing CSS v34 client directory containing
`hl2.exe` and `cstrike`. Before launch, the launcher copies only the rareteam-
owned theme layer from `apps/launcher/css-pack` and starts:

```text
hl2.exe -game cstrike +exec rareteam.cfg +connect play.rarenetwork.ru:27015
```

## Managed theme

- `cstrike/resource/GameMenu.res` — only Survival Jim connection and settings.
- `cstrike/materials/console/background01*.vtf` — rareteam background generated
  by `scripts/build-css-background.py`.
- `cstrike/cfg/rareteam.cfg` — project defaults without replacing `config.cfg`.

The launcher rejects missing client binaries and symlinked managed directories
before copying files. CSS launch is currently Windows-only.

## Access model

The CSS server does not require rareteam launcher or a rareteam ticket. Players may
connect directly from any compatible CSS v34 client. rareteam launcher is an
optional convenience for installing the rareteam theme and opening the client.
Minecraft ticket authentication remains separate and unchanged.


## FPV drone server plugin

`mods/css-fpv-drone` contains the SourceMod plugin `rareteam_fpv_drone.sp`.
It provides a first-person controllable drone with WASD/mouse flight,
vertical controls, health, lifetime, cooldown, collision, cancellation and an
explosive attack. The player's body remains stationary and vulnerable.

The plugin uses only a stock Source model and requires MetaMod:Source plus
SourceMod 1.11 or newer with `sdktools` and `sdkhooks`. Installation and CVars
are documented in `mods/css-fpv-drone/README.md`.
