import { App, Modal, Notice, Setting } from 'obsidian';
import { EngineRegistry } from '../engines/registry';
import { i18n, resolveLabel } from '../i18n';
import { validateProfiles, type SyncProfile, type SourceConnection } from '../core/profiles';
import type { WriteMode, DeleteMode, RuleConflict } from '../core/file-rules';
import { trackModal } from './modal-registry';
const ru=()=>i18n.getLocale()==='ru';const t=(r:string,e:string)=>ru()?r:e;
export function writeLabel(mode:WriteMode):string { return ({preserve:t('Не трогать','Do not touch'),create:t('Добавлять отсутствующие','Create missing'),update:t('Обновлять без локальных правок','Update unchanged local files'),remote:t('Версия источника','Match source'),changes:t('Обновлять с разрешением конфликтов','Update with conflict resolution')})[mode]; }
export function deleteLabel(mode:DeleteMode):string { return ({keep:t('Сохранять отсутствующие в источнике','Keep files absent from source'),tracked:t('Удалять ранее синхронизированные','Delete previously synced files'),mirror:t('Удалять все отсутствующие в источнике','Delete all files absent from source')})[mode]; }
export class ProfileLibraryModal extends Modal {
    constructor(app:App,private profiles:SyncProfile[],private connections:SourceConnection[],private save:(p:SyncProfile[],c:SourceConnection[])=>Promise<void>,private sources=false){super(app);this.profiles=structuredClone(profiles);this.connections=structuredClone(connections);}
    onOpen():void { this.render(); }
    private render():void {
        const box=this.contentEl;box.empty();box.createEl('h3',{text:this.sources?t('Подключения','Connections'):t('Профили синхронизации','Sync profiles')});
        box.createEl('p',{text:this.sources?t('Подключение хранит адрес и доступ. Его можно выбрать в пользовательском профиле.','A connection stores endpoint and access settings; select it in a custom profile.'):t('Профили описывают поведение. Назначайте их vault, папкам и файлам в дереве. Проверки путей, целостности и восстановления обязательны.','Profiles describe behaviour. Assign them to vault, folders and files in the tree. Path, integrity and recovery checks are mandatory.')});
        if(this.sources){
            for(const c of this.connections)new Setting(box).setName(c.name).setDesc(c.kind).addButton(b=>b.setButtonText(t('Изменить','Edit')).onClick(()=>this.editConnection(c)))
                .addButton(b=>b.setButtonText(t('Удалить','Remove')).onClick(()=>{if(this.profiles.some(p=>p.source===c.id)){new Notice(t('Подключение используется профилем','Connection is used by a profile'));return;}this.connections=this.connections.filter(x=>x.id!==c.id);this.render();}));
            new Setting(box).addButton(b=>b.setButtonText(t('Добавить подключение','Add connection')).onClick(()=>this.editConnection({id:crypto.randomUUID(),name:'',kind:'git',values:{branch:'main'}})));
        }else{
            for(const p of this.profiles){ const row=new Setting(box).setName(p.name).setDesc(`${writeLabel(p.write)} · ${deleteLabel(p.delete)}${p.source?' · '+(this.connections.find(c=>c.id===p.source)?.name ?? t('Основной источник','Primary source')):''}`)
                .addButton(b=>b.setButtonText(p.builtin?t('Создать свой на основе','Customize copy'):t('Изменить','Edit')).onClick(()=>this.editProfile(p.builtin?{...p,id:crypto.randomUUID(),builtin:false,name:p.name+' — '+t('мой','custom')}:p)));
                if(!p.builtin)row.addButton(b=>b.setButtonText(t('Удалить','Remove')).onClick(()=>{this.profiles=this.profiles.filter(x=>x.id!==p.id);this.render();}));
            }
            new Setting(box).addButton(b=>b.setButtonText(t('Новый профиль','New profile')).onClick(()=>this.editProfile({id:crypto.randomUUID(),name:'',write:'update',delete:'keep'})));
        }
        new Setting(box).addButton(b=>b.setButtonText(t('Сохранить библиотеку','Save library')).setCta().onClick(async()=>{
            try{validateProfiles(this.profiles,this.connections);await this.save(structuredClone(this.profiles),structuredClone(this.connections));this.close();}
            catch(e){new Notice(String(e));}
        })).addButton(b=>b.setButtonText(t('Отмена','Cancel')).onClick(()=>this.close()));
    }
    private editProfile(original:SyncProfile):void {
        const p=structuredClone(original),modal=new Modal(this.app),box=modal.contentEl;
        modal.titleEl.setText(t('Профиль','Profile'));
        new Setting(box).setName(t('Название','Name')).addText(x=>x.setValue(p.name).onChange(v=>p.name=v));
        new Setting(box).setName(t('Источник','Source')).addDropdown(dd=>{dd.addOption('',t('Наследовать','Inherit'));if(this.connections.some(c=>c.id==='primary'))dd.addOption('primary',t('Основной источник','Primary source')); for(const c of this.connections)dd.addOption(c.id,c.name);dd.setValue(p.source??'').onChange(v=>p.source=v||undefined);});
        new Setting(box).setName(t('Запись','Write')).addDropdown(dd=>{for(const w of ['preserve','create','update','remote','changes'] as WriteMode[])dd.addOption(w,writeLabel(w));dd.setValue(p.write).onChange(v=>p.write=v as WriteMode);});
        new Setting(box).setName(t('Исчезновение из источника','When absent from source')).addDropdown(dd=>{for(const d of ['keep','tracked','mirror'] as DeleteMode[])dd.addOption(d,deleteLabel(d));dd.setValue(p.delete).onChange(v=>p.delete=v as DeleteMode);});
        new Setting(box).setName(t('Конфликт при обновлении','Conflict during update')).setDesc(t('Используется только для «Обновлять с разрешением конфликтов».','Used only for Update with conflict resolution.')).addDropdown(dd=>{
            for(const [key,label] of [['keep-both',t('Удалённый на место; локальный в копию','Apply remote; keep local copy')],['incoming',t('Локальный на месте; удалённый в копию','Keep local; incoming copy')],['local-wins',t('Пропустить удалённый','Skip remote')],['ask',t('Запросить решение при ручном запуске','Ask during manual sync')]])dd.addOption(key,label);
            dd.setValue(p.conflict??'keep-both').onChange(v=>p.conflict=v as RuleConflict);
        });
        new Setting(box).addButton(b=>b.setButtonText(t('Готово','Done')).setCta().onClick(()=>{
            try{p.conflict??='keep-both';validateProfiles([p],this.connections);const i=this.profiles.findIndex(x=>x.id===p.id);if(i<0)this.profiles.push(p);else this.profiles[i]=p;modal.close();this.render();}catch(e){new Notice(String(e));}
        }));trackModal(modal);modal.open();
    }
    private editConnection(original:SourceConnection):void {
        const c=structuredClone(original),modal=new Modal(this.app);modal.titleEl.setText(t('Подключение','Connection'));
        const render=()=>{
            const box=modal.contentEl;box.empty();new Setting(box).setName(t('Название','Name')).addText(x=>x.setValue(c.name).onChange(v=>c.name=v));
            new Setting(box).setName(t('Провайдер','Provider')).addDropdown(dd=>{for(const d of EngineRegistry.all())dd.addOption(d.kind,resolveLabel(i18n.t,d.labelKey));dd.setValue(c.kind).onChange(v=>{c.kind=v as SourceConnection['kind'];c.values=c.kind==='git'?{branch:'main'}:{};render();});});
            for(const f of EngineRegistry.get(c.kind).settingsSchema){
                const row=new Setting(box).setName(resolveLabel(i18n.t,f.labelKey));
                if(f.type==='toggle')row.addToggle(x=>x.setValue(Boolean(c.values[f.key]??f.default)).onChange(v=>c.values[f.key]=v));
                else row.addText(x=>{x.setValue(String(c.values[f.key]??f.default??''));if(f.type==='secret'||f.secret)x.inputEl.type='password';x.onChange(v=>c.values[f.key]=f.type==='number'?Number(v):v);});
            }
            new Setting(box).addButton(b=>b.setButtonText(t('Готово','Done')).setCta().onClick(()=>{
                try{if(!c.name.trim())throw new Error(t('Укажите название','Name required'));for(const f of EngineRegistry.get(c.kind).settingsSchema)if(f.required&&!String(c.values[f.key]??'').trim())throw new Error(resolveLabel(i18n.t,f.labelKey)+': '+t('обязательное поле','required'));
                    const i=this.connections.findIndex(x=>x.id===c.id);if(i<0)this.connections.push(c);else this.connections[i]=c;modal.close();this.render();
                }catch(e){new Notice(String(e));}
            }));
        };render();trackModal(modal);modal.open();
    }
}
