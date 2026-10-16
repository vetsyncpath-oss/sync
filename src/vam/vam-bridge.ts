// ============================================================================
//  src/vam/vam-bridge.ts — плагиновый клей над гвардом VAM.
//
//  Адаптация vam-bridge.ts из плагина Note AI Assistant (донор): та же
//  архитектура и семантика, тексты — через i18n этого плагина (en/ru),
//  «работа, требующая входа» — СЕССИИ СИНХРОНИЗАЦИИ (у донора — AI-запросы).
//
//  Держит плагино-специфичную логику отдельно от vam-guard.ts, чтобы сам
//  гвард оставался «каплей-в-замене» из поставки VAM (обновление = замена
//  файла целиком, руководство §4.1/§9.5): этот мост импортирует только
//  контрактные ТИПЫ и не зависит от внутренностей системы.
//
//  Здесь живут:
//    • assertVamAllowed(plugin) — гейт «работы, требующей входа» (§5):
//      единая точка для всех сессий синка (runSession в main.ts:
//      manual/auto/retry/scan/force). Fail-closed: нет гварда/нет входа —
//      отказ ДО ухода какого-либо трафика.
//    • describeVamStatus / describeVamReason — локализация машинных кодов
//      причины (§7: «локализуйте у себя, не сравнивайте с UI-строками»).
//    • vamAllowsWork(plugin) — булев срез для чипов/модалки (VAM обязателен для этой сборки).
// ============================================================================

import { Notice } from 'obsidian';
import type { VamGate, VamGateReason, VamGateStatus } from './vam-guard';
import { i18n } from '../i18n';

/** Минимальный структурный порт плагина (без импорта main.ts). */
interface VamPluginPort {
    vam?: VamGate | null;
    /** Deprecated compatibility field; never grants access in this build. */
    vamSoftMode?: boolean;
}

/** Анти-спам: не чаще одного Notice об отказе в 3 секунды. */
let lastDeniedNoticeAt = 0;

/** VAM is mandatory: only a current granted gate authorizes work. */
export function vamAllowsWork(plugin: VamPluginPort | null | undefined): boolean {
    return plugin?.vam?.isGranted() === true;
}

/**
 * Гейт входа для сессий синка (двойная сверка из §9.4: сигнал читается в
 * момент использования, не кэшируется). Не-granted → throw VamAccessError
 * ДО ухода какого-либо трафика; Notice показывается не чаще раза в 3 с.
 */
export function assertVamAllowed(plugin: VamPluginPort | null | undefined): void {
    if (vamAllowsWork(plugin)) return;
    const now = Date.now();
    if (now - lastDeniedNoticeAt > 3000) {
        lastDeniedNoticeAt = now;
        new Notice(i18n.t.vam.noticeDenied, 4000);
    }
    const err = new Error(i18n.t.vam.errorDenied);
    err.name = 'VamAccessError';
    throw err;
}

/** Локализация машинных кодов причины (стабильные коды, §7). */
export function describeVamReason(reason: VamGateReason): string {
    const v = i18n.t.vam;
    switch (reason) {
        case 'kill-switch':      return v.reasonKillSwitch;
        case 'revoked':          return v.reasonRevoked;
        case 'expired':          return v.reasonExpired;
        case 'ttl':              return v.reasonTtl;
        case 'wrong-password':   return v.reasonWrongPassword;
        case 'key-mismatch':     return v.reasonKeyMismatch;
        case 'no-password':      return v.reasonNoPassword;
        case 'unconfigured':     return v.reasonUnconfigured;
        case 'awaiting-approval':return v.reasonAwaitingApproval;
        case 'channel-error':    return v.reasonChannelError;
        case 'vam-missing':      return v.reasonVamMissing;
        case 'vam-unloaded':     return v.reasonVamUnloaded;
        default:                 return v.reasonNoCode;
    }
}

/** Человекочитаемое состояние гварда (для статусной команды/логов). */
export function describeVamStatus(gate: VamGate | null | undefined): string {
    const v = i18n.t.vam;
    if (!gate) return v.statusNoGuard;
    const s: VamGateStatus = gate.status;
    const head = s === 'granted'
        ? v.statusHeadGranted
        : s === 'pending'
            ? v.statusHeadPending
            : v.statusHeadBlocked;
    const reasonPart = gate.reason ? `\n${v.statusReasonPrefix}${describeVamReason(gate.reason)}` : '';
    return `VAM: ${head}${reasonPart}`;
}
