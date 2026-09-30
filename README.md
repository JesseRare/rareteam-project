# RareLauncher

Самописная платформа запуска и обновления Minecraft для RareTeam.

## Состав

- `apps/launcher` — настольный лаунчер Electron/React.
- `apps/backend` — API авторизации, профилей, сборок и обновлений.
- `packages/contracts` — общие типы API и форматы манифестов.
- `deploy` — Docker/Pterodactyl-конфигурация.
- `mods/rare-auth` — общий клиент-серверный мод проверки одноразового игрового билета.
- `docs` — архитектура и карта совместимости с GravitLauncher.

## Разработка

```bash
pnpm install
pnpm dev:api
pnpm dev
```

Настройки окружения описаны в `.env.example` каждого приложения.

## Автообновление сборки

Backend опрашивает каталог `PACK_SOURCE` раз в 30 секунд. Когда содержимое меняется, он:

1. вычисляет SHA-256 каждого клиентского файла;
2. сохраняет неизменяемые объекты в `ARTIFACT_ROOT`;
3. атомарно публикует новый манифест, подписанный Ed25519;
4. обновляет версию профиля в PostgreSQL.

При заданных `PTERODACTYL_URL`, `PTERODACTYL_API_KEY` и
`PTERODACTYL_SERVER_ID` backend перед публикацией также синхронизирует `.jar`
из `/mods` Minecraft-сервера в `PACK_SOURCE/mods`.

В Pterodactyl каталог `client-pack` игрового сервера монтируется в контейнер backend только для чтения. Файлы, которые нужны только серверу, не следует класть в `client-pack`.
