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

Продукт, исполняемый файл и новые артефакты называются `rareteam`:

- Windows: `rareteam-<version>-Windows-Setup-x64.exe`, portable EXE, blockmap и `latest.yml`;
- macOS: `rareteam-<version>-macOS-<arch>.zip`, blockmap и `latest-mac.yml`.

«Мельхиор-1» — название Minecraft-сервера, а не лаунчера.

Workflow `.github/workflows/launcher-release.yml` запускается после каждого push
в `main`, присваивает сборке версию `0.3.<GITHUB_RUN_NUMBER>`, собирает macOS
arm64/x64 и Windows x64 на нативных GitHub runners и публикует GitHub Release.

Backend получает архитектурные YAML-файлы из последнего GitHub Release и
перенаправляет скачивание больших файлов на GitHub. Поэтому в Pterodactyl не
нужно загружать архивы лаунчера.

Первая установка версии с поддержкой автообновлений выполняется вручную.
Windows-пользователи должны установить NSIS-версию: portable-сборка остаётся
для ручного запуска, но не является надёжной базой для автоматической установки
следующих версий.

Для production macOS приложение должно быть подписано Developer ID и нотарифицировано Apple. Для production Windows рекомендуется подпись Authenticode.

## Code signing status

Windows Setup and Portable artifacts are signed with the self-signed
`RareTeam Development Code Signing` certificate whose public DER certificate is
kept in `certificates/`. CI verifies that both artifacts contain that signature.
This provides a stable internal signer but is **not publicly trusted** and does
not remove Microsoft SmartScreen warnings. Production trust requires a CA-issued
Authenticode certificate.

macOS remains unsigned and cannot be notarized until an Apple Developer ID and
notarization credentials are available.
