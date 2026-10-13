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
            for (const text of [label, row.source ?? '—', 'remotePath' in row ? row.remotePath ?? '—' : '—', row.path, reasonLabel(row.reason)+('issue' in row&&row.issue?' · '+row.issue.stage+': '+row.issue.message+(row.issue.status?' · HTTP '+row.issue.status:'')+(row.issue.attempt?' · '+tr('попытка ','attempt ')+row.issue.attempt:'')+(row.issue.retryAt&&row.issue.retryAt<Number.MAX_SAFE_INTEGER?' · '+tr('повтор после ','retry after ')+new Date(row.issue.retryAt).toLocaleString():''):'')+('conflictPath' in row&&row.conflictPath?' · '+row.conflictPath:'')]) line.append(element('td', text));
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
