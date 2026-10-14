import type { JournalEntry } from '../core/journal';
import { tr } from './dom';

export function sessionLabel(entry:JournalEntry,fallback:string):string {
    if(entry.outcome==='cancelled')return fallback;
    if(entry.attemptOnly)return tr('Не запущено','Did not start');
    if(entry.outcome==='error'&&(entry.downloaded>0||entry.uploaded||entry.deletedDrive||entry.deletedFull>0||entry.deletedLight>0))return tr('Выполнено частично','Partially completed');
    if(entry.deferredConflicts)return tr('Ожидает решения','Awaiting decision');
    if(entry.blockedDeletions)return tr('Удаления заблокированы','Deletions blocked');
    if(entry.deferredDeletions)return tr('Удаления отложены','Deletions deferred');
    if(entry.pendingAfter&&!entry.errors)return tr('Очередь ожидает повтора или исправления','Pending retry or repair');
    if(entry.notAttempted)return tr('Источник временно остановлен','Source temporarily paused');
    return fallback;
}
