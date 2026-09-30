# Развёртывание рядом с Pterodactyl

## Что потребуется

- отдельный backend-сервер с Node.js 24;
- PostgreSQL 17 в отдельном Pterodactyl-сервере;
- постоянный каталог `data` для артефактов, скинов и плащей;
- read-only mount каталога `client-pack` игрового сервера;
- HTTPS-адрес для API, например `launcher-api.rarenetwork.ru`.

Игровой каталог и `client-pack` разделены намеренно: серверные моды могут ломать клиент, поэтому в синхронизируемую папку кладутся общие и клиентские моды, конфиги, ресурсы, libraries/runtime и `.rare-pack.json`.

## Подготовка секретов

На машине администратора:

```bash
node deploy/generate-env.mjs https://launcher-api.rarenetwork.ru play.rarenetwork.ru:25565 /var/lib/pterodactyl/volumes/SERVER_UUID/client-pack 'postgresql://USER:PASSWORD@POSTGRES_CONTAINER_IP:18081/melchior'
```

Команда создаёт игнорируемый Git-файл `deploy/.env` с паролями и Ed25519-ключами. Приватный ключ остаётся только у backend. Публичный ключ API отдаёт лаунчеру вместе с профилем.

## Docker Compose на узле Pterodactyl

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Для размещения контейнера внутри Pterodactyl нужно создать mount каталога `client-pack` и разрешить его только backend-серверу. Backend использует `DATABASE_URL` и при старте сам создаёт требуемые таблицы в PostgreSQL.

Текущий startup backend в Pterodactyl:

```bash
if [ ! -f .melchior-v2 ]; then tar -xzf rare-launcher-backend.tar.gz && npm install --omit=dev && touch .melchior-v2; fi; PORT=18080 node --env-file=.env dist/server.js
```

`PORT=18080` в startup намеренно имеет приоритет над `PORT=8080` из `.env`: это основная allocation backend-сервера. Архив обновления не должен содержать `.env`, иначе он перезапишет рабочие пароли и ключи. Перед установкой новой версии через этот startup нужно удалить `.melchior-v2`, загрузить новый архив и перезапустить сервер.

В текущей Pterodactyl-сети backend подключается к внутреннему адресу контейнера PostgreSQL. Published port через адрес хоста внутри `pterodactyl_nw` давал таймаут. Текущий адрес контейнера нельзя считать постоянным: после пересоздания контейнера проверьте его IP и обновите `DATABASE_URL`, либо назначьте стабильное имя/адрес в Docker-сети.

Для PostgreSQL-контейнера сейчас нужен startup с `nss_wrapper`, потому что Wings запускает его с UID 999 без записи в `/etc/passwd`. PostgreSQL также запускается с `-k /tmp`; доступ backend разрешён правилом `pg_hba.conf` для `172.18.0.0/16`.

На игровом сервере задаются `RARE_AUTH_URL`, `RARE_SERVER_ID=melchior-1` и `RARE_GAME_SERVER_KEY`. Последний равен `GAME_SERVER_KEY` из `deploy/.env`.

## Автоматическая синхронизация модов

Backend может читать клиентские `.jar` непосредственно из папки `/mods`
Minecraft-сервера через Pterodactyl Client API. Это надёжнее межконтейнерного
mount на установках Wings, где изменение mount не применяется к уже созданному
контейнеру.

Переменные backend:

```dotenv
PTERODACTYL_URL=https://pt.example.com
PTERODACTYL_API_KEY=<client-api-key>
PTERODACTYL_SERVER_ID=server-identifier
PTERODACTYL_MODS_DIRECTORY=/mods
```

На каждом цикле `PACK_POLL_SECONDS` backend:

1. получает список `.jar` в серверной папке;
2. скачивает новые и изменённые файлы в `PACK_SOURCE/mods`;
3. удаляет только ранее синхронизированные `.jar`, исчезнувшие на сервере;
4. публикует новую подписанную версию манифеста.

Ключ следует создавать отдельно для этой задачи и хранить только в `.env`
backend. Он никогда не должен попадать в Git.
