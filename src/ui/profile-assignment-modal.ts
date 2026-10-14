import { writeLabel, deleteLabel } from './profile-library';
import { App, Modal, Notice, Setting } from 'obsidian';
import { compileProfiles, type ProfileAssignment, type SyncProfile, type SourceConnection } from '../core/profiles';
import { resolveFileRule, PLUGIN_CODE_FILES } from '../core/file-rules';
import type { SyncPolicy } from '../core/policy';
import { i18n } from '../i18n';
export class ProfileAssignmentModal extends Modal {
    constructor(app:App, private readonly opts:{
        targets:{scope:ProfileAssignment['scope'];path:string}[]; policy:SyncPolicy;
        profiles:SyncProfile[]; connections:SourceConnection[]; apply(assignments:ProfileAssignment[]):void;
    }) { super(app); }
    onOpen():void {
        const {contentEl:box}=this, o=this.opts, ru=i18n.getLocale()==='ru';const t=(r:string,e:string)=>ru?r:e;
        box.empty();box.createEl('h3',{text:t('Назначить профиль','Assign profile')});
        box.createEl('p',{text:o.targets.map(x=>x.path||'Vault').join(', ')});
        const assignments=structuredClone(o.policy.assignments ?? []);
        let selected='', names:string[]|undefined;
        const first=o.targets[0];
        const same=assignments.filter(a=>a.scope===first.scope&&a.path===first.path);
        const existing=same.find(a=>!a.names);selected=existing?.profileId ?? '';
        const describe=box.createEl('p');
        const sourceName=(id?:string)=>id==='primary'?t('Основной источник','Primary source'):
            o.connections.find(c=>c.id===id)?.name ?? t('Наследовать источник','Inherit source');
        const show=()=>{
            const p=o.profiles.find(p=>p.id===selected);
            describe.setText(p?`${p.name} · ${sourceName(p.source)} · ${writeLabel(p.write)} · ${deleteLabel(p.delete)}`:t('Профиль наследуется от родительской области.','Inherit from the parent scope.'));
        };
        new Setting(box).setName(t('Профиль','Profile')).addDropdown(dd=>{
            dd.addOption('',t('Наследовать','Inherit'));
            for(const p of o.profiles) dd.addOption(p.id,p.name);
            dd.setValue(selected).onChange(v=>{selected=v;show();});
        });show();
        if (o.targets.every(x=>x.scope!=='file')) {
            let customInput:{setValue(value:string):unknown};
            new Setting(box).setName(t('Файлы в области','Files in scope'))
                .addButton(b=>b.setButtonText(t('Все','All')).onClick(()=>{names=undefined;customInput.setValue('');}))
                .addButton(b=>b.setButtonText(t('Код плагинов','Plugin code')).onClick(()=>{names=[...PLUGIN_CODE_FILES];customInput.setValue(names.join(', '));}))
                .addButton(b=>b.setButtonText('data.json').onClick(()=>{names=['data.json'];customInput.setValue('data.json');}));
            new Setting(box).setName(t('Имена через запятую','Names separated by commas')).addText(input=>{
                customInput=input;input.onChange(v=>{const n=v.split(',').map(x=>x.trim()).filter(Boolean);names=n.length?n:undefined;});
            });
        }
        box.createEl('h4',{text:t('Собственные назначения','Direct assignments')});
        for(const a of same) {
            new Setting(box).setName(o.profiles.find(p=>p.id===a.profileId)?.name ?? a.profileId ?? 'Inherited').setDesc(a.names?.join(', ') ?? t('Все файлы','All files'))
                .addButton(b=>b.setButtonText(t('Убрать','Remove')).onClick(()=>{
                    const idx=assignments.indexOf(a);if(idx>=0)assignments.splice(idx,1);o.apply(assignments);this.close();
                }));
        }
        const effective=resolveFileRule(first.scope==='folder'?`${first.path}/__file__`:first.path,compileProfiles(o.policy,o.profiles).fileRules);
        box.createEl('p',{text:t('Сейчас: ','Current: ')+sourceName(effective.source ?? 'primary')+t('. Исключения и разрешения на код действуют независимо.','. Exclusions and code permissions apply separately.')});
        new Setting(box).addButton(b=>b.setButtonText(t('Применить к дереву','Apply to tree')).setCta().onClick(()=>{
            try {
                const sameNames=(a?:string[],b?:string[])=>JSON.stringify([...(a??[])].sort())===JSON.stringify([...(b??[])].sort());
                let next=[...assignments];
                for(const target of o.targets){
                    next=next.filter(a=>!(a.scope===target.scope&&a.path===target.path&&sameNames(a.names,names)));
                    if(selected)next.push({...target,names,profileId:selected});
                }
                const compiled=compileProfiles({...o.policy,assignments:next},o.profiles);
                // Evaluate witnesses to catch ambiguous equal-priority source selectors before Save.
                for(const a of next) for(const name of a.names??['__file__']) resolveFileRule(a.scope==='file'?a.path:[a.path,name].filter(Boolean).join('/'),compiled.fileRules);
                o.apply(next);this.close();
            }catch(e){new Notice(String(e));}
        })).addButton(b=>b.setButtonText(t('Отмена','Cancel')).onClick(()=>this.close()));
    }
}
