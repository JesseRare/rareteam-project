# Формат клиентской сборки

Каталог `client-pack` содержит ровно те файлы, которые должны оказаться у игрока. Серверные моды туда не кладутся. Файл `.rare-pack.json` управляет запуском и не отправляется клиенту как обычный файл.

```json
{
  "launch": {
    "javaPath": "runtime/bin/javaw.exe",
    "mainClass": "cpw.mods.bootstraplauncher.BootstrapLauncher",
    "classpath": [
      "libraries/cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar"
    ],
    "jvmArgs": ["-Xms1G", "-Xmx4G", "-Djava.net.preferIPv6Addresses=system"],
    "gameArgs": ["--username", "${auth_player_name}", "--uuid", "${auth_uuid}", "--gameDir", "${game_directory}"]
  }
}
```

Все пути в `classpath` и `javaPath` относительны корня сборки. Backend включает launch-профиль в подписанный манифест, поэтому клиент не исполнит подменённую команду. Одноразовый билет авторизации передаётся игре через `RARE_GAME_TICKET` и действует 90 секунд.
