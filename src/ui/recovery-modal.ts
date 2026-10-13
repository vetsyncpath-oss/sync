import { App, Modal, Notice } from 'obsidian';
import type { OperationRecord } from '../core/operation-store';
import type { LocalVersion } from '../core/local-version';
import { formatBytes } from '../utils/format';
import { trackModal } from './modal-registry';
import { button, element, textInput, tr } from './dom';

export interface RecoveryDeps {
    retention?():Promise<{before:number;ids:string[];objects?:{count:number;bytes:number}}>;
    prune?(preview:{before:number;ids:string[];objects?:{count:number;bytes:number}}):Promise<void>;
    load():Promise<{records:OperationRecord[];used:number;limit:number}>;
    verify(id:string):Promise<void>;
    restore(id:string):Promise<string>;
    export?(id:string):Promise<void>;
    inspect(record:OperationRecord):Promise<{current:LocalVersion;from?:LocalVersion}>;
    keep(id:string,current:LocalVersion,from?:LocalVersion):Promise<void>;
    open(path:string):void;
    isRunning():boolean;
}
export class RecoveryModal extends Modal {
    private data?:Awaited<ReturnType<RecoveryDeps['load']>>;
    private list!:HTMLElement;private query='';private page=0;private closed=false;private busy=false;
    private restored=new Map<string,string>();
    constructor(app:App,private deps:RecoveryDeps){super(app);}
    onOpen():void {
        const box=this.contentEl;box.replaceChildren();box.append(element('h2',tr('Восстановление и незавершённые операции','Recovery and unfinished operations')));
        box.append(element('p',tr('Восстановление создаёт отдельную копию рядом с файлом. Текущие файлы и история сохраняются.','Restoring creates a separate copy beside the file. Current files and history are retained.')));
        const search=textInput('',value=>{this.query=value;this.page=0;this.render();});search.type='search';search.placeholder=tr('Найти путь','Find path');search.setAttribute('aria-label',search.placeholder);box.append(search);
        this.list=element('div');box.append(this.list);button(box,tr('Обновить','Refresh'),()=>void this.load());if(this.deps.retention&&this.deps.prune)button(box,tr('Управление старой историей','Manage old history'),()=>void this.retention());button(box,tr('Закрыть','Close'),()=>this.close());void this.load();
    }
    private async load():Promise<void>{
        this.list.replaceChildren(element('p',tr('Читаем историю…','Reading history…')));
        try{const data=await this.deps.load();if(this.closed)return;this.data=data;this.render();}
        catch(error){if(!this.closed)this.list.replaceChildren(element('p',tr('История недоступна. Автоматическое удаление или сброс не выполняется. ','History is unavailable. No automatic deletion or reset is performed. ')+String(error),'sync-workspace-error'));}
    }
    private render():void {
        if(!this.data||this.closed)return;this.list.replaceChildren();
        this.list.append(element('p',tr('Восстановительные копии: ','Recovery storage: ')+formatBytes(this.data.used)+' / '+formatBytes(this.data.limit)+' · '+tr('Операций в истории: ','Operations in history: ')+this.data.records.length));
        const records=this.data.records.filter(r=>(r.recovery||r.status==='blocked'||r.status==='committing')&&r.path.toLowerCase().includes(this.query.toLowerCase())).sort((a,b)=>b.createdAt-a.createdAt);
        for(const record of records.slice(this.page*50,(this.page+1)*50)) {
            const row=element('div','','sync-assignment-row');row.append(element('strong',record.path),element('p',new Date(record.createdAt).toLocaleString()+' · '+record.kind+' · '+record.status));
            if(record.from)row.append(element('small',tr('Исходный путь: ','Original path: ')+record.from));
            if(record.recovery){
                row.append(element('p',tr('Сохранённая версия: ','Saved version: ')+formatBytes(record.recovery.size)));
                button(row,tr('Проверить копию','Verify copy'),()=>void this.action(async()=>{await this.deps.verify(record.id);new Notice(tr('Целостность копии подтверждена','Copy integrity verified'));})).disabled=this.busy;
                if(this.deps.export)button(row,tr('Скачать сохранённую версию','Download saved version'),()=>void this.action(()=>this.deps.export!(record.id))).disabled=this.busy;
                button(row,tr('Сохранить копию рядом','Restore beside original'),()=>void this.action(async()=>{
                    const path=await this.deps.restore(record.id);this.restored.set(record.id,path);new Notice(tr('Создана копия: ','Copy created: ')+path);
                })).disabled=this.busy||this.deps.isRunning();
            }
            const restored=this.restored.get(record.id);
            if(restored)button(row,tr('Открыть восстановленный файл','Open restored file'),()=>this.deps.open(restored));
            if(record.status==='blocked'||record.status==='committing')button(row,tr('Оставить текущие файлы','Keep current files'),()=>void this.review(record)).disabled=this.busy||this.deps.isRunning();
            this.list.append(row);
        }
        if(!records.length)this.list.append(element('p',tr('Нет копий или операций, требующих решения','No copies or operations needing review')));
        if(records.length>50){button(this.list,tr('Назад','Previous'),()=>{this.page--;this.render();}).disabled=this.page===0;this.list.append(element('span',(this.page+1)+' / '+Math.ceil(records.length/50)));button(this.list,tr('Далее','Next'),()=>{this.page++;this.render();}).disabled=(this.page+1)*50>=records.length;}
    }
    private async action(fn:()=>Promise<void>):Promise<void>{
        if(this.busy||this.closed)return;this.busy=true;this.render();
        try{await fn();}catch(error){new Notice(String(error));}finally{this.busy=false;this.render();}
    }
    private async retention():Promise<void>{
        if(this.busy||this.deps.isRunning())return;
        try{const preview=await this.deps.retention!();if(this.closed)return;const modal=new Modal(this.app);
            modal.contentEl.append(element('h3',tr('Очистить завершённую историю старше 30 дней?','Remove completed history older than 30 days?')),
                element('p',tr('Можно удалить операций: ','Eligible operations: ')+preview.ids.length),
                element('p',tr('Ненужных копий: ','Unreferenced copies: ')+(preview.objects?.count??0)+' · '+formatBytes(preview.objects?.bytes??0)),
                element('p',tr('Текущие исходные версии, последнее применение каждого пути и незавершённые операции сохранятся. Старые копии без ссылок из оставшейся истории будут удалены. При необходимости скачайте их до очистки. Это действие нельзя отменить.','Current baselines, the latest application for each path and unfinished operations remain. Old copies no longer referenced by retained history will be deleted. Download copies you need before cleanup. This action cannot be undone.')));
            const accept=button(modal.contentEl,tr('Удалить старую историю и ненужные копии','Delete old history and unreferenced copies'),()=>void this.action(async()=>{accept.disabled=true;await this.deps.prune!(preview);modal.close();await this.load();}));
            button(modal.contentEl,tr('Вернуться','Return'),()=>modal.close());trackModal(modal);modal.open();
        }catch(error){new Notice(String(error));}
    }
    private async review(record:OperationRecord):Promise<void>{
        try{
            const versions=await this.deps.inspect(record);if(this.closed)return;const modal=new Modal(this.app);
            modal.contentEl.append(element('h3',tr('Сохранить текущие файлы?','Keep current files?')),element('code',record.path));
            const describe=(version:LocalVersion)=>version.kind==='missing'?tr('Нет файла','Missing'):formatBytes(version.size)+' · SHA-256 '+version.sha256.slice(0,12);
            modal.contentEl.append(element('p',tr('Сейчас: ','Current: ')+describe(versions.current)));
            if(versions.from)modal.contentEl.append(element('p',(record.from??'')+': '+describe(versions.from)));
            modal.contentEl.append(element('p',tr('Зависшая операция будет закрыта без повторного исполнения. Сохранённая копия и история останутся. Перед решением текущие версии проверяются снова.','The unfinished operation will be closed without replaying it. Its saved copy and history remain. Current versions are checked again before accepting.')));
            const accept=button(modal.contentEl,tr('Подтвердить сохранение текущих файлов','Confirm keeping current files'),()=>void this.action(async()=>{
                accept.disabled=true;try{await this.deps.keep(record.id,versions.current,versions.from);modal.close();await this.load();}finally{accept.disabled=false;}
            }));button(modal.contentEl,tr('Вернуться','Return'),()=>modal.close());trackModal(modal);modal.open();
        }catch(error){new Notice(String(error));}
    }
    onClose():void{this.closed=true;}
}
