import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../avisos.js',import.meta.url),'utf8');
async function client({permission='granted',supported=true,existing=false,active=false,failSubscribe=false}={}){
 const elements=new Map(['activar-sonido','activar-avisos','probar-avisos','desactivar-avisos','estado-avisos'].map(id=>[id,{disabled:false,textContent:''}]));
 const requests=[],events={};let sub=existing?makeSub():null,unsubscribed=0,arrivals=0,subscribes=0,tones=0;
 function makeSub(){return {endpoint:'https://fcm.googleapis.com/fcm/send/test-only',options:{},toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test-only',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}),unsubscribe:async()=>{unsubscribed++;sub=null;return true;}};}
 const registration={installing:null,waiting:null,pushManager:{getSubscription:async()=>sub,subscribe:async options=>{assert.equal(options.userVisibleOnly,true);subscribes++;if(failSubscribe)throw Error('Suscripción rechazada');sub=makeSub();return sub;}}};
 const navigator={serviceWorker:{register:async url=>{assert.equal(String(url),'https://example.test/ruta200/sw.js');return registration;},addEventListener:(n,fn)=>events[n]=fn}};
 const window=supported?{PushManager:function(){},Notification:{permission,requestPermission:async()=>permission}}:{};
 window.AudioContext=class {state='running';currentTime=0;destination={};async resume(){}async close(){}createOscillator(){return {frequency:{},connect(){},start(){tones++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
 const context=vm.createContext({Set,document:{hidden:false,getElementById:id=>elements.get(id)},navigator,window,URL,Uint8Array,atob,Error,AbortSignal,setTimeout,clearTimeout,fetch:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);assert.equal(options.headers.Authorization,'Bearer token-test-only');
  if(body.action==='config')return {ok:true,json:async()=>({publicKey:'A'.repeat(87),active})};
  return {ok:true,json:async()=>({ok:true})};
 }});
 const mod=new vm.SourceTextModule(source,{context,initializeImportMeta:m=>m.url='https://example.test/ruta200/avisos.js'});
 await mod.link(()=>new vm.SyntheticModule(['API','KEY'],function(){this.setExport('API','https://example.test');this.setExport('KEY','public-test-only');},{context}));await mod.evaluate();
 const controller=mod.namespace.setupDriverNotifications({getToken:async()=>'token-test-only',onReservation:()=>arrivals++});
 return {controller,get:id=>elements.get(id),requests,events,unsubscribed:()=>unsubscribed,arrivals:()=>arrivals,subscribes:()=>subscribes,tones:()=>tones};
}
let c=await client({supported:false});await c.controller.start();assert.match(c.get('estado-avisos').textContent,/no admite/);assert.equal(c.requests.length,0);
c=await client();await c.controller.start();assert.equal(c.get('probar-avisos').disabled,true);await c.get('activar-avisos').onclick();assert.equal(c.subscribes(),1);assert.equal(c.get('probar-avisos').disabled,false);assert.ok(c.requests.some(r=>r.action==='subscribe'));
await c.get('probar-avisos').onclick();assert.ok(c.requests.some(r=>r.action==='test'));assert.match(c.get('estado-avisos').textContent,/Prueba enviada/);
c.events.message({data:{type:'r200-nueva-reserva'}});assert.equal(c.arrivals(),1);
await c.controller.stop({unsubscribe:true});assert.equal(c.unsubscribed(),1);assert.ok(c.requests.some(r=>r.action==='unsubscribe'));c.events.message({data:{type:'r200-nueva-reserva'}});assert.equal(c.arrivals(),1);
c=await client({permission:'denied'});await c.controller.start();await c.get('activar-avisos').onclick();assert.equal(c.subscribes(),0);assert.match(c.get('estado-avisos').textContent,/Permiso no concedido/);
c=await client({existing:true,active:false});await c.controller.start();assert.equal(c.get('probar-avisos').disabled,true,'different-account subscription is not treated as active');
c=await client({existing:true,active:true});await c.controller.start();assert.equal(c.get('probar-avisos').disabled,false);
c=await client({failSubscribe:true});await c.controller.start();await c.get('activar-avisos').onclick();assert.match(c.get('estado-avisos').textContent,/rechazada/);assert.equal(c.get('activar-avisos').disabled,false);
const handlers={},shown=[],opened=[],posted=[];let focused=false,navigated='',closed=false;
const scope='https://example.test/ruta200/';
const sw=vm.createContext({URL,Response,fetch,self:{registration:{scope,showNotification:async(t,o)=>shown.push({t,o})},skipWaiting:async()=>{},addEventListener:(n,fn)=>handlers[n]=fn,clients:{claim:async()=>{},matchAll:async()=>[{url:scope+'admin.html',postMessage:d=>posted.push(d),focus:async()=>{focused=true;},navigate:async u=>navigated=u}],openWindow:async u=>opened.push(u)}}});
vm.runInContext(await fs.readFile(new URL('../sw.js',import.meta.url),'utf8'),sw);
let pending;handlers.push({data:{json:()=>({title:'Nueva reserva',body:'Abre tu panel',tag:'event-test-only',url:'https://evil.invalid'})},waitUntil:p=>pending=p});await pending;
assert.equal(shown.length,1);assert.equal(shown[0].o.data.url,scope+'admin.html#reservas-panel');assert.equal(posted[0].type,'r200-nueva-reserva');
handlers.notificationclick({notification:{close:()=>closed=true},waitUntil:p=>pending=p});await pending;assert.ok(closed&&focused);assert.equal(navigated,scope+'admin.html#reservas-panel');assert.equal(opened.length,0);
console.log('Avisos: permiso, suscripción, prueba, cuenta ajena, denegación, error, logout y actualización del panel verificados.');
console.log('Worker push: notificación visible, actualización del panel y apertura segura de la reserva verificados.');

c=await client();c.controller.updateReservations([{id:1,estado:'confirmada'}]);assert.equal(c.tones(),0);
await c.get('activar-sonido').onclick();assert.equal(c.tones(),2);
c.controller.updateReservations([{id:1,estado:'confirmada'},{id:2,estado:'confirmada'}]);assert.equal(c.tones(),4);
c.controller.updateReservations([{id:1,estado:'confirmada'},{id:2,estado:'confirmada'}]);assert.equal(c.tones(),4,'same reservation must not ring twice');
c.controller.updateReservations([{id:3,estado:'cancelada'}]);assert.equal(c.tones(),4);
await c.controller.stop();c.controller.updateReservations([{id:4,estado:'confirmada'}]);assert.equal(c.tones(),4,'no sound after logout or maintenance');
console.log('Sonido: activación por toque, nuevas reservas, sin repeticiones, cancelación y cierre verificados.');
