// Run on the independent release authority's machine. The private key never enters the archive.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,createPrivateKey,sign} from 'node:crypto';
import {resolve} from 'node:path';
const [root,keyFile,out]=process.argv.slice(2);
if(!root||!keyFile||!out)throw Error('Usage: node sign-release.mjs plugin-directory private-ES256.jwk release.jws');
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
if(manifest.id!=='refsync')throw Error('Expected Sync Studio');
const files={};
for(const name of ['manifest.json','styles.css','main.js']){
    const bytes=await readFile(resolve(root,name));files[name]={size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const jwk=JSON.parse(await readFile(keyFile,'utf8'));
if(jwk.kty!=='EC'||jwk.crv!=='P-256'||!jwk.d)throw Error('Expected private P-256 signing key');
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const input=b64({alg:'ES256',typ:'vam+jws'})+'.'+b64({kind:'vam-release-1',component:'refsync',version:manifest.version,files});
const signature=sign('sha256',Buffer.from(input),{key:createPrivateKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');
await writeFile(out,input+'.'+signature+'\n',{flag:'wx'});
