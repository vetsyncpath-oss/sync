import { App, Modal } from 'obsidian';
import type { DriveInboxEntry, DriveResolution, driveLifecycleHistory } from '../core/drive-state';
import { button, element, textInput, tr } from './dom';
import { reasonLabel } from './operation-table';
import { trackModal } from './modal-registry';

export interface DriveLifecycleDeps {
    load():ReturnType<typeof driveLifecycleHistory>;
    probe(namespace:string,path:string):Promise<void>;
    restore(resolution:DriveResolution):Promise<void>;
    isRunning():boolean;
}
/** Read-only history and explicitly versioned decisions. Closing the UI never retires tracking. */
export class DriveLifecycleModal extends Modal {
    private histories:Awaited<ReturnType<typeof driveLifecycleHistory>>=[];
    private list!:HTMLElement;private error!:HTMLElement;private query='';private page=0;private busy=false;private closed=false;private request=0;
    constructor(app:App,private readonly deps:DriveLifecycleDeps){super(app);}
    onOpen():void {
        const box=this.contentEl;box.replaceChildren();box.append(element('h2',tr('Drive: предложения, неизвестные состояния и удаления','Drive: proposals, unknown states and deletions')),
            element('p',tr('404 не доказывает удаление. Проверка доступа не изменяет файлы. История сохраняет прежние ID; создание нового объекта и смена связи пока недоступны.','404 does not prove deletion. Access checks leave files unchanged. History retains original IDs; creating a new object and rebinding are currently unavailable.')));
        const search=textInput('',value=>{this.query=value;this.page=0;this.render();});search.type='search';search.placeholder=tr('Найти путь или Drive ID','Find path or Drive ID');search.setAttribute('aria-label',search.placeholder);
        this.error=element('p','','sync-workspace-error');this.list=element('div');box.append(search,this.error,this.list);
        button(box,tr('Обновить историю','Refresh history'),()=>void this.load());button(box,tr('Закрыть','Close'),()=>this.close());void this.load();
    }
    private async load():Promise<void>{const request=++this.request;
        try{const histories=await this.deps.load();if(this.closed||request!==this.request)return;this.histories=histories;this.error.textContent='';this.render();}
        catch(error){if(!this.closed&&request===this.request)this.error.textContent=String(error);}
    }
    private render():void {
        if(this.closed)return;this.list.replaceChildren();
        const query=this.query.toLowerCase(),rows=this.histories.flatMap(history=>[
            ...history.inbox.map(entry=>({namespace:history.namespace,path:entry.path,id:entry.originId,entry,tombstone:undefined,proposal:undefined})),
            ...history.tombstones.filter(t=>!history.inbox.some(e=>e.path===t.path)).map(tombstone=>({namespace:history.namespace,path:tombstone.path,id:tombstone.baseline.remoteId,entry:undefined,tombstone,proposal:undefined})),
            ...(history.proposals??[]).filter(p=>p.needsReview&&p.status!=='converged').map(proposal=>({namespace:history.namespace,path:proposal.path,id:proposal.originId,entry:undefined,tombstone:undefined,proposal})),
        ]).filter(row=>[row.path,row.id,row.entry?.candidateId,row.proposal?.copyId,row.proposal?.copyPath].join(' ').toLowerCase().includes(query));
        this.page=Math.min(this.page,Math.max(0,Math.ceil(rows.length/100)-1));
        for(const row of rows.slice(this.page*100,(this.page+1)*100)){
            const box=element('div','','sync-assignment-row');box.append(element('strong',row.path),element('p','Drive ID: '+row.id));
            if(row.proposal){const proposal=row.proposal;
                box.append(element('p',tr('Требует решения: исходные версии сохранены. Предложение не означает, что стороны совпадают.','Needs a decision: original versions are retained. A proposal does not mean the sides have converged.')),
                    element('p',tr('Локальная копия: ','Local copy: ')+proposal.copyPath),element('p',tr('Копия Drive ID: ','Drive copy ID: ')+(proposal.copyId??tr('ещё не опубликована','not yet published'))),
                    element('small',tr('Версия основания: ','Base version: ')+proposal.baseVersion+' · SHA-256: '+proposal.hash),
                    element('p',tr('Для явного выбора входящей версии назначьте профиль «Спросить» и запустите ручную синхронизацию. Запись поверх существующего Drive ID недоступна.','To choose the incoming version explicitly, assign an Ask profile and run manual sync. Overwriting an existing Drive ID is unavailable.')));
            }
            if(row.entry){const entry=row.entry;box.append(element('p',reasonLabel(entry.reason)),element('small',tr('Наблюдение: ','Observed: ')+new Date(entry.updatedAt).toLocaleString()+' · '+tr('версия ','revision ')+entry.revision));
                if(entry.httpStatus)box.append(element('p','HTTP '+entry.httpStatus));
                if(entry.proposalIds?.length)box.append(element('p',tr('Связанные предложения: ','Related proposals: ')+entry.proposalIds.length+' · '+entry.proposalIds.slice(0,50).join(' · ')));
                if(entry.reason==='drive-deleted-review'&&!entry.remoteHash)box.append(element('p',tr('Восстановление пока недоступно: нет подтверждённого SHA-256 объекта.','Restore is currently unavailable: no verified object SHA-256.')));
                if(entry.reason==='drive-deleted-review'&&entry.canRestore===false)box.append(element('p',tr('Восстановление недоступно: Drive запретил скачивание или извлечение из корзины.','Restore is unavailable: Drive denies download or untrash.')));
                if(entry.candidateId)box.append(element('p',tr('Другой ID по этому пути: ','Other ID at this path: ')+entry.candidateId));
                if(entry.remoteVersion)box.append(element('p',tr('Версия Drive: ','Drive version: ')+entry.remoteVersion));
                if(entry.reason==='drive-deleted-review'&&entry.remoteHash&&entry.remoteVersion&&entry.canRestore!==false)button(box,tr('Восстановить прежний объект…','Restore original object…'),()=>this.review(row.namespace,entry)).disabled=this.busy||this.deps.isRunning();
            }else if(row.tombstone)box.append(element('p',tr('Удаление подтверждено через корзину: ','Deletion confirmed through trash: ')+new Date(row.tombstone.deletedAt).toLocaleString()+(row.tombstone.restoredAt?' · '+tr('восстановлен','restored'):'')));
            button(box,tr('Проверить доступ и состояние','Check access and state'),()=>void this.action(async()=>{await this.deps.probe(row.namespace,row.path);await this.load();})).disabled=this.busy||this.deps.isRunning();
            this.list.append(box);
        }
        if(!rows.length)this.list.append(element('p',tr('Нет сохранённых предложений, неизвестных состояний или удалений','No retained proposals, unknown states or deletions')));
        if(rows.length>100){button(this.list,tr('Назад','Previous'),()=>{this.page--;this.render();}).disabled=this.page===0;this.list.append(element('span',`${this.page+1} / ${Math.ceil(rows.length/100)}`));button(this.list,tr('Далее','Next'),()=>{this.page++;this.render();}).disabled=(this.page+1)*100>=rows.length;}
    }
    private review(namespace:string,entry:DriveInboxEntry):void {
        if(this.busy||this.closed||this.deps.isRunning())return;const snapshot=structuredClone(entry),modal=new Modal(this.app);
        modal.contentEl.append(element('h3',tr('Восстановить прежний Drive ID?','Restore original Drive ID?')),element('code',snapshot.path),
            element('p','Drive ID: '+snapshot.originId+' · '+tr('версия: ','version: ')+snapshot.remoteVersion),
            element('p',tr('Локальная версия: ','Local version: ')+(snapshot.local.kind==='missing'?tr('отсутствует','missing'):snapshot.local.sha256)),
            element('p',tr('Содержимое для восстановления: ','Content to restore: ')+snapshot.remoteHash),
            element('p',tr('Объект будет извлечён из корзины при необходимости, с сохранением ID. Локальная версия заменяется только после повторной проверки и сохранения копии. Изменение версий отменит применение.','The object will be untrashed if needed, preserving its ID. Local replacement requires a fresh check and a recovery copy. Changed versions block application.')));
        const accept=button(modal.contentEl,tr('Подтвердить восстановление','Confirm restore'),()=>void this.action(async()=>{accept.disabled=true;try{await this.deps.restore({namespace,entry:snapshot,action:'restore-known'});modal.close();await this.load();}finally{accept.disabled=false;}}));
        button(modal.contentEl,tr('Вернуться','Return'),()=>modal.close());trackModal(modal);modal.open();
    }
    private async action(fn:()=>Promise<void>):Promise<void>{if(this.busy||this.closed||this.deps.isRunning())return;this.busy=true;this.error.textContent='';this.render();
        try{await fn();}catch(error){if(!this.closed)this.error.textContent=String(error);}finally{this.busy=false;this.render();}}
    onClose():void{this.closed=true;this.request++;}
}
