export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Modal {
  app: unknown; contentEl: HTMLElement; titleEl: HTMLElement;
  constructor(app: unknown) { this.app=app; this.contentEl=document.createElement('div'); this.titleEl=document.createElement('h2'); }
  onOpen(): unknown { return undefined; } onClose(): void {}
  open() { document.body.append(this.contentEl); return this.onOpen(); }
  close() { this.onClose(); this.contentEl.remove(); }
}
export class Menu {}
export class Notice { static messages:unknown[]=[]; constructor(...args: unknown[]) { Notice.messages.push(args[0]); } }
export class Setting {
  settingEl: HTMLElement;
  constructor(parent:HTMLElement) { this.settingEl=document.createElement('div'); parent.append(this.settingEl); }
  setName(text:string) { const el=document.createElement('label');el.textContent=text;this.settingEl.append(el);return this; }
  setDesc(text:string) { const el=document.createElement('p');el.textContent=text;this.settingEl.append(el);return this; }
  addButton(cb:(b:any)=>unknown) { const el=document.createElement('button');this.settingEl.append(el);const b={setButtonText:(v:string)=>{el.textContent=v;return b;},setCta:()=>b,onClick:(fn:()=>unknown)=>{el.addEventListener('click',fn);return b;}};cb(b);return this; }
  addDropdown(cb:(b:any)=>unknown) {const el=document.createElement('select');this.settingEl.append(el);const b={addOption:(v:string,t:string)=>{const o=document.createElement('option');o.value=v;o.textContent=t;el.append(o);return b;},setValue:(v:string)=>{for(const o of Array.from(el.options))o.selected=false;const chosen=Array.from(el.options).find(o=>o.value===v);if(chosen)chosen.selected=true;return b;},onChange:(fn:(v:string)=>unknown)=>{el.addEventListener('change',()=>fn(el.value));return b;}};cb(b);return this;}
  addText(cb:(b:any)=>unknown) {const el=document.createElement('input');this.settingEl.append(el);const b={inputEl:el,setValue:(v:string)=>{el.value=v;return b;},onChange:(fn:(v:string)=>unknown)=>{el.addEventListener('input',()=>fn(el.value));return b;}};cb(b);return this;}
  addToggle(cb:(b:any)=>unknown) {const el=document.createElement('input');el.type='checkbox';this.settingEl.append(el);const b={setValue:(v:boolean)=>{el.checked=v;return b;},onChange:(fn:(v:boolean)=>unknown)=>{el.addEventListener('change',()=>fn(el.checked));return b;}};cb(b);return this;}
}
export const Platform = { isMobileApp: false, isDesktopApp:true };
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '').trim();
export const requestUrl = async () => { throw new Error('No host requestUrl in unit tests'); };
