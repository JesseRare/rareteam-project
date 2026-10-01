# Автообновление лаунчера

Начиная с версии `0.2.0`, лаунчер использует `electron-updater`.

## Канал

Стабильные обновления публикуются раздельно для каждой платформы и архитектуры:

```text
https://launcher-api.rarenetwork.ru/artifacts/launcher/darwin-arm64/
https://launcher-api.rarenetwork.ru/artifacts/launcher/darwin-x64/
https://launcher-api.rarenetwork.ru/artifacts/launcher/win32-x64/
```

Лаунчер автоматически выбирает каталог `${process.platform}-${process.arch}`.

Лаунчер:

1. проверяет обновление через 5 секунд после запуска;
2. повторяет проверку каждые 30 минут;
3. автоматически скачивает новую версию;
4. предлагает перезапустить приложение;
5. устанавливает загруженную версию при закрытии.

## Файлы публикации

- Windows: NSIS-инсталлятор, blockmap и `latest.yml`;
- macOS: ZIP, blockmap и `latest-mac.yml`.

Файлы нужно размещать в соответствующем каталоге `${ARTIFACT_ROOT}/launcher/<platform>-<arch>`. Первая установка версии `0.2.0` выполняется вручную; последующие версии обновляются автоматически.

Для production macOS приложение должно быть подписано Developer ID и нотарифицировано Apple. Для production Windows рекомендуется подпись Authenticode.
