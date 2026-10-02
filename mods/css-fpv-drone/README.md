# rareteam FPV Drone for CSS v34

SourceMod-плагин для Survival Jim: игрок запускает управляемый FPV-дрон, видит картинку от первого лица и может подорвать его.

## Требования

- Counter-Strike: Source v34 server;
- MetaMod:Source;
- SourceMod 1.11+ с `sdktools` и `sdkhooks`.

## Установка

1. Скомпилируйте `addons/sourcemod/scripting/rareteam_fpv_drone.sp` через `spcomp`.
2. Положите `rareteam_fpv_drone.smx` в `cstrike/addons/sourcemod/plugins/`.
3. Скопируйте `cfg/sourcemod/rareteam_fpv_drone.cfg` в одноимённый каталог сервера.
4. Перезапустите сервер или выполните `sm plugins load rareteam_fpv_drone`.

Плагин использует стандартную модель `models/combine_scanner.mdl`; клиентам не нужны дополнительные файлы.

## Управление

- `!fpv` или `sm_fpv` — запустить дрон; повторная команда отменяет полёт;
- мышь — направление камеры и полёта;
- `WASD` — движение;
- `Пробел` / `Ctrl` — набор / снижение высоты;
- `ЛКМ` — подрыв;
- `ПКМ` — отмена без взрыва.

Во время полёта тело игрока остаётся на месте и уязвимо. При смерти игрока, окончании раунда или отключении дрон удаляется безопасно.

## Настройка

| CVar | По умолчанию | Назначение |
| --- | ---: | --- |
| `sm_fpv_enabled` | `1` | Включение плагина |
| `sm_fpv_speed` | `520` | Скорость полёта |
| `sm_fpv_health` | `60` | Запас прочности |
| `sm_fpv_lifetime` | `25` | Максимальное время полёта, сек. |
| `sm_fpv_cooldown` | `35` | Перезарядка, сек. |
| `sm_fpv_damage` | `180` | Максимальный урон взрыва |
| `sm_fpv_radius` | `300` | Радиус взрыва |
| `sm_fpv_maximum` | `4` | Общий лимит активных дронов |


## Production deployment

A push to `main` that changes `mods/css-fpv-drone/**` runs
`.github/workflows/css-fpv-production.yml`. It compiles the SMX, uploads the
plugin and configuration to the Survival Jim Pterodactyl server, restarts the
server and waits for the `running` state. Launcher and backend releases are not
triggered by CSS-only changes.
