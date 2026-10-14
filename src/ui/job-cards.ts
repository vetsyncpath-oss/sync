import type { JobProjection, JobRunResult } from '../core/job-runtime';
import { element, tr } from './dom';
export function jobScheduleLabel(job:JobProjection):string{
    const schedule=job.schedule,interval=schedule.interval;
    const name=interval==='off'?tr('Выключена','Off'):interval==='startup-only'?tr('Только при запуске','At startup'):
        ({'15m':tr('Каждые 15 минут','Every 15 minutes'),'30m':tr('Каждые 30 минут','Every 30 minutes'),'1h':tr('Каждый час','Every hour'),'2h':tr('Каждые 2 часа','Every 2 hours')} as Record<string,string>)[interval];
    const prefix=job.configuredAuto==='inherit'?tr('Наследуется → ','Inherited → '):'';
    if(interval==='off')return prefix+name;
    if(schedule.paused)return prefix+name+' · '+tr('Пауза','Paused');
    if(schedule.blockedReason)return prefix+name+' · '+tr('Остановлена: ','Blocked: ')+schedule.blockedReason;
    if(schedule.running)return prefix+name+' · '+tr('Выполняется','Running');
    if(schedule.continuationRequired)return prefix+name+' · '+tr('Нужен ручной запуск','Manual continuation required');
    if(schedule.nextFinishingAt!==null)return prefix+name+' · '+tr('Ожидает завершающего прохода','Finishing scheduled');
    if(schedule.nextRetryAt!==null)return prefix+name+' · '+tr('Ожидает повторной попытки','Retry scheduled');
    if(schedule.pending)return prefix+name+' · '+tr('Ожидает доступа или свободного слота','Waiting for access or a free slot');
    if(interval==='startup-only')return prefix+name+' · '+(schedule.startupCycle==='completed'?tr('Стартовый цикл завершён','Startup cycle completed'):schedule.startupCycle==='cancelled'?tr('Стартовый цикл отменён','Startup cycle cancelled'):tr('Стартовый цикл ожидает запуска','Startup cycle pending'));
    return prefix+name;
}
export function jobCards(jobs:readonly JobProjection[]):HTMLElement{
    const box=element('section','','sync-job-cards');box.append(element('h4',tr('Источники и автосинхронизация','Sources and automatic synchronization')));
    for(const job of jobs){const row=element('details','','sync-job-card'),summary=element('summary',job.name+' · '+jobScheduleLabel(job));row.dataset.jobId=job.connectionId;row.append(summary);
        if(job.run)appendRun(row,job.run);
        if(job.schedule.nextPeriodicAt!==null)row.append(element('small',tr('Следующий периодический запуск: ','Next periodic run: ')+new Date(job.schedule.nextPeriodicAt).toLocaleString()));
        if(job.schedule.nextRetryAt!==null)row.append(element('p',tr('Повтор после: ','Retry after: ')+new Date(job.schedule.nextRetryAt).toLocaleString()));
        if(job.schedule.nextFinishingAt!==null)row.append(element('p',tr('Завершающий проход после: ','Finishing after: ')+new Date(job.schedule.nextFinishingAt).toLocaleString()));
        box.append(row);
    }return box;
}

function appendRun(row:HTMLElement,run:JobRunResult):void{
    const outcome=run.activity!=='idle'?tr('Запуск: ','Run: ')+run.activity:({success:tr('Завершено','Completed'),partial:tr('Частично выполнено','Partially completed'),'needs-attention':tr('Требует решения','Needs attention'),failed:tr('Ошибка источника','Source failed'),blocked:tr('Запись заблокирована','Writes blocked'),cancelled:tr('Отменено','Cancelled')} as Record<string,string>)[run.outcome??'']??'';
    row.append(element('p',outcome),element('p',tr('Получено: ','Downloaded: ')+run.downloaded+' · '+tr('Отправлено: ','Uploaded: ')+run.uploaded+' · '+tr('Удалений через корзину: ','Trashed: ')+run.deleted),
        element('p',tr('Ошибок: ','Failures: ')+run.failed+' · '+tr('Ожидают решения: ','Need attention: ')+run.attention+' · '+tr('В очереди: ','Queued: ')+run.pending));
    for(const issue of run.issues.slice(0,5))row.append(element('p',issue.message,'sync-workspace-error'));
}
/** Historical outcomes do not use today's schedule or expose actions against an old policy. */
export function jobHistory(jobs:readonly JobRunResult[],total=jobs.length):HTMLElement{
    const box=element('details','','sync-job-history');box.append(element('summary',tr('Результаты по источникам','Source results')));
    for(const job of jobs){const row=element('details','','sync-job-history-row');row.dataset.jobId=job.connectionId;row.append(element('summary',job.name));appendRun(row,job);box.append(row);}
    if(total>jobs.length)box.append(element('p',tr('Показаны первые ','Showing first ')+jobs.length+' / '+total));
    return box;
}
