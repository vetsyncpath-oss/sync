window.module = { exports: {} };
class TFolder { constructor(path) { this.path = path; } }
class TFile { constructor(path, data) { this.path = path; this.bytes = data; } }
const map = new Map();
const listeners = new Map();
const app = { workspace: { onLayoutReady(cb) { cb(); } } };
function setfile(p, data) {
  let par = "";
  for (const item of p.split("/").slice(0,-1)) {
    par = par ? par + "/" + item : item;
    if (!map.has(par)) map.set(par,new TFolder(par));
  }
  if (map.has(p)) map.get(p).bytes = data.buffer;
  else map.set(p, new TFile(p,data.buffer));
}
const vault = {
  adapter: { exists: async p => map.has(p) },
  trash: async (file, system) => { if(system) throw Error("wrong trash"); map.delete(file.path); },
  on: (event, cb) => listeners.set(event, cb),
  configDir: ".obsidian",
  getAbstractFileByPath: p => map.get(p),
  getAllLoadedFiles: () => [...map.values()],
  readBinary: async f => f.bytes,
  createFolder: async p => map.set(p, new TFolder(p)),
  createBinary: async (p, b) => { if (map.has(p)) throw Error("exists"); map.set(p,new TFile(p,b)); },
  modifyBinary: async (f, b) => { f.bytes = b; },
  process: async (f, cb) => { f.bytes = new TextEncoder().encode(cb(new TextDecoder().decode(f.bytes))).buffer; }
};
window.require = () => ({
  Plugin: class { async loadData() { return window.initialData; } registerEvent() {} registerDomEvent(el, type, cb) { el.addEventListener(type, cb); } async saveData(s) { this.disk = JSON.parse(JSON.stringify(s)); } addSettingTab(){} addCommand(){} addRibbonIcon(){} },
  PluginSettingTab: class {}, Modal: class { open(){} }, Notice: class {}, TFile, TFolder,
  async requestUrl(args) {
    const r = await fetch(new URL(args.url).pathname,{method:args.method,headers:args.headers,body:args.body});
    const body = await r.arrayBuffer();
    return {status:r.status,headers:Object.fromEntries(r.headers),arrayBuffer:body,get text(){ return new TextDecoder().decode(body); }};
  }
});
