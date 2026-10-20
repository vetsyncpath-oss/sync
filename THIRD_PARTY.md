# Происхождение заимствованного кода

Из пользовательского архива `sync-main-overhaul-o8 (2).zip` переиспользованы:

- `src/auth/google-auth.ts` — Google token exchange/refresh, проверка account subject, ограничение endpoint для Bearer-токена.
- `src/adapters/google-desktop-oauth.ts` — desktop loopback OAuth callback, state, PKCE и отмена.

Эти два файла сохранены без изменения алгоритма. Их небольшие зависимости-порты реализованы в новом проекте заново. UI, обход vault, локальные версии, конфликтные стратегии, журналы, миграции и профили из архива не включены.

Приложенный к архиву текст MIT для Sync Engine сохранён в `licenses/sync-engine-MIT.txt`. Прямой зависимости от Sync Engine SDK нет; документация upstream использована как архитектурный ориентир. Этот файл не объявляет весь пользовательский архив кодом Sync Engine.

В 0.3.0 подходы Google Drive сверены с `hesprs/sync-engine` на коммите `d91199e079f2010bcb4bc9e0dfca7a9e4a2fd10f` (`packages/gdrive/src/gdrive/fs.ts`, `upload.ts`, MIT). Свежий поиск по цепочке пути, выбор новейшего дубля, MIME и последовательные resumable-блоки адаптированы в собственной реализации `src/sources/remotes.ts` и `drive-upload.ts`; добавлены строгая проверка коллизий, явная настройка только для чтения, проверка Range и восстановления сессии. Ссылка на исходники и отличия — в `AUDIT.md`.

Из FreeFileSync использованы документированные концепции режимов, сравнения и versioning. Код FreeFileSync не копировался и не включён в сборку.

Инструменты сборки: TypeScript, esbuild, tsx, Prettier; декларации API — пакет obsidian. Установочные артефакты не содержат node_modules. Точные версии зафиксированы в package-lock.json.
