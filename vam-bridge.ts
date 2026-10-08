// ============================================================================
//  vam-bridge.ts — плагиновый клей над гвардом VAM.
//
//  Держит плагино-специфичную логику отдельно от vam-guard.ts, чтобы сам
//  гвард оставался «каплей-в-замене» из поставки VAM (обновление = замена
//  файла целиком, руководство §4.1/§9.5): этот мост импортирует только
//  контрактные ТИПЫ и не зависит от внутренностей системы.
//
//  Здесь живут:
//    • assertVamAllowed(plugin) — гейт «работы, требующей входа» (§5):
//      единая точка для всех AI-запросов (AIEngine.processText / chat /
//      getEmbeddings). Fail-closed: нет гварда/нет входа — отказ.
//    • describeVamStatus / describeVamReason — локализация машинных кодов
//      причины (§7: «локализуйте у себя, не сравнивайте с UI-строками»).
// ============================================================================

import { Notice } from 'obsidian';
import type { VamGate, VamGateReason, VamGateStatus } from './vam-guard';

/** Минимальный структурный порт плагина (без импорта main.ts). */
interface VamPluginPort {
    vam?: VamGate | null;
    /** Мягкий режим (сессионный, включает владелец через статусную модалку):
     *  true → работа разрешена без подтверждения VAM. */
    vamSoftMode?: boolean;
}

const VAM_DENIED_ERROR = 'VAM: доступ не подтверждён — AI-запрос отклонён';

/** Анти-спам: не чаще одного Notice об отказе в 3 секунды. */
let lastDeniedNoticeAt = 0;

/** Разрешена ли работа, требующая входа. Fail-closed: гварда нет → false.
 *  Мягкий режим — единственное осознанное исключение (включает владелец). */
export function vamAllowsWork(plugin: VamPluginPort | null | undefined): boolean {
    return plugin?.vamSoftMode === true || plugin?.vam?.isGranted() === true;
}

/**
 * Гейт входа для AI-запросов (двойная сверка из §9.4: сигнал читается в
 * момент использования, не кэшируется). Не-granted → throw VamAccessError
 * ДО ухода какого-либо трафика; Notice показывается не чаще раза в 3 с.
 */
export function assertVamAllowed(plugin: VamPluginPort | null | undefined): void {
    if (vamAllowsWork(plugin)) return;
    const now = Date.now();
    if (now - lastDeniedNoticeAt > 3000) {
        lastDeniedNoticeAt = now;
        new Notice('⛔ Note AI Assistant: вход не пройден — AI-функции недоступны (VAM)', 4000);
    }
    const err = new Error(VAM_DENIED_ERROR);
    err.name = 'VamAccessError';
    throw err;
}

/** Локализация машинных кодов причины (стабильные коды, §7). */
export function describeVamReason(reason: VamGateReason): string {
    switch (reason) {
        case 'kill-switch':      return 'аварийное отключение (kill-switch)';
        case 'revoked':          return 'доступ отозван';
        case 'expired':          return 'срок доступа истёк';
        case 'ttl':              return 'сессия истекла (TTL)';
        case 'wrong-password':   return 'неверный пароль';
        case 'key-mismatch':     return 'ключ машины не совпал';
        case 'no-password':      return 'пароль не задан';
        case 'unconfigured':     return 'система идентификации не настроена';
        case 'awaiting-approval':return 'ожидает подтверждения хозяином';
        case 'channel-error':    return 'ошибка канала связи с системой';
        case 'vam-missing':      return 'система идентификации не найдена';
        case 'vam-unloaded':     return 'система выгружена';
        default:                 return 'без кода причины';
    }
}

/** Человекочитаемое состояние гварда (для статусной команды/логов). */
export function describeVamStatus(gate: VamGate | null | undefined): string {
    if (!gate) return 'VAM: гвард не создан';
    const s: VamGateStatus = gate.status;
    const head = s === 'granted'
        ? 'вход пройден'
        : s === 'pending'
            ? 'ожидание решения системы идентификации'
            : 'вход не пройден';
    const reasonPart = gate.reason ? `\nПричина: ${describeVamReason(gate.reason)}` : '';
    return `VAM: ${head}${reasonPart}`;
}
