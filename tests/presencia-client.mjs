import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../presencia-api.js',import.meta.url),'utf8');
let session={access_token:'test-jwt-not-real'},calls=[],reply={ok:true,json:async()=>({verified:false})};
const context=vm.createContext({Date,Error,JSON,Number,AbortSignal,fetch:async(url,options)=>{calls.push({url,...options});return typeof reply==='function'?reply(url,options):reply;}});
const entry=new vm.SourceTextModule(source,{context});
await entry.link(name=>new vm.SyntheticModule(name.includes('r200.js')?['API','KEY']:['passengerSession'],function(){
 if(name.includes('r200.js')){this.setExport('API','https://test.supabase.co');this.setExport('KEY','public-test');}
 else this.setExport('passengerSession',async()=>session);
},{context}));
await entry.evaluate();const api=entry.namespace;
session=null;await assert.rejects(api.presenceRequest({action:'start'}),/Confirma tu teléfono/);assert.equal(calls.length,0);
session={access_token:'test-jwt-not-real'};
await api.presenceRequest({action:'status'});assert.equal(calls[0].headers.authorization,'Bearer test-jwt-not-real');assert.equal(calls[0].headers.apikey,'public-test');
reply={ok:false,json:async()=>({error:'Límite de intentos'})};await assert.rejects(api.presenceRequest({action:'start'}),/Límite de intentos/);
reply={ok:true,json:async()=>({verified:'true'})};await assert.rejects(api.presenceRequest({action:'result'}),/Respuesta no válida/);
reply=()=>{throw Error('network')};await assert.rejects(api.presenceRequest({action:'start'}),/Revisa tu conexión/);
let count=0;reply=(_url,options)=>{
 count++;assert.ok(!options.headers.authorization,'Cognito no recibe JWT de Supabase');
 const target=options.headers['x-amz-target'];
 return {ok:true,json:async()=>target.endsWith('.GetId')?{IdentityId:'us-east-1:test'}:{Credentials:{AccessKeyId:'temporary-test',SecretKey:'only-test',SessionToken:'only-test',Expiration:Date.now()/1000+3600}}};
};
const credentials=await api.guestCredentials();assert.equal(count,2);assert.equal(credentials.accessKeyId,'temporary-test');assert.ok(credentials.expiration instanceof Date);
reply={ok:true,json:async()=>({IdentityId:'test',Credentials:{Expiration:0}})};await assert.rejects(api.guestCredentials(),/temporal/);

const uiSource=await readFile(new URL('../presencia.js',import.meta.url),'utf8');
async function ui(initialVerified=false){
 const elements=new Map(),stored=new Map(),requests=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',checked:false,textContent:'',style:{},setAttribute(){},removeAttribute(){}});return elements.get(id);};
 let result={verified:false,status:'iniciado'},mount,stopped=0,cameraRemoved=0,resolveStart;
 const sandbox=vm.createContext({console,Date,JSON,Number,Boolean,Error,String,Promise,setTimeout:()=>1,clearTimeout(){},crypto:{randomUUID:()=> 'test-id'},document:{getElementById:el},sessionStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},window:{addEventListener(){}},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}}});
 const vendor=new vm.SyntheticModule(['mountDetector'],function(){this.setExport('mountDetector',(_el,options)=>{mount=options;return ()=>cameraRemoved++;});},{context:sandbox});await vendor.link(()=>{});await vendor.evaluate();
 const mod=new vm.SourceTextModule(uiSource,{context:sandbox,importModuleDynamically:()=>vendor});
 await mod.link(name=>{
  const exports=name.includes('pasajero-auth')?{passengerSession:async()=>({phone:'520000000071'}),sendCode:async()=>{},verifyCode:async()=>({phone:'520000000071'}),logoutPassenger:async()=>{}}:name.includes('captcha')?{createCaptcha:()=>({ready:Promise.resolve(),token:async()=>'captcha',reset:async()=>{}})}:{CONSENT:'r200-presencia-v1',guestCredentials:async()=>({}),presenceRequest:async body=>{
   requests.push(body);
   if(body.action==='status')return {verified:initialVerified};
   if(body.action==='result')return result;
   if(body.action==='start')return new Promise(resolve=>{resolveStart=resolve;});
  }};
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context:sandbox});
 });await mod.evaluate();
 return {el,requests,stored,get mount(){return mount;},get stopped(){return stopped;},get removed(){return cameraRemoved;},result:value=>{result=value;},startResult:value=>resolveStart(value)};
}
const ready=await ui(true);assert.equal(ready.el('listo-panel').hidden,false);assert.equal(ready.requests.length,1);
const screen=await ui();assert.equal(screen.el('listo-panel').hidden,true);
await screen.el('iniciar').onclick();assert.equal(screen.requests.length,1,'Sin consentimiento no hay inicio');
screen.el('consentimiento').checked=true;
const starting=screen.el('iniciar').onclick();await new Promise(resolve=>setImmediate(resolve));
const double=screen.el('iniciar').onclick();await double;assert.equal(screen.requests.filter(x=>x.action==='start').length,1,'Doble toque consume un solo inicio');
screen.startResult({verified:false,attemptId:'attempt-test',sessionId:'session-test',expiresAt:new Date(Date.now()+180000).toISOString()});await starting;
assert.equal(screen.stopped,1,'Permiso de cámara se libera antes del detector');assert.equal(screen.el('camara-panel').hidden,false);
await screen.mount.onAnalysisComplete();assert.equal(screen.el('listo-panel').hidden,true,'Completar cámara no aprueba por sí solo');assert.equal(screen.el('iniciar').disabled,true,'No reutilizar sesión consumida');
screen.result({verified:true,status:'aprobado'});await screen.el('consultar').onclick();assert.equal(screen.el('listo-panel').hidden,false);assert.equal(screen.stored.size,0);assert.ok(screen.removed>0);
const failedScreen=await ui();failedScreen.el('consentimiento').checked=true;
const failingStart=failedScreen.el('iniciar').onclick();await new Promise(resolve=>setImmediate(resolve));failedScreen.startResult({verified:false,attemptId:'test',sessionId:'test',expiresAt:new Date(Date.now()+180000).toISOString()});await failingStart;
failedScreen.result({verified:false,status:'rechazado',reason:'confianza_insuficiente',feedback:['LOW_VIDEO_QUALITY_DETECTED','unknown']});await failedScreen.mount.onAnalysisComplete();
assert.match(failedScreen.el('estado').textContent,/calidad de video insuficiente/);assert.ok(!failedScreen.el('estado').textContent.includes('unknown'));assert.equal(failedScreen.el('listo-panel').hidden,true);
console.log('Presencia cliente: sesión, errores, credenciales temporales, consentimiento, doble toque, liberación de cámara y aprobación exclusiva del servidor: OK');
