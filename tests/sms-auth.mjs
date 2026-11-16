import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const modules=new Map(),saved=new Map(),calls=[];let respond=()=>({ok:true,json:async()=>({})});
const context=vm.createContext({Date,Number,String,Error,JSON,AbortSignal,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body),headers:options.headers});return respond(url,options);}});
function load(name){if(modules.has(name))return modules.get(name);const m=new vm.SourceTextModule(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),{context});modules.set(name,m);return m;}
const entry=load('pasajero-auth.js');await entry.link(s=>load(s.replace('./','')));await entry.evaluate();const auth=entry.namespace;
assert.equal(auth.mexicanPhone('3111234567'),'+523111234567');
assert.throws(()=>auth.mexicanPhone('123'));
await auth.sendCode('3111234567');assert.equal(calls.at(-1).body.phone,'+523111234567');assert.equal(calls.at(-1).body.channel,'sms');assert.equal(calls.at(-1).headers.apikey.startsWith('sb_publishable_'),true);
await assert.rejects(auth.verifyCode('3111234567','12'));assert.equal(calls.length,1);
respond=()=>({ok:false,json:async()=>({msg:'Código inválido'})});await assert.rejects(auth.verifyCode('3111234567','123456'),/Código inválido/);assert.equal(saved.size,0);
const session={access_token:'access-only-test',refresh_token:'refresh-only-test',expires_in:3600,user:{phone:'523111234567',phone_confirmed_at:'2026-11-16T00:00:00Z'}};
respond=()=>({ok:true,json:async()=>session});const verified=await auth.verifyCode('3111234567','123456');assert.equal(auth.samePhone(verified,'3111234567'),true);assert.equal(auth.samePhone(verified,'3110000000'),false);
const key='r200-pasajero-sesion';saved.set(key,JSON.stringify({...verified,expires_at:0}));let release;respond=()=>new Promise(r=>release=r);const before=calls.length;const a=auth.passengerSession(),b=auth.passengerSession();assert.equal(calls.length,before+1);assert.match(calls.at(-1).url,/grant_type=refresh_token/);release({ok:true,json:async()=>session});await Promise.all([a,b]);
respond=()=>({ok:true,json:async()=>({})});await auth.logoutPassenger();assert.equal(JSON.parse(saved.get(key)),null);assert.equal(calls.at(-1).headers.Authorization,'Bearer access-only-test');
respond=()=>({ok:true,json:async()=>({...session,user:{phone:'523111234567'}})});await assert.rejects(auth.verifyCode('3111234567','123456'),/confirmado/);
console.log('Auth SMS: formato +52, OTP incorrecto, sesión confirmada, refresh concurrente único y cierre de sesión verificados con respuestas simuladas.');
