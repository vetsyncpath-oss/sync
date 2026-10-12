import { App, Modal, Notice, Setting } from 'obsidian';
import { compileProfiles, validateProfiles, type ProfileAssignment, type SourceConnection, type SyncProfile } from '../core/profiles';
import { resolveFileRule, PLUGIN_CODE_FILES } from '../core/file-rules';
import { computeLocalPath, type SyncPolicy } from '../core/policy';
import type { PathPolicy } from '../core/path-policy';
import type { RemoteEntry } from '../sources/types';
import { sourceCandidates } from '../core/source-bindings';
import { buildLocalTree, buildRemoteTree, sortChildren, type TreeNode } from './tree-walk';
import { SourceInventories } from './source-inventories';
import { SourceConnectionModal } from './source-connection-modal';
import { trackModal, isForceClosingModals } from './modal-registry';
import { writeLabel, deleteLabel } from './profile-library';
import { i18n } from '../i18n';
import { fullVaultPolicy, obsidianOnlyPolicy } from './status';

interface WorkspaceDeps {
    policy:SyncPolicy; profiles:SyncProfile[]; connections:SourceConnection[];
    pathPolicy:PathPolicy; pluginDir:string; isRunning():boolean;
    local():Promise<{files:string[];folders:string[]}>;
    fetch(connection:SourceConnection,signal:AbortSignal):Promise<RemoteEntry[]>;
    save(policy:SyncPolicy,connections:SourceConnection[]):Promise<void>;
    dispose():void;
}
const tr=(r:string,e:string)=>i18n.getLocale()==='ru'?r:e;
function element<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className=''):HTMLElementTagNameMap[K]{
    const el=document.createElement(tag);el.textContent=text;el.className=className;return el;
}
export class SyncWorkspaceModal extends Modal {
    private policy:SyncPolicy;
    private connections:SourceConnection[];
    private readonly initial:string;
    private readonly inventories=new SourceInventories();
    private localFiles:string[]=[];private localFolders:string[]=[];
    private localState='loading';private localError='';
    private view='vault';private selected={scope:'vault' as ProfileAssignment['scope'],path:''};
    private expanded=new Set<string>(['']);private search='';private page=0;
    private selection=new Map<string,'folder'|'file'>();
    private closed=false;private approved=false;private saving=false;
    private treeBox!:HTMLElement;private inspector!:HTMLElement;private sourceBox!:HTMLElement;private summary!:HTMLElement;
    constructor(app:App,private deps:WorkspaceDeps){
        super(app);this.policy=structuredClone(deps.policy);this.connections=structuredClone(deps.connections);this.initial=this.fingerprint();
    }
    private fingerprint():string{return JSON.stringify([this.policy,this.connections]);}
    onOpen():void {
        if(this.modalEl){this.modalEl.style.width='min(1100px, 95vw)';this.modalEl.style.maxWidth='95vw';}
        const box=this.contentEl;box.replaceChildren();box.classList.add('sync-workspace');
        box.append(element('h2',tr('Синхронизация vault','Vault synchronization')));
        const toolbar=element('div','','sync-workspace-toolbar');
        this.button(toolbar,tr('Vault','Vault'),()=>this.switchView('vault'));
        this.button(toolbar,tr('Добавить источник','Add source'),()=>this.editSource());
        this.button(toolbar,tr('Обновить локальное дерево','Refresh local tree'),()=>void this.loadLocal());
        this.button(toolbar,tr('Профиль выделенным','Profile for selection'),()=>this.bulkProfiles());
        new Setting(toolbar).setName(tr('Область','Scope')).addDropdown(dd=>{
            dd.addOption('custom',tr('Настроенная','Custom')).addOption('full',tr('Весь vault','Entire vault')).addOption('obsidian',tr('Настройки Obsidian','Obsidian configuration'));
            dd.setValue(this.policy.preset??'custom').onChange(value=>{
                if(value==='custom'){this.policy.preset='custom';this.render();return;}
                const base=value==='obsidian'?obsidianOnlyPolicy(this.deps.pluginDir):fullVaultPolicy(this.deps.pluginDir);
                this.policy={...this.policy,...base,assignments:this.policy.assignments,defaultSource:this.policy.defaultSource,
                    fileExclusions:[...(this.policy.fileExclusions??[]),...(base.fileExclusions??[])].filter((a,i,all)=>all.findIndex(b=>b.pattern===a.pattern&&b.scope===a.scope)===i)};this.render();
            });
        });
        const search=element('input');search.type='search';search.placeholder=tr('Найти путь','Find path');search.setAttribute('aria-label',search.placeholder);
        search.addEventListener('input',()=>{this.search=search.value;this.page=0;this.renderTree();});toolbar.append(search);box.append(toolbar);
        const layout=element('div','','sync-workspace-layout');
        this.sourceBox=element('nav','','sync-workspace-sources');this.sourceBox.setAttribute('aria-label',tr('Источники','Sources'));
        this.treeBox=element('div','','sync-workspace-tree');this.inspector=element('section','','sync-workspace-inspector');
        layout.append(this.sourceBox,this.treeBox,this.inspector);box.append(layout);
        const footer=element('div','','sync-workspace-footer');this.summary=element('p');footer.append(this.summary);
        this.button(footer,tr('Сохранить назначения','Save assignments'),()=>void this.save());
        this.button(footer,tr('Закрыть','Close'),()=>this.close());box.append(footer);
        this.render();void this.loadLocal();
        // Local editing opens immediately; source access errors remain inside that source's view.
        const connection=this.connections.find(c=>c.id===this.policy.defaultSource);
        if(connection)void this.loadSource(connection);
    }
    private button(parent:HTMLElement,label:string,action:()=>void):HTMLButtonElement{
        const button=element('button',label);button.type='button';button.addEventListener('click',action);parent.append(button);return button;
    }
    private render():void {if(this.closed)return;this.renderSources();this.renderTree();this.renderInspector();this.renderSummary();}
    private renderSummary():void {
        this.summary.textContent=`${tr('Назначения','Assignments')}: ${this.policy.assignments?.length??0} · ${tr('Выделено','Selected')}: ${this.selection.size} · ${this.fingerprint()===this.initial?tr('Сохранено','Saved'):tr('Есть несохранённые изменения','Unsaved changes')}`;
    }
    private renderSources():void {
        this.sourceBox.replaceChildren();
        new Setting(this.sourceBox).setName(tr('Источник для хранилища','Vault source')).setDesc(tr('Для файлов без отдельного назначения','For files without a source assignment')).addDropdown(dd=>{
            dd.addOption('',tr('Только назначения в дереве','Assignments only'));
            for(const c of this.connections)dd.addOption(c.id,c.name);
            dd.setValue(this.policy.defaultSource??'').onChange(v=>{this.policy.defaultSource=v||undefined;this.render();const c=this.connections.find(c=>c.id===v);if(c&&this.inventories.state(v).status==='idle')void this.loadSource(c);});
        });
        for(const c of this.connections){
            const state=this.inventories.state(c.id),group=element('div','','sync-workspace-source');
            const text=`${c.name}${c.id===this.policy.defaultSource?tr(' · по умолчанию',' · default'):''}`;
            const select=this.button(group,text,()=>this.switchView(c.id));select.setAttribute('aria-pressed',String(this.view===c.id));
            group.append(element('small',state.status==='error'?tr('Ошибка; прежний снимок устарел','Error; previous snapshot stale'):state.status==='loading'?tr('Загрузка…','Loading…'):state.loadedAt?`${tr('Снимок','Snapshot')}: ${new Date(state.loadedAt).toLocaleString()}`:tr('Не загружен','Not loaded')));
            this.button(group,tr('Настроить','Configure'),()=>this.editSource(c));
            this.button(group,tr('Проверить / обновить','Check / refresh'),()=>{this.view=c.id;void this.loadSource(c);this.render();});
            this.button(group,tr('По умолчанию для vault','Default for vault'),()=>{this.policy.defaultSource=c.id;this.render();});
            this.button(group,tr('Удалить подключение','Remove connection'),()=>{
                const compiled=compileProfiles(this.policy,this.deps.profiles);
                if(this.policy.defaultSource===c.id || compiled.fileRules?.some(r=>r.source===c.id) || this.deps.profiles.some(p=>p.source===c.id)){
                    new Notice(tr('Сначала уберите назначения и ссылки на подключение','Remove assignments and connection references first'));return;
                }
                this.inventories.invalidate(c.id);this.connections=this.connections.filter(x=>x.id!==c.id);if(this.view===c.id)this.view='vault';this.render();
            });this.sourceBox.append(group);
        }
        if(!this.connections.length)this.sourceBox.append(element('p',tr('Добавьте подключение источника','Add a source connection')));
    }
    private switchView(view:string):void{
        this.view=view;this.selection.clear();this.selected={scope:'vault',path:''};this.expanded=new Set(['']);this.page=0;this.render();
        const source=this.connections.find(c=>c.id===view);if(source&&this.inventories.state(view).status==='idle')void this.loadSource(source);
    }
    private async loadLocal():Promise<void>{
        this.localState='loading';this.localError='';this.renderTree();
        try{const snapshot=await this.deps.local();if(this.closed)return;this.localFiles=snapshot.files;this.localFolders=snapshot.folders;this.localState='ready';}
        catch(e){if(this.closed)return;this.localState='error';this.localError=String(e);}
        this.renderSources();this.renderTree();this.renderSummary();
    }
    private async loadSource(connection:SourceConnection):Promise<void>{
        const loading=this.inventories.load(connection.id,signal=>this.deps.fetch(structuredClone(connection),signal));this.renderSources();this.renderTree();
        await loading;if(!this.closed){this.renderSources();this.renderTree();}
    }
    private editSource(source?:SourceConnection):void{
        const modal=new SourceConnectionModal(this.app,source??{id:crypto.randomUUID(),name:'',kind:'git',values:{branch:'default'}},draft=>{
            const index=this.connections.findIndex(c=>c.id===draft.id);if(index<0)this.connections.push(draft);else this.connections[index]=draft;
            this.inventories.invalidate(draft.id);this.view=draft.id;this.render();void this.loadSource(draft);
        });trackModal(modal);modal.open();
    }
    private mapped(path:string):string{
        const r=this.policy.folders.filter(r=>r.target&&(!r.path||path===r.path||path.startsWith(r.path+'/'))).sort((a,b)=>b.path.length-a.path.length)[0];
        return r?computeLocalPath(path,r.path,r):path;
    }
    private projected():Map<string,string>{
        const result=new Map<string,string>(),rules=compileProfiles(this.policy,this.deps.profiles).fileRules??[];
        for(const c of this.connections)for(const entry of this.inventories.state(c.id).entries)
            for(const path of sourceCandidates(entry.path,c.id,rules,this.policy.defaultSource??'',p=>this.mapped(p)))result.set(resolveFileRule(path,rules).remotePath!==undefined?path:this.mapped(path),c.id);
        return result;
    }
    private renderTree():void{
        if(!this.treeBox)return;this.treeBox.replaceChildren();
        this.treeBox.append(element('h3',this.view==='vault'?'Vault':this.connections.find(c=>c.id===this.view)?.name??this.view));
        let root:TreeNode;
        if(this.view==='vault'){
            if(this.localState==='loading')this.treeBox.append(element('p',tr('Читаем локальный vault…','Reading local vault…')));
            if(this.localError)this.treeBox.append(element('p',this.localError,'sync-workspace-error'));
            root=buildLocalTree(new Set([...this.localFiles,...this.projected().keys()]),this.localFolders);
        }else{
            const state=this.inventories.state(this.view);
            if(state.status==='loading')this.treeBox.append(element('p',tr('Загрузка манифеста…','Loading inventory…')));
            if(state.error)this.treeBox.append(element('p',state.error+(state.loadedAt?tr(' · показан устаревший снимок',' · showing stale snapshot'):''),'sync-workspace-error'));
            root=buildRemoteTree(state.entries);
        }
        sortChildren(root);const flat:{node:TreeNode;depth:number}[]=[];
        const visit=(node:TreeNode,depth:number)=>{
            if(!this.search || node.path.toLowerCase().includes(this.search.toLowerCase()))flat.push({node,depth});
            if(this.search || this.expanded.has(node.path))for(const child of node.children)visit(child,depth+1);
        };visit(root,0);
        const pageSize=150;this.page=Math.min(this.page,Math.max(0,Math.ceil(flat.length/pageSize)-1));
        const list=element('div');list.setAttribute('role','tree');list.setAttribute('aria-label',this.view==='vault'?'Vault':tr('Файлы источника','Source files'));
        const rules=compileProfiles(this.policy,this.deps.profiles).fileRules;
        const projected=this.view==='vault'?this.projected():new Map<string,string>();
        for(const {node,depth} of flat.slice(this.page*pageSize,(this.page+1)*pageSize)){
            const row=element('div','','sync-workspace-row');row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(depth+1));row.setAttribute('data-path',node.path);row.tabIndex=0;row.style.paddingLeft=`${depth*14}px`;
            if(this.view==='vault'&&node.path){const check=element('input');check.type='checkbox';check.checked=this.selection.has(node.path);check.setAttribute('aria-label',tr('Выделить ','Select ')+node.path);check.addEventListener('change',()=>{check.checked?this.selection.set(node.path,node.kind):this.selection.delete(node.path);this.renderSummary();});row.append(check);}
            if(node.kind==='folder'){
                row.setAttribute('aria-expanded',String(this.expanded.has(node.path)));
                this.button(row,this.expanded.has(node.path)?'▾':'▸',()=>{this.expanded.has(node.path)?this.expanded.delete(node.path):this.expanded.add(node.path);this.renderTree();}).setAttribute('aria-label',tr('Раскрыть / свернуть','Expand / collapse'));
            }
            this.button(row,node.path?node.name:tr('Весь vault / корень','Entire vault / root'),()=>this.selectNode(node));
            row.addEventListener('keydown',event=>{if(event.target!==row)return;if(event.key==='Enter'){event.preventDefault();this.selectNode(node);}if(node.kind==='folder'&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){event.preventDefault();event.key==='ArrowRight'?this.expanded.add(node.path):this.expanded.delete(node.path);this.renderTree();}});
            if(this.view==='vault'&&node.path){
                const witness=node.kind==='folder'?node.path+'/__file__':node.path,resolved=resolveFileRule(witness,rules);
                const owner=this.connections.find(c=>c.id===(resolved.source??this.policy.defaultSource));
                const own=this.policy.assignments?.some(a=>a.path===node.path);
                row.append(element('small',`${this.mixedSources(node.path,resolved.source??this.policy.defaultSource)?tr('Несколько источников','Multiple sources'):owner?.name??tr('Нет источника','No source')} · ${writeLabel(resolved.write??'update')}${own?tr(' · назначено здесь',' · assigned here'):tr(' · наследуется',' · inherited')}`));
            }
            if(this.view==='vault'&&node.kind==='file'){
                const excluded=this.policy.folders.filter(f=>f.include!=='inherit'&&(!f.path||node.path===f.path||node.path.startsWith(f.path+'/'))).sort((a,b)=>b.path.length-a.path.length)[0]?.include==='exclude';
                const status=excluded?tr('Исключён','Excluded'):!this.deps.pathPolicy.isPathAllowed(node.path)?tr('Защищён разрешениями','Protected by permissions'):
                    projected.has(node.path)?this.localFiles.includes(node.path)?tr('Есть локально и в снимке источника','Present locally and in source snapshot'):tr('Есть только в источнике','Source only'):
                    tr('Локальный; наличие в источнике не подтверждено','Local; source availability unconfirmed');
                row.append(element('small',status));
            }
            list.append(row);
        }
        this.treeBox.append(list);
        if(flat.length>pageSize){const pager=element('div');this.button(pager,tr('Назад','Previous'),()=>{this.page=Math.max(0,this.page-1);this.renderTree();});pager.append(element('span',`${this.page+1} / ${Math.ceil(flat.length/pageSize)}`));this.button(pager,tr('Далее','Next'),()=>{this.page=Math.min(Math.ceil(flat.length/pageSize)-1,this.page+1);this.renderTree();});this.treeBox.append(pager);}
    }
    private bulkProfiles():void{
        if(!this.selection.size){new Notice(tr('Выделите папки или файлы в vault','Select folders or files in the vault'));return;}
        const modal=new Modal(this.app);modal.contentEl.append(element('h3',tr('Профиль для выделенных областей','Profile for selected scopes')));
        modal.contentEl.append(element('p',[...this.selection.keys()].join(', ')));let profile='';
        new Setting(modal.contentEl).setName(tr('Профиль','Profile')).addDropdown(dd=>{dd.addOption('',tr('Наследовать','Inherit'));for(const p of this.deps.profiles)dd.addOption(p.id,p.name);dd.onChange(v=>profile=v);});
        this.button(modal.contentEl,tr('Применить к черновику','Apply to draft'),()=>{
            try{const next=structuredClone(this.policy);
                for(const [path,scope] of this.selection){
                    const existing=next.assignments?.find(a=>a.path===path&&a.scope===scope&&!a.names);
                    next.assignments=(next.assignments??[]).filter(a=>!(a.path===path&&a.scope===scope&&!a.names));
                    if(profile||existing?.source)next.assignments.push({...existing,path,scope,profileId:profile||undefined});
                }
                compileProfiles(next,this.deps.profiles);this.policy=next;modal.close();this.render();
            }catch(e){new Notice(String(e));}
        });this.button(modal.contentEl,tr('Отмена','Cancel'),()=>modal.close());trackModal(modal);modal.open();
    }
    private mixedSources(path:string,inherited?:string):boolean{
        const ids=new Set(inherited?[inherited]:[]);
        for(const a of this.policy.assignments??[])if(a.path===path||a.path.startsWith(path+'/')){
            const source=a.source??this.deps.profiles.find(p=>p.id===a.profileId)?.source;if(source)ids.add(source);
        }
        return ids.size>1;
    }
    private selectNode(node:TreeNode):void{
        this.selected={scope:node.path?(node.kind==='file'?'file':'folder'):'vault',path:node.path};this.renderInspector();
    }
    private renderInspector():void{
        if(!this.inspector)return;const box=this.inspector;box.replaceChildren();
        const remote=this.view!=='vault',scope=this.selected.scope;
        box.append(element('h3',this.selected.path||tr('Весь vault','Entire vault')));
        box.append(element('p',remote?tr('Выберите, куда разместить этот путь в vault.','Choose where to place this source path in the vault.'):tr('Связь с источником и поведение выбранной области.','Source binding and behaviour of the selected scope.')));
        const same=(this.policy.assignments??[]).filter(a=>a.scope===scope&&a.path===this.selected.path);
        const current=same.find(a=>!a.names);
        let destination=remote?this.selected.path:this.selected.path;
        let source=remote?this.view:current?.source??'',remotePath=remote?this.selected.path:current?.remotePath;
        let profile=current?.profileId??'',names:string[]|undefined;
        if(remote)new Setting(box).setName(tr('Путь в vault','Vault path')).addText(x=>x.setValue(destination).onChange(v=>destination=v));
        let sourceInput:{setValue(value:string):unknown};
        let pathInput:{setValue(value:string):unknown};
        new Setting(box).setName(tr('Источник','Source')).addDropdown(dd=>{
            sourceInput=dd;
            dd.addOption('',tr('Наследовать','Inherit'));for(const c of this.connections)dd.addOption(c.id,c.name);
            dd.setValue(source).onChange(v=>{source=v;remotePath=v?destination:undefined;pathInput.setValue(remotePath??'');});
        });
        new Setting(box).setName(tr('Путь в источнике','Source path')).setDesc(tr('Пустой путь — корень. Выберите путь из отдельного дерева источника.','Empty means root. Pick a path from the source’s own tree.')).addText(x=>{pathInput=x;x.setValue(remotePath??'').onChange(v=>remotePath=v);});
        this.button(box,tr('Выбрать путь из источника','Pick source path'),()=>{
            const id=source||this.policy.defaultSource,c=this.connections.find(c=>c.id===id);if(!c){new Notice(tr('Сначала выберите источник','Choose a source first'));return;}
            source=c.id;sourceInput.setValue(source);
            const picker=new Modal(this.app);picker.contentEl.append(element('h3',c.name));
            const state=this.inventories.state(c.id);
            if(state.status!=='ready')picker.contentEl.append(element('p',tr('Сначала проверьте / обновите источник. Прежний снимок может быть устаревшим.','Check / refresh this source first. A previous snapshot may be stale.')));
            const search=element('input');search.placeholder=tr('Найти путь','Find path');picker.contentEl.append(search);const paths=element('div');picker.contentEl.append(paths);
            const root=buildRemoteTree(state.entries),items:string[]=[];
            const visit=(node:TreeNode)=>{if(scope==='file'?node.kind==='file':node.kind==='folder')items.push(node.path);for(const child of node.children)visit(child);};visit(root);
            const show=()=>{paths.replaceChildren();const matches=items.filter(p=>p.toLowerCase().includes(search.value.toLowerCase()));for(const path of matches.slice(0,150))this.button(paths,path||tr('Корень','Root'),()=>{remotePath=path;pathInput.setValue(path);picker.close();});if(matches.length>150)paths.append(element('p',tr('Уточните поиск для остальных путей','Refine the search to see other paths')));};search.addEventListener('input',show);show();trackModal(picker);picker.open();
        });
        new Setting(box).setName(tr('Профиль поведения','Behaviour profile')).addDropdown(dd=>{
            dd.addOption('',tr('Наследовать','Inherit'));for(const p of this.deps.profiles)dd.addOption(p.id,p.name);dd.setValue(profile).onChange(v=>profile=v);
        });
        if(scope!=='file'){
            let input:{setValue(value:string):unknown};const setNames=(value:string[]|undefined)=>{names=value;input.setValue(value?.join(', ')??'');};
            new Setting(box).setName(tr('Какие файлы','Which files')).addButton(b=>b.setButtonText(tr('Все','All')).onClick(()=>setNames(undefined))).addButton(b=>b.setButtonText(tr('Код плагинов','Plugin code')).onClick(()=>setNames([...PLUGIN_CODE_FILES]))).addButton(b=>b.setButtonText('data.json').onClick(()=>setNames(['data.json'])));
            new Setting(box).setName(tr('Имена через запятую','Names separated by commas')).addText(x=>{input=x;x.onChange(v=>{const values=v.split(',').map(s=>s.trim()).filter(Boolean);names=values.length?values:undefined;});});
        }
        if(!remote){
            const compiled=compileProfiles(this.policy,this.deps.profiles),witness=scope==='folder'?destination+'/__file__':destination;
            const effective=resolveFileRule(witness,compiled.fileRules),owner=this.connections.find(c=>c.id===(effective.source??this.policy.defaultSource));
            box.append(element('p',`${tr('Сейчас','Current')}: ${owner?.name??tr('Не назначено','Unassigned')} · ${writeLabel(effective.write??'update')} · ${deleteLabel(effective.delete??'keep')}`));
            if(effective.sourceRule!==undefined){const rule=compiled.fileRules![effective.sourceRule];box.append(element('p',`${tr('Получено от назначения','Inherited from assignment')}: ${rule.path||'Vault'}${rule.remotePath!==undefined?' · '+rule.remotePath:''}`));}
            if(effective.sourceRule!==undefined){const rule=compiled.fileRules![effective.sourceRule];if(rule.remotePath!==undefined)box.append(element('p',`${owner?.name??''}:${rule.remotePath} → Vault:${rule.path}`));}
            for(const assignment of same){const row=element('div');row.append(element('p',`${assignment.names?.join(', ')??tr('Все файлы','All files')} · ${this.deps.profiles.find(p=>p.id===assignment.profileId)?.name??tr('Поведение наследуется','Behaviour inherited')} · ${this.connections.find(c=>c.id===assignment.source)?.name??tr('Источник наследуется','Source inherited')}`));this.button(row,tr('Убрать назначение','Remove assignment'),()=>{this.policy.assignments=this.policy.assignments?.filter(a=>a!==assignment);this.render();});box.append(row);}
        }
        this.button(box,remote?tr('Разместить в vault','Place in vault'):tr('Применить к черновику','Apply to draft'),()=>{
            try{
                if(this.deps.isRunning())throw Error(tr('Синхронизация выполняется','Synchronization is running'));
                const targetScope=scope==='vault'&&destination?'folder':scope;
                if(destination&&!this.deps.pathPolicy.isPathSafe(destination))throw Error(tr('Небезопасный путь vault','Unsafe vault path'));
                const next=structuredClone(this.policy),selectors=(value?:string[])=>JSON.stringify([...(value??[])].sort());
                next.assignments=(next.assignments??[]).filter(a=>!(a.scope===targetScope&&a.path===destination&&selectors(a.names)===selectors(names)));
                if(source||profile)next.assignments.push({scope:targetScope,path:destination,names,profileId:profile||undefined,source:source||undefined,remotePath:source?remotePath:undefined});
                // Explicit destination linking may open a child of a migrated excluded scope.
                if(source&&!next.folders.some(f=>f.path===destination&&f.include==='include'))next.folders.push({path:destination,include:'include'});
                compileProfiles(next,this.deps.profiles);this.policy=next;
                box.append(element('p',`${source?this.connections.find(c=>c.id===source)?.name:''}:${remotePath??''} → Vault:${destination}`));this.render();
            }catch(e){new Notice(String(e));}
        });
        if(!remote)this.button(box,tr('Не синхронизировать эту область','Do not sync this scope'),()=>{
            this.policy.folders=this.policy.folders.filter(f=>f.path!==destination);this.policy.folders.push({path:destination,include:'exclude'});this.render();
        });
    }
    private async save():Promise<void>{
        if(this.saving)return;this.saving=true;
        try{
            if(this.deps.isRunning())throw Error(tr('Синхронизация выполняется','Synchronization is running'));
            validateProfiles(this.deps.profiles,this.connections);const compiled=compileProfiles(this.policy,this.deps.profiles);
            for(const id of [this.policy.defaultSource,...(compiled.fileRules??[]).map(r=>r.source)])if(id&&!this.connections.some(c=>c.id===id))throw Error(tr('Отсутствует подключение источника','Source connection is missing'));
            await this.deps.save(structuredClone(this.policy),structuredClone(this.connections));this.approved=true;this.close();
        }catch(e){new Notice(String(e));}finally{this.saving=false;}
    }
    close():void{
        if(this.approved||isForceClosingModals()||this.fingerprint()===this.initial){super.close();return;}
        const confirm=new Modal(this.app);confirm.contentEl.append(element('p',tr('Есть несохранённые изменения. Сохранить или отбросить?','There are unsaved changes. Save or discard?')));
        this.button(confirm.contentEl,tr('Сохранить','Save'),()=>{confirm.close();void this.save();});
        this.button(confirm.contentEl,tr('Отбросить','Discard'),()=>{confirm.close();this.approved=true;this.close();});
        this.button(confirm.contentEl,tr('Вернуться','Return'),()=>confirm.close());trackModal(confirm);confirm.open();
    }
    onClose():void{this.closed=true;this.inventories.dispose();this.deps.dispose();this.contentEl.replaceChildren();}
}
