// ============================================================================
//  src/ui/modal-registry.ts — реестр живых модалок плагина.
//
//  [overhaul S3/M-18 + S4 / S3-review #2,#3] Модалки переживали выгрузку
//  плагина: onunload их не закрывал — колбэки (onSave политики, onSync
//  popover'а, resolve конфликта) стреляли по выгруженному плагину.
//
//  Общий модуль (а не локальные defs в main.ts), чтобы внутренние модалки
//  src/ui/vault-tree-modal.ts (UnsavedConfirm / SpecificSync / FolderPicker)
//  трекались тем же реестром.
//
//  trackModal зовётся ПОСЛЕ назначения оригинального onClose и ДО open():
//  обёртка вызывает оригинал и само-удаляется из реестра. Для модалок без
//  собственного onClose оригинал — пустой метод базового класса.
//
//  isForceClosingModals(): dirty-guard'ы (VaultTreeModal.close) обязаны
//  пропускать свой мини-confirm при выгрузке: вложенная модалка в момент
//  onunload бессмысленна и сама стала бы «пережившей выгрузку».
// ============================================================================

import type { Modal } from 'obsidian';

const trackedModals = new Set<Modal>();
let forceClosing = false;

/** Поставить модалку в реестр (обёртка onClose само-удаляет её при закрытии). */
export function trackModal(modal: Modal): void {
        trackedModals.add(modal);
        const originalOnClose = modal.onClose;
        modal.onClose = () => {
                trackedModals.delete(modal);
                try { originalOnClose.call(modal); } catch { /* best-effort */ }
        };
}

/** true ⇔ сейчас идёт принудительное закрытие всех модалок при выгрузке
 *  плагина: guards подтверждений должны закрыться немедленно. */
export function isForceClosingModals(): boolean {
        return forceClosing;
}

/** Закрыть все живые модалки (звать из onunload, ДО dispose'ов). */
export function closeAllTrackedModals(): void {
        forceClosing = true;
        try {
                for (const m of Array.from(trackedModals)) {
                        try { m.close(); } catch { /* выгрузка — лучшее усилие */ }
                }
                trackedModals.clear();
        } finally {
                forceClosing = false;
        }
}
