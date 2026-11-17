import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(await read('manifest.webmanifest'));
const base=new URL('https://example.test/ruta200/');
assert.equal(new URL(manifest.start_url,base).pathname,'/ruta200/');
assert.equal(new URL(manifest.scope,base).pathname,'/ruta200/');
assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons){
 const b=await fs.readFile(new URL('../'+icon.src,import.meta.url));
 const [w,h]=icon.sizes.split('x').map(Number);
 assert.equal(b.readUInt32BE(16),w);assert.equal(b.readUInt32BE(20),h);
}
for(const file of ['index.html','admin.html','acceso.html','reservar.html','boleto.html']){
 const html=await read(file);assert.ok(html.includes('rel="manifest"'));assert.ok(html.includes('src="pwa.js?'));
}
const script=await read('pwa.js');
async function ui({standalone=false,online=true,registrationFails=false,boxPresent=true}={}){
 const handlers={},buttonHandlers={};const button={textContent:'Cómo instalar RUTA 200',disabled:false,addEventListener:(n,fn)=>buttonHandlers[n]=fn};
 const help={open:false},status={textContent:''},box={hidden:false,querySelector:s=>s==='details'?help:s==='[data-install-button]'?button:status};
 let banner,registration;
 const win={matchMedia:()=>({matches:standalone,addEventListener(){}}),addEventListener:(n,fn)=>handlers[n]=fn,isSecureContext:true};
 const navigator={onLine:online,serviceWorker:{register:async(url,options)=>{registration={url:String(url),options};if(registrationFails)throw Error('blocked');}}};
 const doc={querySelector:()=>boxPresent?box:null,createElement:()=>({}),body:{prepend:e=>banner=e}};
 const context=vm.createContext({window:win,navigator,document:doc,URL});
 const mod=new vm.SourceTextModule(script,{context,initializeImportMeta:meta=>meta.url='https://example.test/ruta200/pwa.js'});
 await mod.link(()=>{});await mod.evaluate();
 return {handlers,buttonHandlers,box,button,help,status,banner,navigator,registration:()=>registration};
}
let u=await ui();assert.equal(u.box.hidden,false);await u.buttonHandlers.click();assert.equal(u.help.open,true);assert.match(u.status.textContent,/Chrome o Safari/);
let prevented=false,prompted=0;
u.handlers.beforeinstallprompt({preventDefault(){prevented=true;},prompt:async()=>prompted++,userChoice:Promise.resolve({outcome:'accepted'})});
assert.ok(prevented);await u.buttonHandlers.click();assert.equal(prompted,1);assert.equal(u.button.disabled,false);assert.match(u.status.textContent,/solicitada/);
await u.buttonHandlers.click();assert.equal(prompted,1,'install event must only be used once');u.handlers.appinstalled();assert.equal(u.box.hidden,true);
u=await ui({standalone:true});assert.equal(u.box.hidden,true);
u=await ui({online:false});assert.equal(u.banner.hidden,false);u.navigator.onLine=true;u.handlers.online();assert.equal(u.banner.hidden,true);
await u.handlers.load();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(u.registration().url,'https://example.test/ruta200/sw.js');assert.equal(u.registration().options.scope,'./');
u=await ui({registrationFails:true});await u.handlers.load();await new Promise(resolve=>setTimeout(resolve,0));assert.match(u.status.textContent,/no pudo prepararse/);
u=await ui();u.handlers.beforeinstallprompt({preventDefault(){},prompt:async()=>{throw Error('not allowed');}});await u.buttonHandlers.click();assert.equal(u.button.disabled,false);assert.equal(u.help.open,true);
u=await ui({boxPresent:false});u.handlers.beforeinstallprompt({preventDefault(){throw Error('must preserve native prompt without UI');}});
const swHandlers={};let requests=[],fail=false,claimed=false;
const ctx=vm.createContext({URL,Response,self:{registration:{scope:String(base)},clients:{claim:async()=>{claimed=true;}},addEventListener:(n,fn)=>swHandlers[n]=fn},fetch:async r=>{requests.push(r);if(fail)throw Error('offline');return new Response('fresh from server');}});
vm.runInContext(await read('sw.js'),ctx);
let activation;swHandlers.activate({waitUntil:p=>activation=p});await activation;assert.equal(claimed,true);
function request(url,mode='navigate',method='GET'){let result;swHandlers.fetch({request:{url,mode,method},respondWith:p=>result=p});return result;}
assert.equal(request('https://api.example.test/auth/v1/token','cors','POST'),undefined);
assert.equal(request('https://example.test/ruta200/admin.js','cors'),undefined);
assert.equal(request('https://example.test/another-site/'),undefined);
let response=await request(String(new URL('reservar.html',base)));assert.equal(await response.text(),'fresh from server');
fail=true;response=await request(String(new URL('boleto.html?clave=PRIVATE_TEST_SECRET',base)));
assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');const offline=await response.text();assert.match(offline,/no confirma ninguna reservación/);assert.ok(!offline.includes('PRIVATE_TEST_SECRET'));
console.log('PWA verificada: iconos, alcance /ruta200/, manifest, instalación aceptada/cancelable, ayuda manual, modo instalado, conectividad y registro fallido.');
console.log('Service worker: navegación por red, API/POST/otros sitios intactos y respuesta sin conexión sin datos privados.');
