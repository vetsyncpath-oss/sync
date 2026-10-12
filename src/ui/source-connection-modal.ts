import { App, Modal, Notice, Setting } from 'obsidian';
import { EngineRegistry } from '../engines/registry';
import { validateProfiles, type SourceConnection } from '../core/profiles';
import { i18n, resolveLabel } from '../i18n';
export class SourceConnectionModal extends Modal {
    private draft:SourceConnection;
    constructor(app:App,source:SourceConnection,private apply:(source:SourceConnection)=>void){super(app);this.draft=structuredClone(source);}
    onOpen():void {this.render();}
    private render():void {
        const box=this.contentEl,c=this.draft,t=(r:string,e:string)=>i18n.getLocale()==='ru'?r:e;
        box.empty();box.createEl('h3',{text:t('Подключение источника','Source connection')});
        new Setting(box).setName(t('Название','Name')).addText(x=>x.setValue(c.name).onChange(v=>c.name=v));
        new Setting(box).setName(t('Провайдер','Provider')).addDropdown(dd=>{
            for(const d of EngineRegistry.all())dd.addOption(d.kind,resolveLabel(i18n.t,d.labelKey));
            dd.setValue(c.kind).onChange(v=>{c.kind=v as SourceConnection['kind'];c.values=c.kind==='git'?{branch:'default'}:{};this.render();});
        });
        for(const f of EngineRegistry.get(c.kind).settingsSchema){
            const row=new Setting(box).setName(resolveLabel(i18n.t,f.labelKey));
            if(f.helpKey)row.setDesc(resolveLabel(i18n.t,f.helpKey));
            if(f.type==='toggle')row.addToggle(x=>x.setValue(Boolean(c.values[f.key]??f.default)).onChange(v=>c.values[f.key]=v));
            else row.addText(x=>{x.setValue(String(c.values[f.key]??f.default??''));if(f.type==='secret'||f.secret)x.inputEl.type='password';x.onChange(v=>c.values[f.key]=f.type==='number'?Number(v):v);});
        }
        new Setting(box).addButton(b=>b.setButtonText(t('Применить к черновику','Apply to draft')).setCta().onClick(()=>{
            try{
                validateProfiles([],[c]);
                for(const f of EngineRegistry.get(c.kind).settingsSchema)if(f.required&&!String(c.values[f.key]??'').trim())throw Error(resolveLabel(i18n.t,f.labelKey)+': '+t('обязательное поле','required'));
                this.apply(structuredClone(c));this.close();
            }catch(e){new Notice(String(e));}
        })).addButton(b=>b.setButtonText(t('Отмена','Cancel')).onClick(()=>this.close()));
    }
}
