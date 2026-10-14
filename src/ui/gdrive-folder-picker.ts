import { App, Modal } from 'obsidian';
import { GoogleDriveClient, DRIVE_FOLDER, type DriveFile } from '../sources/gdrive-client';
import { button, element, textInput, tr } from './dom';
import { trackModal } from './modal-registry';
import type { GoogleSignInEvent } from '../auth/google-auth';

export interface GoogleConnectionActions {
    signIn(values: Record<string,unknown>, signal: AbortSignal,observe?:(event:GoogleSignInEvent)=>void): Promise<Record<string,unknown>>;
    pickFolder(values: Record<string,unknown>, signal: AbortSignal): Promise<DriveFile | undefined>;
    discardSecret?(ref: string): void;
    releaseDraft?(): void;
    accounts?(): { name: string; values: Record<string,unknown> }[];
}
export function pickGoogleFolder(app: App, client: GoogleDriveClient, signal: AbortSignal): Promise<DriveFile | undefined> {
    return new Promise(resolve => { const modal = new GoogleFolderPicker(app,client,signal,resolve); trackModal(modal); modal.open(); });
}
class GoogleFolderPicker extends Modal {
    private controller = new AbortController();
    private current?: DriveFile;
    private history: string[] = [];
    private names=new Map<string,string>();
    private generation = 0;
    private resolved = false;
    private readonly abort = () => this.close();
    constructor(app: App, private client: GoogleDriveClient, private signal: AbortSignal,
        private complete: (folder?: DriveFile)=>void) { super(app); }
    onOpen(): void { this.signal.addEventListener('abort',this.abort,{once:true}); if(this.signal.aborted)this.close();else void this.load('root'); }
    onClose(): void {
        this.generation++;this.controller.abort();this.signal.removeEventListener('abort',this.abort);
        if(!this.resolved){this.resolved=true;this.complete();}
    }
    private async load(id: string,history:readonly string[]=this.history): Promise<void> {
        this.controller.abort();this.controller=new AbortController();
        const signal=this.controller.signal,generation=++this.generation,box=this.contentEl;box.replaceChildren();box.append(element('p',tr('Загрузка папок…','Loading folders…')));
        button(box,tr('Отмена','Cancel'),()=>this.close());
        try {
            const folder=await this.client.inspect(id,signal);
            if(folder.mimeType!==DRIVE_FOLDER||folder.trashed)throw Error(tr('Выберите доступную папку','Select an accessible folder'));
            const children=await this.client.listChildren(folder.id,signal,folder.driveId);
            if(generation!==this.generation||signal.aborted)return;
            this.current=folder;this.history=[...history];this.names.set(folder.id,folder.name);box.replaceChildren();box.append(element('h3',tr('Папка Google Drive','Google Drive folder')),element('p',folder.name));
            const breadcrumbs=element('nav');breadcrumbs.setAttribute('aria-label',tr('Путь папки','Folder breadcrumb'));
            this.history.forEach((ancestor,index)=>button(breadcrumbs,this.names.get(ancestor)??ancestor,()=>void this.load(ancestor,this.history.slice(0,index))));box.append(breadcrumbs);
            if(this.history.length)button(box,tr('Назад','Back'),()=>void this.load(this.history[this.history.length-1],this.history.slice(0,-1)));
            const folders=children.filter(f=>f.mimeType===DRIVE_FOLDER).sort((a,b)=>a.name.localeCompare(b.name));
            const counts=new Map<string,number>();for(const child of folders)counts.set(child.name,(counts.get(child.name)??0)+1);
            for(const child of folders)button(box,child.name+(counts.get(child.name)!>1?' · ID '+child.id:''),()=>void this.load(child.id,[...this.history,folder.id]));
            if(!children.some(f=>f.mimeType===DRIVE_FOLDER))box.append(element('p',tr('Вложенных папок нет','No subfolders')));
            this.linkControl(box);
            button(box,tr('Выбрать эту папку','Select this folder'),()=>{
                if(!this.current)return;this.resolved=true;this.complete(this.current);this.close();
            },'mod-cta');button(box,tr('Отмена','Cancel'),()=>this.close());
        } catch(error) {if(generation!==this.generation||signal.aborted)return;
            box.replaceChildren();box.append(element('p',String(error),'sync-workspace-error'));this.linkControl(box);
            button(box,tr('Повторить','Retry'),()=>void this.load(id,history));
            if(this.current)button(box,tr('Вернуться к текущей папке','Return to current folder'),()=>void this.load(this.current!.id,this.history));
            button(box,tr('Вернуться в Мой диск','Return to My Drive'),()=>void this.load('root',[]));button(box,tr('Отмена','Cancel'),()=>this.close());}
    }
    private linkControl(box: HTMLElement): void {
        let value='';const input=textInput('',v=>value=v);input.placeholder=tr('Ссылка или ID папки','Folder URL or ID');box.append(input);
        button(box,tr('Открыть папку по ссылке','Open folder by link'),()=>{
            let id=value.trim();
            if(id.startsWith('https://')){try{const url=new URL(id);id=url.hostname==='drive.google.com'?(url.pathname.match(/\/folders\/([\w-]+)/)?.[1]??''):'';}catch{id='';}}
            if(!/^[\w-]+$/.test(id)){box.append(element('p',tr('Неверная ссылка или ID','Invalid folder URL or ID')));return;}
            void this.load(id,this.current?[...this.history,this.current.id]:[]);
        });
    }
}
