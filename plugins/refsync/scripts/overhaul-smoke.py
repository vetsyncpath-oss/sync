"""Exercise the packaged task editor and the resulting mirror in a disposable vault."""

def run(page):
    result = page.evaluate("""async () => {
      const rs = app.plugins.plugins.refsync, vault = app.vault;
      await rs.ready;
      const src = "Overhaul source", dst = "Overhaul target";
      for (const root of [src, dst]) {
        await vault.createFolder(root + "/Projects");
        await vault.createFolder(root + "/Archive");
      }
      await vault.create(src + "/Projects/from-source.md", "new");
      await vault.create(dst + "/Projects/removed.md", "old");
      await vault.create(dst + "/Archive/private.md", "private");
      await vault.create(src + "/root.md", "excluded");
      const p = {...rs.newProfile(), name:"Overhaul fixture", local:dst, reference:src,
        enabled:true, startup:false, intervalMinutes:0, onOnline:false, onFocus:false,
        fileEvents:false, inheritMode:false, mode:"silent", silentDeletionSafeguard:false};
      await rs.put(p,true);
      app.setting.open();app.setting.openTabById("refsync");
      const editor=app.setting.pluginTabs.find(tab=>tab.id==="refsync"), el=editor.containerEl,t=rs.t;
      const button=(area,k)=>[...area.querySelectorAll("button")].find(b=>b.textContent===t(k));
      const row=(area,name)=>[...area.querySelectorAll(".setting-item")].find(r=>r.querySelector(".setting-item-name")?.textContent===name);
      const select=(area,k,value)=>{const d=row(area,t(k)).querySelector("select");d.value=value;d.dispatchEvent(new Event("change"));};
      const enter=(field,v)=>{field.value=v;field.dispatchEvent(new Event("input"));};
      const delay=ms=>new Promise(r=>setTimeout(r,ms));
      async function until(fn){for(let i=0;i<200;i++){const value=await fn();if(value)return value;await delay(25);}throw Error("UI timeout: "+el.textContent.slice(0,180));}
      const modal=(k)=>until(()=>[...new Set([...el.ownerDocument.querySelectorAll(".modal"),...document.querySelectorAll(".modal")])].reverse().find(m=>button(m,k)));
      button(el,"places").click();button(el,"newPlace").click();
      const place=await modal("browse");
      enter(row(place,t("name")).querySelector("input"),"Shared source");
      button(place,"browse").click();
      let browser=await modal("useFolder");button(row(browser,src),"openFolder").click();
      browser=await modal("useFolder");button(browser,"useFolder").click();
      button(place,"save").click();await until(()=>rs.config.library.places.some(v=>v.name==="Shared source"));
      const location=rs.config.library.places.find(v=>v.name==="Shared source");
      if(location.endpoint.reference!==src)throw Error("wrong directory");
      button(el,"profiles").click();button(row(el,p.name),"edit").click();
      select(el,"remoteBookmark",location.id);
      button(el,"composition").click();select(el,"baseScope","selected");
      button(el,"foldersPicker").click();const picker=await modal("useSelection");
      const projects=row(picker,"Projects");if(!projects)throw Error("missing directory");
      projects.querySelector(".checkbox-container").click();button(picker,"useSelection").click();
      button(el,"taskRules").click();select(el,"mirrorMode","full");select(el,"mirrorMode","copyOnly");
      if(editor.draft.deletions)throw Error("sticky deletion flag");
      select(el,"mirrorMode","full");button(el,"diagnostics").click();
      const inspect=row(el,t("whyPath"));enter(inspect.querySelector("input"),"Archive/private.md");button(inspect,"checkPath").click();
      await until(()=>el.textContent.includes(t("folderRule")));
      const dry=row(el,t("draftPreview"));button(dry,"dry").click();
      const preview=await modal("export");
      if(!preview.textContent.includes("removed.md")||preview.textContent.includes("private.md"))throw Error("wrong preview");
      if(!(await vault.adapter.exists(dst+"/Projects/removed.md")) || rs.config.profiles.find(x=>x.id===p.id).mirror==="full")throw Error("preview mutated draft or vault");
      button(preview,"close").click();
      button(el,"composition").click();
      select(el,"fileType","customTypes");
      if(!row(el,t("include")).closest("details").open)throw Error("hidden custom pattern");
      button(el,"saveScopeTemplate").click();const input=await modal("save");enter(input.querySelector("input"),"Projects only");button(input,"save").click();
      await until(()=>rs.config.library.templates.some(v=>v.name==="Projects only"));
      select(el,"baseScope","all");
      select(el,"scopeTemplates",rs.config.library.templates.find(v=>v.name==="Projects only").id);
      if(editor.draft.content.base!=="selected")throw Error("scope template not applied");
      button(el,"save").click();await rs.saves;app.setting.close();
      await rs.execute(p.id,"run");const f=path=>vault.adapter.exists(dst+"/"+path);
      if(!await f("Projects/from-source.md")||await f("Projects/removed.md")||!await f("Archive/private.md")||await f("root.md"))throw Error("scoped mirror mismatch");
      app.setting.open();app.setting.openTabById("refsync");
      button(el,"templates").click();
      const tpl=row(el,"Projects only");button(tpl,"exportJson").click();const exporting=await modal("copyJson");
      const json=JSON.parse(exporting.querySelector("textarea").value);if(json.rules.local||json.rules.reference||json.rules.cloud)throw Error("non-portable template");
      button(exporting,"cancel").click();button(el,"importJson").click();
      let imp=await modal("save");json.name="Imported scope";enter(imp.querySelector("textarea"),JSON.stringify(json));button(imp,"save").click();
      await until(()=>row(el,"Imported scope"));button(row(el,"Imported scope"),"createTask").click();
      if(editor.draft.enabled||editor.draft.content.base!=="selected")throw Error("imported scope mismatch");
      button(el,"composition").click();select(el,"scope","settings");select(el,"scope","content");
      button(el,"schedule").click();if(!editor.draft.onFocus)row(el,t("onFocus")).querySelector(".checkbox-container").click();
      button(el,"composition").click();select(el,"scope","settings");
      if(editor.draft.onFocus||editor.draft.onOnline||editor.draft.fileEvents)throw Error("settings retained hidden triggers");
      button(el,"cancel").click();
      await vault.create(src+"/Projects/Name.md","remote case");
      await vault.create(dst+"/Projects/name.md","local case");
      button(el,"profiles").click();button(row(el,p.name),"edit").click();
      select(el,"role","publisher"); button(el,"diagnostics").click();
      const lookup=row(el,t("whyPath"));enter(lookup.querySelector("input"),"Projects/Name.md");button(lookup,"checkPath").click();
      await until(()=>el.textContent.includes(t("collision")));
      button(row(el,t("draftPreview")),"dry").click(); const check=await modal("export");
      if(!check.textContent.includes(dst+" → "+src)||!check.textContent.includes(t("deletionSide")+" · "+src))throw Error("publisher destination");
      button(check,"close").click();button(el,"cancel").click();app.setting.close();
      return "Editor: local folder browser, shared location, selected-only preview, policy changes, template, path diagnosis and silent mirror passed";
    }""")
    print(result)
