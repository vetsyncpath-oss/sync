import type { SyncPlanRow, SyncFileResult } from '../sources/types';
import { button, element, textInput, tr } from './dom';

export function reasonLabel(reason: string): string {
    return ({
        missing: tr('Файла нет локально', 'File is missing locally'), 'source-changed': tr('Изменение источника; применяется профиль', 'Source changed; apply the profile'),
        'match-source': tr('Профиль требует версию источника; перед заменой — копия', 'Profile requires source content; copy before replacement'),
        'baseline-check': tr('Обновить при совпадении с исходной версией; иначе пропустить', 'Update if the local baseline matches; otherwise skip'),
        mapping: tr('Сохранённое перенаправление папки', 'Saved folder mapping'), absent: tr('Нет в подтверждённом снимке источника', 'Absent from a verified source snapshot'),
        preserve: tr('Профиль «Не трогать»', 'Do not touch profile'), 'create-only': tr('Уже существует; только установка отсутствующих', 'Already exists; create missing only'),
        background: tr('Удаление ожидает ручного запуска', 'Deletion awaits a manual run'), unverified: tr('Полнота снимка не подтверждена; удаление запрещено', 'Inventory completeness is unverified; deletion blocked'),
        'decision-required': tr('Конфликт ожидает вашего решения', 'Conflict awaits your decision'), 'incoming-copy': tr('Локальный файл сохранён; входящая версия в копии', 'Local file retained; incoming version saved as a copy'),
        accepted: tr('Версия источника принята', 'Source version accepted'), 'local-preserved': tr('Локальная версия сохранена профилем', 'Local version preserved by the profile'),
        'package-not-ready':tr('Пакет плагина или темы не прошёл все проверки; остальные записи отложены','Plugin or theme package did not pass all checks; remaining writes deferred'),
        'source-paused':tr('Источник остановлен после повторяющихся ошибок; файл ещё не загружался','Source paused after repeated failures; file has not been downloaded'),
        'file-too-large': tr('Превышен допустимый размер', 'File size limit exceeded'), 'io-error': tr('Операция не выполнена; проверьте подробности ошибки', 'Operation failed; check the error details'),
        'drive-proposal-received':tr('Получена копия предложения; исходный файл сохраняет свой ID','Proposal copy received; original file retains its ID'),
        'drive-unavailable':tr('Прежний Drive ID недоступен; это не подтверждение удаления','Tracked Drive ID is unavailable; deletion is not confirmed'),
        'drive-relocated':tr('Прежний Drive ID перемещён или переименован; прежняя связь сохранена','Tracked Drive ID moved or was renamed; original binding retained'),
        'drive-identity-changed':tr('По прежнему пути найден другой Drive ID; нужна проверка связи','A different Drive ID occupies the original path; binding review required'),
        'drive-unsupported':tr('Тип или назначение прежнего Drive объекта изменилось; запись заблокирована','Tracked Drive object type or role changed; writes blocked'),
        'drive-unlisted':tr('Прежний Drive ID существует, но не вошёл в дерево; запись заблокирована','Tracked Drive ID exists but was not listed; writes blocked'),
        'drive-deleted-review':tr('Есть история удаления; восстановление прежнего ID требует решения','Deletion history retained; restoring the original ID requires a decision'),
        'drive-restored-known':tr('Восстановлен прежний Drive ID и проверенное содержимое','Original Drive ID and verified content restored'),
        'drive-recovery-pending':tr('Есть незавершённый эффект; проверка доступа не исполняет и не закрывает его','An effect is unfinished; access checks neither replay nor close it'),
        'drive-probe-ok':tr('Доступ и прежняя связь проверены; файлы не изменены','Access and original binding checked; files unchanged'),
        'drive-proposals-review':tr('Исходный Drive ID сохранён; предложения требуют проверки','Original Drive ID retained; proposals need review'),
        'artifact-local-edited':tr('Полученная копия изменена локально; нужна проверка','Received copy was edited locally; review required'),
        'artifact-remote-edited':tr('Содержимое удалённой копии изменено; текущие байты сохранены','Remote copy content changed; current bytes retained'),
        'artifact-local-missing':tr('Полученная копия удалена локально; автоматическое восстановление отложено','Received copy was deleted locally; automatic restoration deferred'),
        'artifact-remote-trashed':tr('Удалённая копия в корзине; локальная копия сохранена','Remote copy is in trash; local copy retained'),
        'artifact-unavailable':tr('Полученная копия недоступна в Drive; локальные файлы сохранены','Received copy is unavailable in Drive; local files retained'),
        'artifact-origin-unavailable':tr('Исходный Drive ID недоступен; область копии нельзя подтвердить','Origin Drive ID is unavailable; artifact scope cannot be verified'),
        'artifact-unlisted':tr('Копия существует по ID, но отсутствует в дереве; нужна проверка','Copy exists by ID but is missing from the tree; review required'),
        'artifact-lineage-changed':tr('Связь копии с исходным файлом изменилась; нужна проверка','Artifact lineage changed; review required'),
        'artifact-target-collision':tr('Несколько копий назначены на один локальный путь','Multiple artifacts target one local path'),
        'tracked-lineage-without-baseline':tr('У файла есть прежний Drive ID в истории; создание нового объекта требует проверки','History contains a previous Drive ID; creating another object requires review'),
    } as Record<string, string>)[reason] ?? reason;
}
const actionLabel = (action: SyncPlanRow['action']) => ({ add: tr('Добавить', 'Add'), restore: tr('Восстановить', 'Restore'), update: tr('Обновить', 'Update'), check: tr('Проверить и обновить', 'Check and update'), move: tr('Переместить', 'Move'), delete: tr('Удалить', 'Delete'), skip: tr('Пропустить', 'Skip'), defer: tr('Отложить', 'Defer'), blocked: tr('Заблокировано', 'Blocked') })[action];
const statusLabel = (status: SyncFileResult['status']) => ({ applied: tr('Применено', 'Applied'), unchanged: tr('Без изменений', 'Unchanged'), skipped: tr('Пропущено', 'Skipped'), pending: tr('Ожидает решения', 'Pending'), error: tr('Ошибка', 'Error') })[status];

export function operationTable(rows: readonly SyncPlanRow[] | readonly SyncFileResult[], results = false): HTMLElement {
    const box = element('div', '', 'sync-operation-table'), body = element('div'); let query = '', page = 0;
    const search = textInput('', value => { query = value; page = 0; render(); }); search.type = 'search'; search.placeholder = tr('Фильтр по пути или источнику', 'Filter by path or source'); search.setAttribute('aria-label', search.placeholder); box.append(search, body);
    box.insertBefore(element('small',tr('Прокрутите таблицу вправо, чтобы увидеть все пути и причины.','Scroll the table horizontally to see all paths and reasons.'),'sync-table-mobile-hint'),body);
    const render = () => {
        body.replaceChildren();
        const filtered = rows.filter(row => [row.path, row.source, 'remotePath' in row ? row.remotePath : '', reasonLabel(row.reason)].join(' ').toLowerCase().includes(query.toLowerCase()));
        const table = element('table'); const head = element('thead'), titles = element('tr');
        for (const title of [tr('Действие / результат', 'Action / result'), tr('Источник', 'Source'), tr('Удалённый / исходный путь', 'Remote / original path'), tr('Путь vault', 'Vault path'), tr('Причина', 'Reason')]) { const th = element('th', title); th.scope = 'col'; titles.append(th); }
        head.append(titles); table.append(head); const data = element('tbody');
        for (const row of filtered.slice(page * 100, (page + 1) * 100)) {
            const line = element('tr');
            const label = 'action' in row ? actionLabel(row.action) : statusLabel(row.status);
            const copyPaths='conflictPaths' in row&&Array.isArray(row.conflictPaths)?row.conflictPaths.slice(0,50):'conflictPath' in row&&row.conflictPath?[row.conflictPath]:[];
            const proposalCount='proposalCount' in row&&typeof row.proposalCount==='number'?` · ${row.proposalCount}`:'';
            for (const text of [label, row.source ?? '—', 'remotePath' in row ? row.remotePath ?? '—' : '—', row.path, reasonLabel(row.reason)+proposalCount+('issue' in row&&row.issue?' · '+row.issue.stage+': '+row.issue.message+(row.issue.status?' · HTTP '+row.issue.status:'')+(row.issue.attempt?' · '+tr('попытка ','attempt ')+row.issue.attempt:'')+(row.issue.retryAt&&row.issue.retryAt<Number.MAX_SAFE_INTEGER?' · '+tr('повтор после ','retry after ')+new Date(row.issue.retryAt).toLocaleString():''):'')+(copyPaths.length?' · '+copyPaths.join(' · '):'')+('httpStatus' in row&&row.httpStatus?' · HTTP '+row.httpStatus:'')+('originId' in row&&row.originId?' · Drive ID: '+row.originId:'')+('candidateId' in row&&row.candidateId?' · '+tr('другой ID: ','other ID: ')+row.candidateId:'')]) line.append(element('td', text));
            data.append(line);
        }
        table.append(data); body.append(table);
        if (!filtered.length) body.append(element('p', tr('Нет подходящих операций', 'No matching operations')));
        if (filtered.length > 100) {
            const pager = element('div', '', 'sync-tree-pager');
            button(pager, tr('Назад', 'Previous'), () => { page--; render(); }).disabled = page === 0;
            pager.append(element('span', (page + 1) + ' / ' + Math.ceil(filtered.length / 100)));
            button(pager, tr('Далее', 'Next'), () => { page++; render(); }).disabled = (page + 1) * 100 >= filtered.length; body.append(pager);
        }
    }; render(); return box;
}
