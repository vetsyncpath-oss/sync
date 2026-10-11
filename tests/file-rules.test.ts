import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, entry, ab, str, pathPolicy } from './helpers';
import { resolveFileRule, validateFileRules, type FileRule } from '../src/core/file-rules';
import { PolicyEditor } from '../src/ui/policy-editor';
import { PathPolicy } from '../src/core/path-policy';

const rule = (write: FileRule['write'], del: FileRule['delete'] = 'keep'): FileRule => ({scope:'vault',path:'',write,delete:del});
function set(f: ReturnType<typeof fixture>, rules: FileRule[]) { f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[],fileRules:rules}); }
test('inheritance: folder, nested folder, exact file; axes independent and order stable',()=>{
 const rules: FileRule[]=[rule('update'),{scope:'file',path:'notes/private/a.md',write:'remote'},
 {scope:'folder',path:'notes',write:'remote',delete:'tracked'}, {scope:'folder',path:'notes/private',write:'create'}];
 assert.equal(resolveFileRule('else.md',rules).write,'update');
 assert.equal(resolveFileRule('notes/a.md',rules).delete,'tracked');
 assert.equal(resolveFileRule('notes/private/b.md',rules).write,'create');
 assert.equal(resolveFileRule('notes/private/a.md',rules).write,'remote');
 assert.equal(resolveFileRule('notes-other/a.md',rules).delete,'keep');
});
test('name filters refine scope, case aliases remain protected; equal specificity last wins',()=>{
 const rules:FileRule[]=[rule('remote'),{scope:'vault',path:'',names:['data.json'],write:'preserve'},rule('update')];
 assert.equal(resolveFileRule('.obsidian/plugins/a/DATA.JSON',rules).write,'preserve');
 assert.equal(resolveFileRule('a.md',rules).write,'update');
 assert.equal(resolveFileRule('a.md',[rule('preserve','mirror')]).delete,'keep');
});
test('reject malformed rules instead of dropping protections',()=>{
 for(const rules of [null,{},[{}],[{scope:'file',path:'../a',write:'remote'}],[{scope:'folder',path:'x',write:'typo'}],
 [{scope:'vault',path:'',write:'preserve',names:['../data.json']}], [{scope:'file',path:'foo.',write:'remote'}]]) assert.throws(()=>validateFileRules(rules));
 validateFileRules(undefined);validateFileRules([]);
});
test('remote repairs local edit without remote change and does not delete local-only files',async()=>{
 const f=fixture([entry('a.md')]);f.own('a.md','REMOTE');f.files.set('a.md',ab('EDIT'));f.files.set('private.md',ab('PERSONAL'));
 set(f,[rule('remote')]);const result=await f.coordinator.sync();assert.equal(result?.outcome,'ok');
 assert.equal(str(f.files.get('a.md')!),'REMOTE');assert.equal(str(f.files.get('private.md')!),'PERSONAL');
 assert([...f.files].some(([p,b])=>p.includes('.conflict-')&&str(b)==='EDIT'));
});
test('create seeds once, preserves existing contents and survives force resync',async()=>{
 const f=fixture([entry('data.json')],'full');set(f,[rule('create')]);
 await f.coordinator.sync();assert.equal(str(f.files.get('data.json')!),'REMOTE');
 f.files.set('data.json',ab('PERSONAL'));await f.coordinator.forceResync();assert.equal(str(f.files.get('data.json')!),'PERSONAL');
});
test('preserve blocks downloads, force writes and mirror deletion',async()=>{
 const f=fixture([entry('data.json')],'full');f.own('data.json','PERSONAL');f.own('deleted.json','PERSONAL');
 set(f,[rule('preserve','mirror')]);await f.coordinator.sync();await f.coordinator.forceResync();
 assert.equal(str(f.files.get('data.json')!),'PERSONAL');assert.equal(str(f.files.get('deleted.json')!),'PERSONAL');
});
test('update accepts unedited old version but skips edited and unowned existing contents',async()=>{
 const f=fixture([entry('clean.md'),entry('edited.md'),entry('unknown.md')],'full');
 f.own('clean.md','OLD');f.own('edited.md','OLD');f.files.set('edited.md',ab('EDIT'));f.files.set('unknown.md',ab('PERSONAL'));
 set(f,[rule('update')]);await f.coordinator.sync();
 assert.equal(str(f.files.get('clean.md')!),'REMOTE');assert.equal(str(f.files.get('edited.md')!),'EDIT');assert.equal(str(f.files.get('unknown.md')!),'PERSONAL');
});
test('tracked deletes owned orphans while preserving never-synced files under fetch',async()=>{
 const f=fixture([]);f.own('old.md','OLD');f.files.set('private.md',ab('PERSONAL'));set(f,[rule('create','tracked')]);
 await f.coordinator.sync();assert(!f.files.has('old.md'));assert(f.files.has('private.md'));
});
test('file mirror rule scans under fetch; protected siblings survive',async()=>{
 const f=fixture([]);f.files.set('delete.md',ab('OLD'));f.files.set('private.md',ab('PERSONAL'));
 set(f,[{scope:'file',path:'delete.md',delete:'mirror'}]);await f.coordinator.sync();assert(!f.files.has('delete.md'));assert(f.files.has('private.md'));
});
test('folder mirror and nested preservation retain containing directory and data',async()=>{
 const f=fixture([]);f.dirs.add('plugins');f.files.set('plugins/main.js',ab('OLD'));f.files.set('plugins/data.json',ab('PERSONAL'));
 f.deps.policy=new PathPolicy({syncMode:'full-vault',allowedFolders:'',ignoredFolders:'',allowPlugins:true,allowSnippets:false,protectedPaths:[]});
 // Non-script files also verify the generic folder behaviour.
 f.files.set('plugins/old.json',ab('OLD'));
 set(f,[{scope:'folder',path:'plugins',delete:'mirror'},{scope:'folder',path:'plugins',names:['data.json'],write:'preserve'}]);
 await f.coordinator.sync();assert(!f.files.has('plugins/old.json'));assert(f.files.has('plugins/data.json'));assert(f.dirs.has('plugins'));
});
test('new rules do not bypass exclusions or script permissions',async()=>{
 const f=fixture([entry('.obsidian/plugins/a/main.js'),entry('data.json')]);f.files.set('data.json',ab('PERSONAL'));
 f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[],fileRules:[rule('remote','mirror')],fileExclusions:[{pattern:'data.json'}]});
 await f.coordinator.sync();assert(!f.files.has('.obsidian/plugins/a/main.js'));assert.equal(str(f.files.get('data.json')!),'PERSONAL');
});
test('background mirror stays deferred, nonimmutable inventory stays blocked',async()=>{
 for(const unsafe of [false,true]){
 const f=fixture([]);f.own('old.md');set(f,[rule('remote','mirror')]);if(unsafe) f.deps.source = {...f.source, deletionSafety:'untrusted' as any};
 const result=await f.coordinator.sync({trigger:unsafe?'manual':'auto'});assert(f.files.has('old.md'));
 assert((unsafe?result?.blockedDeletions:result?.deferredDeletions)!>0);
 }
});
test('invalid saved rule aborts before source fetch or mutation',async()=>{
 const f=fixture([entry('a.md')]);let fetched=false;f.source.getManifest=async()=>{fetched=true;return [entry('a.md')];};
 set(f,[{scope:'vault',path:'',write:'invalid'} as any]);const result=await f.coordinator.sync();
 assert.equal(result?.outcome,'error');assert.equal(fetched,false);assert.equal(f.operations.length,0);
});
test('tree editor preserves rules and exclusions across preset edits and returns independent copies',()=>{
 const rules=[rule('create')];const exclusions=[{pattern:'data.json',scope:'.obsidian/plugins'}];
 const e=new PolicyEditor({localFiles:[],localFolders:[],remote:[],cache:new Map(),pluginDir:'.obsidian/plugins/sync',policy:{version:1,mirror:false,folders:[],fileRules:rules,fileExclusions:exclusions}});
 e.setPreset('obsidian','.obsidian/plugins/sync');assert.deepEqual(e.getPolicy().fileRules,rules);assert.deepEqual(e.getPolicy().fileExclusions,exclusions);
 e.getPolicy().fileRules![0].write='remote';assert.equal(e.getPolicy().fileRules![0].write,'create');
});
test('absent rules retain legacy fetch local edits',async()=>{
 const f=fixture([entry('a.md')]);f.own('a.md','REMOTE');f.files.set('a.md',ab('EDIT'));f.conflict.setStrategy('remote-wins');
 await f.coordinator.sync();assert.equal(str(f.files.get('a.md')!),'EDIT');
});

test('case/Unicode-equivalent exact rules do not lose protection',()=>{
 assert.equal(resolveFileRule('NOTES/Cafe\u0301.md',[{scope:'file',path:'notes/Café.md',write:'preserve'}]).write,'preserve');
});
test('create-only detects a file created between preview and execution',async()=>{
 const f=fixture([entry('data.json')]);set(f,[rule('create')]);
 f.source.fetch=async()=>{f.files.set('data.json',ab('JUST CREATED'));return ab('REMOTE');};
 await f.coordinator.sync();assert.equal(str(f.files.get('data.json')!),'JUST CREATED');assert(!f.cache.get('data.json'));
});
test('legacy mirror off and folder excludes remain stronger than new deletion rules',async()=>{
 const f=fixture([]);f.dirs.add('notes');f.files.set('notes/local.md',ab('PERSONAL'));
 f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[],mirrorFolders:{notes:{state:'off'}},fileRules:[rule('remote','mirror')]});
 await f.coordinator.sync();assert(f.files.has('notes/local.md'));
});
test('explicit file override changes one setting without affecting siblings',async()=>{
 const a='.obsidian/plugins/a/data.json',b='.obsidian/plugins/b/data.json';const f=fixture([entry(a),entry(b)]);
 f.files.set(a,ab('A'));f.files.set(b,ab('B'));
 set(f,[{scope:'folder',path:'.obsidian/plugins',names:['data.json'],write:'preserve'}, {scope:'file',path:a,write:'remote'}]);
 await f.coordinator.sync();assert.equal(str(f.files.get(a)!),'REMOTE');assert.equal(str(f.files.get(b)!),'B');
});
test('rules apply to mapped destination; preserved target is not replaced by a rename',async()=>{
 const f=fixture([entry('source.md')]);f.own('source.md','OLD');f.files.set('dest.md',ab('PERSONAL'));
 f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[{path:'source.md',include:'include',target:{kind:'move',localPath:'dest.md'}}],fileRules:[{scope:'file',path:'dest.md',write:'preserve'}]});
 await f.coordinator.sync();assert.equal(str(f.files.get('dest.md')!),'PERSONAL');assert.equal(str(f.files.get('source.md')!),'OLD');
});
test('changing a rule after preview cancels the accepted operation',async()=>{
 const f=fixture([entry('a.md')]);f.files.set('a.md',ab('PERSONAL'));set(f,[rule('remote')]);let revision=1;
 f.deps.options.configurationRevision=()=>revision;
 f.ui.confirmSync=async()=>{revision++;set(f,[rule('preserve')]);return true;};
 const result=await f.coordinator.sync();assert.equal(result?.outcome,'cancelled');assert.equal(str(f.files.get('a.md')!),'PERSONAL');
});
test('tree statuses reflect custom write and deletion policies',()=>{
 const e=new PolicyEditor({localFiles:['data.json','extra.md'],localFolders:[],remote:[entry('data.json')],cache:new Map(),pluginDir:'.obsidian/plugins/sync',
 policy:{version:1,mirror:false,folders:[],fileRules:[rule('remote','mirror'),{scope:'file',path:'data.json',write:'preserve'}]}});
 assert.deepEqual(e.remoteStatusOf('data.json'),{kind:'rule',write:'preserve'});
 assert.deepEqual(e.localStatusOf('extra.md'),{kind:'local-only',mirrorLevel:'full'});
});
