import { App, Notice } from 'obsidian';
import { i18n } from '../i18n';
import { compileProfiles, validateProfiles, type SyncProfile, type SourceConnection } from '../core/profiles';
import type { SyncPolicy } from '../core/policy';
import type { WriteMode, DeleteMode, RuleConflict } from '../core/file-rules';
import { trackModal } from './modal-registry';
import { DraftModal } from './draft-modal';
import { SourceConnectionModal } from './source-connection-modal';
import { button, element, field, selectInput, textInput, tr } from './dom';
import type { GoogleConnectionActions } from './gdrive-folder-picker';

export function writeLabel(mode: WriteMode): string { return ({ preserve: tr('Не трогать', 'Do not touch'), create: tr('Добавлять отсутствующие', 'Create missing'), update: tr('Обновлять без локальных правок', 'Update unchanged local files'), remote: tr('Версия источника', 'Match source'), changes: tr('Обновлять с разрешением конфликтов', 'Update with conflict resolution') })[mode]; }
export function deleteLabel(mode: DeleteMode): string { return ({ keep: tr('Сохранять отсутствующие в источнике', 'Keep files absent from source'), tracked: tr('Удалять ранее синхронизированные', 'Delete previously synced files'), mirror: tr('Удалять все отсутствующие в источнике', 'Delete all files absent from source') })[mode]; }
export function profileName(profile: SyncProfile): string {
    const names: Record<string, string> = {
        'standard:preserve': writeLabel('preserve'), 'standard:seed': tr('Установить только отсутствующие', 'Install missing files only'),
        'standard:safe': writeLabel('update'), 'standard:source': tr('Версия источника без удалений', 'Match source without deletion'),
        'standard:drive-bidirectional':tr('Google Drive ↔ vault — предложения и корзина','Google Drive ↔ vault — proposals and trash'),
        'standard:conflicts': tr('Обновлять с сохранением конфликтной копии', 'Update with a conflict copy'),
    };
    return profile.builtin ? names[profile.id] ?? profile.name : profile.name;
}
export class ProfileLibraryModal extends DraftModal {
    private readonly initial: string;
    private saving = false;
    constructor(app: App, private profiles: SyncProfile[], private connections: SourceConnection[],
        private save: (p: SyncProfile[], c: SourceConnection[], defaultSource?: string) => Promise<void>,
        private sources = false, private defaultSource?: string, private policy?: SyncPolicy, private draftMode=false,
        private google?: GoogleConnectionActions) {
        super(app); this.profiles = structuredClone(profiles); this.connections = structuredClone(connections); this.initial = this.fingerprint();
    }
    private fingerprint(): string { return JSON.stringify([this.profiles, this.connections, this.defaultSource]); }
    protected isDirty(): boolean { return this.fingerprint() !== this.initial; }
    protected async saveDraft(): Promise<void> {
        if (this.saving) return; this.saving = true;
        try { validateProfiles(this.profiles, this.connections); if (this.policy) compileProfiles(this.policy, this.profiles);
            await this.save(structuredClone(this.profiles), structuredClone(this.connections), this.defaultSource); this.acceptClose();
        } catch (error) { new Notice(String(error)); } finally { this.saving = false; }
    }
    onOpen(): void { this.render(); }
    onClose(): void { if(!this.draftMode)this.google?.releaseDraft?.(); }
    private render(): void {
        const box = this.contentEl; box.replaceChildren(); box.classList.add('sync-library');
        box.append(element('h3', this.sources ? tr('Подключения', 'Connections') : tr('Профили синхронизации', 'Sync profiles')));
        box.append(element('p', this.sources ? tr('Подключения задают адреса источников. Их области и поведение настраиваются в дереве.', 'Connections define source endpoints. Assign their scopes and behaviour in the tree.') :
            tr('Профиль задаёт поведение файлов. Источник назначается отдельно в дереве.', 'A profile defines file behaviour. Assign its source separately in the tree.')));
        if (this.sources) {
            field(box, tr('Источник для хранилища', 'Vault source'), selectInput([
                ['', tr('Только назначения в дереве', 'Assignments only')], ...this.connections.map(c => [c.id, c.name] as const),
            ], this.defaultSource ?? '', value => this.defaultSource = value || undefined), tr('Для файлов без собственного источника. Смена применяется после сохранения.', 'For files without their own source. Changes apply after saving.'));
            for (const connection of this.connections) {
                const row = element('div', '', 'sync-library-row'); row.append(element('strong', connection.name), element('small', connection.kind));
                button(row, tr('Изменить', 'Edit'), () => this.editConnection(connection));
                button(row, tr('Удалить', 'Remove'), () => {
                    const rules = this.policy && compileProfiles(this.policy, this.profiles).fileRules;
                    if (this.defaultSource === connection.id || rules?.some(rule => rule.source === connection.id) || this.profiles.some(p => p.source === connection.id)) {
                        new Notice(tr('Подключение используется. Сначала измените общий источник или назначения в дереве.', 'This connection is used. Change the vault source or tree assignments first.')); return;
                    }
                    this.connections = this.connections.filter(c => c.id !== connection.id); this.render();
                }); box.append(row);
            }
            button(box, tr('Добавить подключение', 'Add connection'), () => this.editConnection({ id: crypto.randomUUID(), name: '', kind: 'git', values: { branch: 'default' } }));
        } else {
            for (const profile of this.profiles) {
                const row = element('div', '', 'sync-library-row'); row.append(element('strong', profileName(profile)), element('small', writeLabel(profile.write) + ' · ' + deleteLabel(profile.write === 'preserve' ? 'keep' : profile.delete)));
                button(row, profile.builtin ? tr('Создать свой на основе', 'Customize copy') : tr('Изменить', 'Edit'), () => this.editProfile(profile.builtin ?
                    { ...profile, id: crypto.randomUUID(), builtin: false, name: profileName(profile) + ' — ' + tr('мой', 'custom') } : profile));
                if (!profile.builtin) button(row, tr('Удалить', 'Remove'), () => {
                    const usages = this.policy?.assignments?.filter(a => a.profileId === profile.id) ?? [];
                    if (usages.length) { new Notice(tr('Профиль назначен: ', 'Profile is assigned to: ') + usages.map(a => a.path || 'Vault').join(', ')); return; }
                    this.profiles = this.profiles.filter(p => p.id !== profile.id); this.render();
                }); box.append(row);
            }
            button(box, tr('Новый профиль', 'New profile'), () => this.editProfile({ id: crypto.randomUUID(), name: '', write: 'update', delete: 'keep' }));
        }
        button(box, this.draftMode?tr('Применить к черновику', 'Apply to draft'):tr('Сохранить библиотеку', 'Save library'), () => void this.saveDraft(), 'mod-cta');
        button(box, tr('Отмена', 'Cancel'), () => this.close());
    }
    private editProfile(original: SyncProfile): void {
        const modal = new ProfileEditorModal(this.app, original, profile => {
            const index = this.profiles.findIndex(p => p.id === profile.id);
            if (index < 0) this.profiles.push(profile); else this.profiles[index] = profile; this.render();
        }); trackModal(modal); modal.open();
    }
    private editConnection(original: SourceConnection): void {
        const modal = new SourceConnectionModal(this.app, original, connection => {
            const index = this.connections.findIndex(c => c.id === connection.id);
            if (index < 0) this.connections.push(connection); else this.connections[index] = connection; this.render();
        },this.google); trackModal(modal); modal.open();
    }
}
class ProfileEditorModal extends DraftModal {
    private draft: SyncProfile;
    private readonly initial: string;
    private deleteChoice:DeleteMode;
    constructor(app: App, original: SyncProfile, private apply: (p: SyncProfile) => void) {
        super(app); this.draft = structuredClone(original); this.initial = JSON.stringify(this.draft);this.deleteChoice=original.delete;
    }
    protected isDirty(): boolean { return JSON.stringify(this.draft) !== this.initial; }
    onOpen(): void { this.render(); }
    private render(): void {
        const box = this.contentEl, p = this.draft; box.replaceChildren(); box.append(element('h3', tr('Профиль поведения', 'Behaviour profile')));
        field(box, tr('Название', 'Name'), textInput(p.name, v => p.name = v));
        field(box,tr('Направление','Direction'),selectInput([['pull',tr('Источник → vault','Source → vault')],['bidirectional','Google Drive ↔ vault']],p.direction??'pull',value=>{
            p.direction=value as SyncProfile['direction'];if(p.direction==='bidirectional'){p.write='changes';p.delete='tracked';this.deleteChoice='tracked';p.conflict='keep-both';}this.render();
        }));
        if(p.direction==='bidirectional')box.append(element('p',tr('Только OAuth Drive. Изменения идут в обе стороны; подтверждённые удаления — через корзину. Drive file ID сохраняется. Локальные обновления существующих объектов публикуются предложениями: локальный оригинал остаётся на месте, Drive ID и его содержимое сохраняются. Конфликт удаления и правки требует решения.','OAuth Drive only. Changes travel both ways; confirmed deletions use trash. Drive file IDs are preserved. Local updates of existing objects publish proposals: the local original stays in place, and the Drive ID and its content are retained. Delete/edit conflicts need a decision.')));
        field(box, tr('Запись', 'Write'), selectInput(((p.direction==='bidirectional'?['preserve','changes']:['preserve', 'create', 'update', 'remote', 'changes']) as WriteMode[]).map(mode => [mode, writeLabel(mode)]), p.write, value => {
            if(p.write!=='preserve')this.deleteChoice=p.delete;
            p.write = value as WriteMode;p.delete=p.write==='preserve'?'keep':this.deleteChoice;this.render();
        }));
        if (p.write === 'preserve') box.append(element('p', tr('Защищены записи, перемещения и удаления. Отсутствующие файлы не создаются.', 'Writes, moves and deletions are protected. Missing files are not created.')));
        else field(box, p.direction==='bidirectional'?tr('Удаления с любой стороны','Deletions on either side'):tr('Исчезновение из источника', 'When absent from source'), selectInput(((p.direction==='bidirectional'?['keep','tracked']:['keep', 'tracked', 'mirror']) as DeleteMode[]).map(mode => [mode, deleteLabel(mode)]), p.delete, value => p.delete = value as DeleteMode),
            p.direction==='bidirectional'?tr('Только ранее согласованные файлы. 404 и потеря доступа не считаются удалением.','Only previously reconciled files. 404 and lost access are not treated as deletions.'):tr('Фоновые удаления отложены. Для Яндекса, Drive и WebDAV удаления заблокированы до подтверждения полноты снимка.', 'Background deletions are deferred. Yandex, Drive and WebDAV deletions are blocked until inventory completeness is proven.'));
        if (p.write === 'changes') field(box, tr('Конфликт при обновлении', 'Conflict during update'), selectInput([
            ['keep-both', p.direction==='bidirectional'?tr('Предложить локальную версию; сохранить оба оригинала','Propose local version; retain both originals'):tr('Источник на месте; локальная версия в копию', 'Apply source; keep local copy')],
            ...(p.direction==='bidirectional'?[]:[['incoming', tr('Локальная на месте; входящая версия в копию', 'Keep local; save incoming copy')] as const]),
            ...(p.direction==='bidirectional'?[]:[['local-wins',tr('Оставить локальную; пропустить входящую', 'Keep local; skip incoming')] as const]),
            ['ask', tr('Спросить при ручном запуске', 'Ask during manual sync')],
        ], p.conflict ?? 'keep-both', value => p.conflict = value as RuleConflict));
        if (p.write === 'update') box.append(element('p', tr('Локальные правки и файлы без подтверждённой исходной версии будут пропущены.', 'Local edits and files without a confirmed baseline will be skipped.')));
        if (p.write === 'remote') box.append(element('p', tr('Локальная версия может быть заменена даже без изменений источника. Перед заменой сохраняется восстановительная копия.', 'Local content may be replaced even if the source is unchanged. A recovery copy is saved before replacement.')));
        button(box, tr('Готово', 'Done'), () => {
            try {
                if (p.write === 'preserve') p.delete = 'keep';
                if (p.write === 'changes') p.conflict ??= 'keep-both'; else delete p.conflict;
                validateProfiles([p]); this.apply(structuredClone(p)); this.acceptClose();
            } catch (error) { new Notice(String(error)); }
        }, 'mod-cta'); button(box, tr('Отмена', 'Cancel'), () => this.close());
    }
}
