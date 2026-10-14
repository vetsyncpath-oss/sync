import { App, Notice } from 'obsidian';
import { EngineRegistry } from '../engines/registry';
import { validateSettings } from '../engines/schema';
import { validateProfiles, type SourceConnection } from '../core/profiles';
import { i18n, resolveLabel } from '../i18n';
import { DraftModal } from './draft-modal';
import { button, element, field, selectInput, textInput, tr } from './dom';
import { connectionIssues } from '../engines/connection-validation';
import { parseGoogleClient,type GoogleSignInEvent } from '../auth/google-auth';
import { diagnosticText } from '../core/sync-issue';
import type { GoogleConnectionActions } from './gdrive-folder-picker';
export class SourceConnectionModal extends DraftModal {
    private draft: SourceConnection;
    private readonly initial: string;
    private readonly providers = new Map<string, Record<string, unknown>>();
    private errors = new Map<string, HTMLElement>();
    private readonly controller = new AbortController();
    private applied = false;
    private stagedSecret?: string;
    private busy = false;
    private authController?:AbortController;
    private authEvent?:GoogleSignInEvent;
    private authMessage?:string;
    constructor(app: App, source: SourceConnection, private apply: (source: SourceConnection) => void,
        private google?: GoogleConnectionActions) {
        super(app); this.draft = structuredClone(source); this.initial = JSON.stringify(this.draft);
    }
    protected isDirty(): boolean { return JSON.stringify(this.draft) !== this.initial; }
    onOpen(): void { this.render(); }
    onClose(): void { this.controller.abort();if(!this.applied&&this.stagedSecret)this.google?.discardSecret?.(this.stagedSecret); }
    private render(): void {
        const box = this.contentEl, c = this.draft; box.replaceChildren(); this.errors.clear();
        box.classList.add('sync-connection'); box.append(element('h3', tr('Подключение источника', 'Source connection')));
        const nameRow=field(box, tr('Название', 'Name'), textInput(c.name, value => c.name = value));
        const nameError=element('small','','sync-workspace-error');nameError.setAttribute('role','alert');nameRow.append(nameError);this.errors.set('__name',nameError);
        field(box, tr('Провайдер', 'Provider'), selectInput(EngineRegistry.all().map(d => [d.kind, resolveLabel(i18n.t, d.labelKey) + (d.experimental ? ' · ' + i18n.t.experimentalTag : '')]), c.kind, value => {
            if(this.busy){this.render();return;}
            this.providers.set(c.kind, structuredClone(c.values)); c.kind = value as SourceConnection['kind'];
            c.values = structuredClone(this.providers.get(value) ?? (value === 'git' ? { branch: 'default' } : {})); this.render();
        }));
        field(box,tr('Автосинхронизация этого источника','Automatic sync for this source'),selectInput([
            ['inherit',tr('Общий интервал','Global interval')],['off',tr('Только вручную','Manual only')],['startup-only',tr('Один раз при запуске','Once at startup')],['15m','15 min'],['30m','30 min'],['1h','1 h'],['2h','2 h']],c.auto??'inherit',value=>c.auto=value as SourceConnection['auto']));
        const descriptor = EngineRegistry.get(c.kind);
        if(c.kind==='gdrive'){
            field(box,tr('Доступ к Drive','Drive access'),selectInput([
                ['public',tr('Публичная папка / API key','Public folder / API key')],['oauth-desktop',tr('Google аккаунт (desktop)','Google account (desktop)')]
            ],String(c.values.authMode??'public'),value=>{if(!this.busy)c.values.authMode=value;this.render();}));
            if(c.values.authMode==='oauth-desktop')this.renderGoogle(box);
        }
        if (descriptor.experimental) box.append(element('p', i18n.t.noticeExperimentalEngine, 'sync-workspace-warning'));
        for (const f of descriptor.settingsSchema) {
            if(c.kind==='gdrive'&&c.values.authMode==='oauth-desktop'&&f.key==='apiKey')continue;
            const value = c.values[f.key] ?? f.default; let control: HTMLElement;
            if (f.type === 'toggle') {
                const toggle = element('input'); toggle.type = 'checkbox'; toggle.checked = Boolean(value);
                toggle.addEventListener('change', () => c.values[f.key] = toggle.checked); control = toggle;
            } else if (f.type === 'select') control = selectInput((f.options ?? []).map(o => [o.value, resolveLabel(i18n.t, o.labelKey)]), String(value ?? ''), v => c.values[f.key] = v);
            else {
                const input = textInput(String(value ?? ''), v => {c.values[f.key] = f.type === 'number' ? (v === '' ? undefined : Number(v)) : v;if(f.key==='folderId')delete c.values.folderName;});
                input.type = f.type === 'secret' || f.secret ? 'password' : f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text';
                if (f.placeholderKey) input.placeholder = resolveLabel(i18n.t, f.placeholderKey);
                input.autocomplete = input.type === 'password' ? 'new-password' : 'off'; control = input;
            }
            const row = field(box, resolveLabel(i18n.t, f.labelKey) + (f.required ? ' *' : ''), control, f.helpKey ? resolveLabel(i18n.t, f.helpKey) : '');
            const error = element('small', '', 'sync-workspace-error'); error.setAttribute('role', 'alert'); row.append(error); this.errors.set(f.key, error);
            if (f.type === 'secret' || f.secret) {
                const reveal = button(row, tr('Показать', 'Show'), () => {
                    const input = control as HTMLInputElement; input.type = input.type === 'password' ? 'text' : 'password';
                    reveal.textContent = input.type === 'password' ? tr('Показать', 'Show') : tr('Скрыть', 'Hide');
                });
            }
        }
        if (c.kind === 'zip-url' || c.kind === 'yandex') box.append(element('p', tr('Просмотр ZIP может скачать весь архив.', 'Browsing ZIP contents may download the whole archive.'), 'sync-workspace-hint'));
        button(box, tr('Применить к черновику', 'Apply to draft'), () => {
            try {
                const next = structuredClone(c);
                for (const f of descriptor.settingsSchema) if (next.values[f.key] === undefined && f.default !== undefined) next.values[f.key] = f.default;
                for (const error of this.errors.values()) { error.textContent = ''; error.parentElement?.querySelector('input, select')?.removeAttribute('aria-invalid'); }
                if(!c.name.trim()){
                    nameError.textContent=tr('Укажите название подключения','Enter a connection name');
                    const input=nameRow.querySelector('input')!;input.setAttribute('aria-invalid','true');input.focus();return;
                }
                const invalid = connectionIssues(next);
                for (const error of invalid) {
                    const node = this.errors.get(error.field);
                    if (node) { node.textContent = error.code === 'required' ? tr('Обязательное поле', 'Required field') : tr('Проверьте формат значения', 'Check the value format'); node.parentElement?.querySelector('input, select')?.setAttribute('aria-invalid', 'true'); }
                }
                if (invalid.length) { this.errors.get(invalid[0].field)?.parentElement?.querySelector<HTMLElement>('input, select')?.focus(); return; }
                if(this.busy)return;
                validateProfiles([], [next]); this.apply(structuredClone(next)); this.applied=true;this.acceptClose();
            } catch (error) { new Notice(String(error)); }
        }, 'mod-cta');
        button(box, tr('Отмена', 'Cancel'), () => this.close());
    }
    private renderGoogle(box: HTMLElement): void {
        const c=this.draft;
        box.append(element('p',tr('Ссылки и file ID сохраняются. До проверки записи на месте локальные обновления существующих объектов публикуются в конфликтные копии. Новые файлы отправляются автоматически.','Links and file IDs are preserved. Until in-place writes are validated, local updates of existing objects are published as conflict copies. New files upload automatically.')));
        box.append(element('p',tr('Google разрешает доступ к Drive аккаунта. Синхронизация ограничена выбранной папкой.','Google grants account Drive access. Synchronization is restricted to the selected folder.')));
        const input=element('input');input.type='file';input.accept='.json,application/json';
        input.disabled=this.busy;
        input.addEventListener('change',()=>{const file=input.files?.[0];if(!file||this.busy)return;
            this.busy=true;
            void file.text().then(raw=>{this.controller.signal.throwIfAborted();const client=parseGoogleClient(raw);
                if(this.stagedSecret)this.google?.discardSecret?.(this.stagedSecret);this.stagedSecret=undefined;
                delete c.values.accountSub;delete c.values.secretRef;c.values.clientId=client.clientId;c.values.clientSecret=client.clientSecret;
            }).catch(error=>{if(!this.controller.signal.aborted)new Notice(String(error));}).finally(()=>{this.busy=false;if(!this.controller.signal.aborted)this.render();});});
        field(box,tr('Конфигурация OAuth Desktop client','OAuth Desktop client configuration'),input,
            c.values.clientId?tr('Конфигурация загружена','Configuration imported'):tr('Выберите JSON из Google Cloud Console','Select the JSON from Google Cloud Console'));
        const accounts=this.google?.accounts?.()??[];
        if(accounts.length)field(box,tr('Использовать подключённый аккаунт','Use a connected account'),selectInput([
            ['',tr('Выбрать…','Select…')],...accounts.map((a,i)=>[String(i),a.name] as const)
        ],'',value=>{const account=accounts[Number(value)];if(!this.busy&&value&&account){if(this.stagedSecret)this.google?.discardSecret?.(this.stagedSecret);this.stagedSecret=undefined;for(const key of ['clientId','clientSecret','accountSub','secretRef'])c.values[key]=account.values[key];this.render();}}));
        box.append(element('p',c.values.accountSub?tr('Аккаунт авторизован. Сохраните подключение для синхронизации.','Account authorized. Save the connection to enable sync.'):tr('Аккаунт не подключён','Account not connected')));
        const sign=button(box,this.busy?tr('Ожидание…','Waiting…'):tr('Войти через Google','Sign in with Google'),()=>{
            if(this.busy||!this.google)return;
            const operation=new AbortController(),abort=()=>operation.abort(this.controller.signal.reason);
            this.controller.signal.addEventListener('abort',abort,{once:true});
            if(this.controller.signal.aborted)abort();
            this.authController=operation;this.authEvent=undefined;this.authMessage=undefined;
            this.busy=true;this.render();
            void this.google.signIn(structuredClone(c.values),operation.signal,event=>{
                if(operation.signal.aborted||this.authController!==operation)return;this.authEvent=event;this.render();
            }).then(values=>{
                operation.signal.throwIfAborted();if(this.stagedSecret)this.google?.discardSecret?.(this.stagedSecret);
                Object.assign(c.values,values);this.stagedSecret=String(values.secretRef);
            }).catch(error=>{
                if(this.controller.signal.aborted)return;
                this.authMessage=operation.signal.aborted?tr('Вход отменён. Можно повторить попытку.','Sign-in cancelled. You can try again.'):
                    (error as {code?:string}).code==='oauth-timeout'?tr('Google не завершил вход за 5 минут. Проверьте страницу в браузере и начните новую попытку.','Google did not complete sign-in within 5 minutes. Check the browser page and start a new attempt.'):
                    (error as {code?:string}).code==='network'?tr('Не удалось завершить обмен с Google. Проверьте доступ к Google и повторите вход.','Could not complete the exchange with Google. Check Google connectivity and retry sign-in.'):
                    diagnosticText(error);
            }).finally(()=>{
                this.controller.signal.removeEventListener('abort',abort);
                if(this.authController!==operation)return;this.authController=undefined;this.authEvent=undefined;this.busy=false;
                if(!this.controller.signal.aborted)this.render();
            });
        });sign.disabled=this.busy||!this.google||!c.values.clientId;
        if(this.authController){
            const status=element('p',this.authEvent?.stage==='exchanging-code'?
                tr('Google вернул ответ. Завершаем вход…','Google returned a response. Completing sign-in…'):
                tr('Ожидаем завершения входа в браузере — до 5 минут. Синхронизация ещё не началась.','Waiting for browser sign-in, up to 5 minutes. Synchronization has not started.'));
            status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.append(status);
            if(this.authEvent?.stage==='waiting-browser'){
                box.append(element('p',tr('Если страница Google недоступна (включая accounts.google.ru/SetSID), откройте эту ссылку в приватном окне или другом браузере. Obsidian должен оставаться открытым.','If a Google page is unreachable (including accounts.google.ru/SetSID), open this link in a private window or another browser. Keep Obsidian open.')));
                const link=element('input');link.type='text';link.value=this.authEvent.authorizationUrl;link.readOnly=true;link.setAttribute('readonly','');link.autocomplete='off';
                field(box,tr('Ссылка для текущей попытки входа','Link for the current sign-in attempt'),link);
                const copied=element('small');box.append(copied);
                button(box,tr('Скопировать ссылку входа','Copy sign-in link'),()=>{
                    const url=link.value;link.focus();link.select?.();
                    if(!navigator.clipboard?.writeText){copied.textContent=tr('Скопируйте ссылку из поля выше.','Copy the link from the field above.');return;}
                    void navigator.clipboard.writeText(url).then(()=>{copied.textContent=tr('Ссылка скопирована.','Link copied.');},()=>{copied.textContent=tr('Скопируйте ссылку из поля выше.','Copy the link from the field above.');});
                });
            }
            button(box,tr('Отменить вход','Cancel sign-in'),()=>this.authController?.abort(new DOMException('Google sign-in cancelled','AbortError')));
        }
        if(this.authMessage){const message=element('p',this.authMessage,'sync-workspace-error');message.setAttribute('role','alert');box.append(message);}
        const pick=button(box,tr('Выбрать папку Drive','Choose Drive folder'),()=>{
            if(this.busy||!this.google)return;this.busy=true;this.render();
            void this.google.pickFolder(structuredClone(c.values),this.controller.signal).then(folder=>{
                this.controller.signal.throwIfAborted();if(folder){c.values.folderId=folder.id;c.values.folderName=folder.name;}
            }).catch(error=>{if(!this.controller.signal.aborted)new Notice(String(error));}).finally(()=>{this.busy=false;if(!this.controller.signal.aborted)this.render();});
        });pick.disabled=this.busy||!this.google||!c.values.secretRef;
        if(c.values.folderName)box.append(element('p',String(c.values.folderName)));
    }
}
