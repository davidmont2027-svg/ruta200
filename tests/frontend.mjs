import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url);
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.hidden=false;this.disabled=false;this._value='';this.textContent='';const s=new Set();this.classList={add:v=>s.add(v),remove:v=>s.delete(v),contains:v=>s.has(v)};}
 set value(v){this._value=String(v);}get value(){return this._value;}get options(){return this.children;}
 append(...es){this.children.push(...es);for(const e of es)e.parent=this;if(this.tagName==='select'&&!this._value)this._value=this.children[0]?.value||'';}replaceChildren(...es){this.children=[];this.append(...es);this._value=es[0]?.value||'';}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);}
 querySelectorAll(selector){const tags=selector.split(',');return this.children.flatMap(e=>[...(tags.includes(e.tagName)?[e]:[]),...e.querySelectorAll(selector)]);}
 setCustomValidity(s){this.validityMessage=s;}reportValidity(){return !this.validityMessage;}
}
async function app(file,html,respond,{hash='',sessionData=null,passengerData={access_token:'passenger-test',refresh_token:'refresh-test',phone:'523111234567',expires_at:Date.now()+3600000},captchaToken='captcha-test-only',presenceData={verified:true}}={}){
 const elements=new Map();const source=fs.readFileSync(new URL(html,root),'utf8');
 for(const m of source.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const el=new Element(m[0].match(/^<(\w+)/)[1]);el.hidden=/\bhidden\b/.test(m[0]);elements.set(m[1],el);}
 const dynamic=[];const get=id=>{const found=elements.get(id)||dynamic.find(e=>e.id===id);if(!found)throw Error('ID ausente: '+id);return found;};
 const local=new Map();if(passengerData)local.set('r200-pasajero-sesion',JSON.stringify(passengerData));const session=new Map(),calls=[],opened=[];const storage=s=>({getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,v),removeItem:k=>s.delete(k)});
 const location={href:'https://example.test/ruta200/'+html,hash,replace(path){this.href=new URL(path,this.href).href;}};if(sessionData)session.set('r200-operador',JSON.stringify(sessionData));
 const intervals=[];const context=vm.createContext({Intl,Date,URL,Uint8Array,crypto:webcrypto,AbortSignal,JSON,Number,String,Array,Map,Math,Error,document:{hidden:false,getElementById:get,createElement:tag=>{const e=new Element(tag);dynamic.push(e);return e;},querySelectorAll:()=>[]},location,localStorage:storage(local),sessionStorage:storage(session),setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},confirm:()=>true,prompt:()=>null,window:{scrollTo(){},open:(...args)=>opened.push(args)},fetch:async(url,opts)=>{const name=url.split('/').pop(),body=JSON.parse(opts.body||'{}');calls.push({name,body,headers:opts.headers});if(name==='ruta200-liveness')return {ok:true,json:async()=>presenceData};return respond(name,body,opts);}});
 const modules=new Map();async function load(name){if(modules.has(name))return modules.get(name);if(name==='sms-ui-test-entry.js'){const mod=new vm.SourceTextModule("import {setupSms} from './sms-ui.js';setupSms()();",{context});modules.set(name,mod);return mod;}if(name==='captcha.js'){const mod=new vm.SyntheticModule(['createCaptcha'],function(){this.setExport('createCaptcha',()=>({ready:Promise.resolve(),token:async()=>{if(!captchaToken)throw Error('Completa seguridad');return captchaToken;},reset:async()=>{}}));},{context});modules.set(name,mod);return mod;}const mod=new vm.SourceTextModule(fs.readFileSync(new URL(name,root),'utf8'),{context,identifier:name});modules.set(name,mod);return mod;}
 const entry=await load(file);await entry.link(s=>load(s.replace('./','').split('?')[0]));await entry.evaluate();await flush();return {get,calls,local,location,context,opened,intervals};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const ok=data=>({ok:true,json:async()=>data});
const ticket={vehiculo_id:1,conductor:'Blanca',folio:'00000000-0000-4000-8000-000000000001',estado:'confirmada',pasajero:'<img src=x onerror=alert(1)>',telefono:'3111234567',asientos:3,total:750,origen:'Tepic',destino:'Mezcales',fecha:'2030-11-20',hora:'08:00',salida:'2030-11-20T15:00:00Z',cancelable_hasta:'2030-11-20T14:30:00Z',vehiculo:'Chevrolet Aveo 2026 Azul'};
const trips=[{id:101,hora:'08:00',disponibles:2},{id:102,hora:'08:00',disponibles:4}];
let app1=await app('reservar.js','reservar.html',()=>ok([]));app1.get('ruta').value='ida';app1.get('asientos').value='1';await app1.get('actualizar').onclick();await flush();assert.equal(app1.get('continuar').disabled,true);assert.match(app1.get('estado-reserva').textContent,/No hay salidas/);
let resolveBooking;const app2=await app('reservar.js','reservar.html',(name)=>name==='r200_horarios'?ok(trips):new Promise(resolve=>resolveBooking=resolve));app2.get('ruta').value='ida';app2.get('asientos').value='3';app2.get('actualizar').onclick();await flush();assert.equal(app2.get('salida').options.length,1);assert.equal(app2.get('continuar').disabled,false);
app2.get('nombre').value='David';app2.get('telefono').value='123';await app2.get('continuar').onclick();assert.equal(app2.calls.filter(x=>x.name==='r200_reservar').length,0);
app2.get('telefono').value='3111234567';const booking=app2.get('continuar').onclick();await app2.get('continuar').onclick();await flush();assert.equal(app2.calls.filter(x=>x.name==='r200_reservar').length,1);assert.equal(app2.calls.at(-1).body.p_horario,102);assert.match(app2.calls.at(-1).body.p_clave,/^[a-f0-9]{64}$/);assert.equal(app2.get('telefono').disabled,true);resolveBooking(ok(ticket));await booking;assert.match(app2.location.href,/boleto\.html#[a-f0-9]{64}$/);assert.equal(app2.location.href.includes('3111234567'),false);
let attempts=0;const app3=await app('reservar.js','reservar.html',name=>{if(name==='r200_horarios')return ok(trips);if(++attempts===1)throw Error('Respuesta perdida');return ok(ticket);});app3.get('ruta').value='ida';app3.get('asientos').value='1';app3.get('actualizar').onclick();await flush();app3.get('nombre').value='David';app3.get('telefono').value='3111234567';await app3.get('continuar').onclick();assert.match(app3.get('estado-reserva').textContent,/reintenta/);assert.ok(app3.local.get('r200-pendiente'));await app3.get('continuar').onclick();const requests=app3.calls.filter(x=>x.name==='r200_reservar');assert.equal(requests[0].body.p_clave,requests[1].body.p_clave);assert.equal(requests[0].body.p_horario,requests[1].body.p_horario);
const noTicket=await app('boleto.js','boleto.html',()=>{throw Error('No debería llamar API');});assert.equal(noTicket.calls.length,0);assert.match(noTicket.get('estado-boleto').textContent,/no contiene/);
const view=await app('boleto.js','boleto.html',name=>ok(name==='r200_cancelar'?{...ticket,estado:'cancelada'}:ticket),{hash:'#'+'a'.repeat(64)});assert.equal(view.get('pasajero').textContent,ticket.pasajero);assert.equal(view.get('confirmacion').textContent,'🎟️ RESERVACIÓN CONFIRMADA');await view.get('cancelar').onclick();assert.equal(view.get('cancelar').hidden,true);assert.equal(view.get('confirmacion').textContent,'RESERVACIÓN CANCELADA');view.get('compartir').onclick();assert.match(decodeURIComponent(view.opened[0][0]),/Enlace privado: https:\/\/example.test\/ruta200\/boleto.html#/);
console.log('Frontend verificado: sin horarios, vehículo con cupos suficientes, validación, doble toque, respuesta perdida, clave privada, boleto y cancelación.');

const panel={administrador:true,conductores:[{id:1,nombre:'Blanca',vehiculo_id:1}],vehiculos:[{id:1,modelo:'MG5',color:'Blanco',activo:true}],horarios:[],reservaciones:[],pasajeros:[],historial:[]};
const operator={access_token:'test-only',refresh_token:'test-only',expires_at:Date.now()+3600000};
const op=await app('admin.js','admin.html',name=>ok(name==='r200_panel'?panel:{creadas:6,ya_publicadas:0}),{sessionData:operator});
assert.equal(op.get('crear-panel').hidden,false);assert.equal(op.get('foto-vehiculo').src,'vehiculos/mg5-blanco.svg');
for(let i=1;i<=6;i++){if(i>1)op.get('agregar-salida').onclick();op.get('rol-fecha-'+i).value='2031-01-20';op.get('rol-hora-'+i).value=['04:00','08:10','10:20','14:30','16:40','20:50'][i-1];}
op.get('crear').onsubmit({preventDefault(){}});await flush();await flush();
const bulk=op.calls.find(c=>c.name==='r200_crear_rol');assert.equal(bulk.body.p_salidas.length,6);assert.equal(bulk.body.p_conductor,1);assert.equal(bulk.body.p_salidas[1].origen,'Mezcales');assert.match(op.get('rol-estado').textContent,/6 salidas nuevas/);
const failed=await app('admin.js','admin.html',name=>name==='r200_panel'?ok(panel):({ok:false,json:async()=>({message:'Salida 2: se enciman'})}),{sessionData:operator});
failed.get('rol-fecha-1').value='2031-01-20';failed.get('rol-hora-1').value='04:00';failed.get('agregar-salida').onclick();failed.get('rol-fecha-2').value='2031-01-20';failed.get('rol-hora-2').value='04:30';failed.get('crear').onsubmit({preventDefault(){}});await flush();await flush();assert.match(failed.get('status').textContent,/Salida 2/);assert.equal(failed.get('rol-filas').children.length,2);
assert.equal(view.get('foto-carro').src,'vehiculos/mg5-blanco.svg');
console.log('Rol de seis salidas y tres vueltas, publicación conjunta, borrador conservado ante error y foto MG5 verificados.');

const fleetNames=['Blanca','Tony','Manuel','David','Francisco'];
const fleetModels=['MG5 Blanco','Versa V-Drive Blanco','Vento Blanco','Aveo Azul persuasión','Versa Azul'];
const fleetPaths=['mg5-blanco.svg','versa-vdrive-tony.svg','vento-manuel.svg','aveo-david.svg','versa-francisco.svg'];
const rows=fleetNames.map((conductor,i)=>({id:200+i,vehiculo_id:i+1,vehiculo:fleetModels[i],conductor,hora:'08:00',disponibles:4}));
const cars=await app('reservar.js','reservar.html',()=>ok(rows));cars.get('ruta').value='ida';cars.get('asientos').value='1';cars.get('actualizar').onclick();await flush();
assert.equal(cars.get('carros-horario').children.length,6);
for(let i=0;i<5;i++){const card=cars.get('carros-horario').children[i];assert.equal(card.children[0].src,'vehiculos/'+fleetPaths[i]);assert.equal(card.children[1].textContent,fleetNames[i]);assert.equal(card.children[2].textContent,fleetModels[i]);}
assert.equal(view.get('conductor-boleto').textContent,'Conductor: Blanca');
console.log('Cinco carros: fotos, nombres, modelos y hora vinculados correctamente; nombres en boleto verificados.');

const anonymous=await app('reservar.js','reservar.html',()=>ok(trips),{passengerData:null});anonymous.get('ruta').value='ida';anonymous.get('asientos').value='1';anonymous.get('actualizar').onclick();await flush();anonymous.get('nombre').value='David';anonymous.get('telefono').value='3111234567';await anonymous.get('continuar').onclick();assert.equal(anonymous.calls.filter(x=>x.name==='r200_reservar').length,0);assert.match(anonymous.location.href,/index\.html$/);assert.equal(anonymous.calls.some(c=>c.name==='r200_horarios'),false);
const different=await app('reservar.js','reservar.html',()=>ok(trips));different.get('ruta').value='ida';different.get('asientos').value='1';different.get('actualizar').onclick();await flush();different.get('nombre').value='David';different.get('telefono').value='3117654321';await different.get('continuar').onclick();assert.equal(different.calls.filter(x=>x.name==='r200_reservar').length,0);assert.equal(requests[1].headers.Authorization,'Bearer passenger-test');
console.log('SMS: reserva bloqueada sin sesión o con otro teléfono; token autenticado enviado al reservar.');

const sender=await app('sms-ui-test-entry.js','prueba-sms.html',()=>ok({}),{passengerData:null});sender.get('telefono').value='3111234567';await sender.get('enviar-sms').onclick();assert.equal(sender.calls.at(-1).name,'otp');assert.equal(sender.calls.at(-1).body.gotrue_meta_security.captcha_token,'captcha-test-only');const sends=sender.calls.length;await sender.get('enviar-sms').onclick();assert.equal(sender.calls.length,sends);
const blocked=await app('sms-ui-test-entry.js','prueba-sms.html',()=>ok({}),{passengerData:null,captchaToken:''});blocked.get('telefono').value='3111234567';await blocked.get('enviar-sms').onclick();assert.equal(blocked.calls.length,0);assert.match(blocked.get('estado-sms').textContent,/seguridad/);
const login=await app('admin.js','admin.html',name=>ok(name==='r200_panel'?panel:{access_token:'test-login',refresh_token:'test-refresh',expires_in:3600}));login.get('email').value='test@example.invalid';login.get('password').value='test-only-password';await login.get('login').onsubmit({preventDefault(){}});const passRequest=login.calls.find(c=>c.name==='token?grant_type=password');assert.equal(passRequest.body.gotrue_meta_security.captcha_token,'captcha-test-only');
const badLogin=await app('admin.js','admin.html',()=>ok({}),{captchaToken:''});badLogin.get('email').value='test@example.invalid';badLogin.get('password').value='test-only-password';await badLogin.get('login').onsubmit({preventDefault(){}});assert.equal(badLogin.calls.length,0);
console.log('Turnstile: token en SMS y login de operadores; sin token no se envía SMS ni contraseña; reenvío inmediato bloqueado.');

const unapproved=await app('reservar.js','reservar.html',()=>ok(trips),{presenceData:{verified:false}});assert.match(unapproved.location.href,/index\.html$/);assert.equal(unapproved.calls.some(c=>c.name==='r200_horarios'),false);assert.equal(app2.get('contenido').classList.contains('hidden'),false);assert.equal(fs.readFileSync(new URL('reservar.html',root),'utf8').includes('id="enviar-sms"'),false);
console.log('Acceso: teléfono y presencia comprobados antes de consultar viajes; sin aprobación redirige; formulario sin SMS repetido.');

const driverPanel={...panel,administrador:false,horarios:[{id:77,conductor_id:1,vehiculo_id:1,fecha:'2031-01-20',hora_salida:'08:00:00',origen:'Mezcales',destino:'Tepic',cupos_ocupados:0,cupos_totales:4,activo:true}]};
const driver=await app('admin.js','admin.html',name=>ok(name==='r200_panel'?driverPanel:{creadas:1,ya_publicadas:0}),{sessionData:operator});
assert.equal(driver.get('crear-panel').hidden,false);
assert.equal(driver.get('conductor').disabled,true);
assert.equal(driver.get('conductor').children.length,1);
const tripText=driver.get('horarios').children[0].children[0].children.map(e=>e.textContent);
assert.deepEqual(tripText,['Blanca · MG5','Salida: 8 a. m.','20/01/2031','Mezcales → Tepic','Disponible para reservar']);
driver.get('rol-fecha-1').value='2031-01-20';driver.get('rol-hora-1').value='08:00';
driver.get('crear').onsubmit({preventDefault(){}});await flush();await flush();
assert.equal(driver.calls.find(c=>c.name==='r200_crear_rol').body.p_conductor,1);
console.log('Conductor: publica su carro y ve hora de 12 horas, fecha día/mes/año y asientos separados.');

const summaryApp=await app('reservar.js','reservar.html',()=>ok(trips));
summaryApp.get('ruta').value='vuelta';summaryApp.get('fecha').value='2031-01-20';summaryApp.get('asientos').value='2';await summaryApp.get('actualizar').onclick();await flush();
summaryApp.get('nombre').value='Pasajero de prueba';summaryApp.get('nombre').oninput();
assert.equal(summaryApp.get('resumen-ruta').textContent,'Mezcales → Tepic');
assert.equal(summaryApp.get('resumen-fecha').textContent,'20/01/2031');
assert.equal(summaryApp.get('resumen-asientos').textContent,'2 asientos');
assert.equal(summaryApp.get('resumen-nombre').textContent,'Pasajero de prueba');
assert.match(summaryApp.get('resumen-hora').textContent,/8 a\. m\. · Mezcales/);
assert.equal(summaryApp.get('total').textContent,'$500 MXN');
assert.equal(summaryApp.get('reintentar-acceso').hidden,true);
const accessError=await app('reservar.js','reservar.html',()=>ok([]),{presenceData:{verified:'unexpected'}});
assert.equal(accessError.get('reintentar-acceso').hidden,false);
assert.equal(accessError.calls.some(c=>c.name==='r200_horarios'),false);
console.log('Resumen: recorrido, fecha, hora local, pasajero, asientos, total y reintento de acceso verificados.');

let maintenanceOn=true;
const maintenance=await app('admin.js','admin.html',name=>name==='r200_panel'&&maintenanceOn?({ok:false,json:async()=>({message:'Aplicación en mantenimiento. Intenta más tarde.'})}):ok(panel),{sessionData:operator});
assert.equal(maintenance.get('mantenimiento-panel').hidden,false);
assert.equal(maintenance.get('panel').hidden,true);
assert.equal(maintenance.get('login-panel').hidden,true);
assert.equal(maintenance.get('horarios').children.length,0);
maintenanceOn=false;await maintenance.get('reintentar-mantenimiento').onclick();
assert.equal(maintenance.get('mantenimiento-panel').hidden,true);assert.equal(maintenance.get('panel').hidden,false);
maintenanceOn=true;await maintenance.get('refresh').onclick();
assert.equal(maintenance.get('panel').hidden,true);assert.equal(maintenance.get('mantenimiento-panel').hidden,false);
assert.equal(maintenance.get('conductor').children.length,0);
await maintenance.get('salir-mantenimiento').onclick();
assert.equal(maintenance.get('mantenimiento-panel').hidden,true);assert.equal(maintenance.get('login-panel').hidden,false);
console.log('Mantenimiento individual: panel y datos ocultos; reintento, reactivación y cierre de sesión verificados.');

let resolveRoster;
const roster=await app('admin.js','admin.html',name=>name==='r200_panel'?ok({...driverPanel,horarios:[{...driverPanel.horarios[0],cupos_ocupados:4}],reservaciones:[]}):new Promise(resolve=>resolveRoster=resolve),{sessionData:operator});
const disclosure=roster.get('horarios').children[0].children.find(e=>e.tagName==='details');
assert.match(disclosure.children[0].textContent,/4\/4 asientos ocupados.*Ver pasajeros/);
assert.equal(roster.calls.filter(c=>c.name==='r200_pasajeros_salida').length,0);
disclosure.open=true;const opening=disclosure.ontoggle();await flush();await disclosure.ontoggle();
assert.equal(roster.calls.filter(c=>c.name==='r200_pasajeros_salida').length,1);
assert.equal(roster.calls.at(-1).body.p_horario,77);assert.equal(roster.calls.at(-1).headers.Authorization,'Bearer test-only');
resolveRoster(ok([{nombre:'<img src=x onerror=alert(1)>',telefono:'3111234567',asientos:2,estado:'confirmada'},{nombre:'Otra reserva',telefono:'523111234568',asientos:2,estado:'confirmada'},{nombre:'Sin contacto',telefono:'javascript:alert(1)',asientos:1,estado:'ausente'}]));await opening;
const manifest=disclosure.children[1];assert.equal(manifest.children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
const contacts=manifest.children[0].children[3];assert.equal(contacts.children[0].href,'tel:+523111234567');assert.equal(contacts.children[1].href,'https://wa.me/523111234567');assert.equal(contacts.children[1].rel,'noopener noreferrer');
assert.equal(manifest.children[1].children[3].children[0].href,'tel:+523111234568');assert.equal(manifest.children[2].children.length,3);
disclosure.open=false;await disclosure.ontoggle();disclosure.open=true;const reopening=disclosure.ontoggle();await flush();resolveRoster(ok([]));await reopening;assert.match(manifest.children[0].textContent,/no tiene reservaciones activas/);
disclosure.open=false;await disclosure.ontoggle();disclosure.open=true;const errorOpening=disclosure.ontoggle();await flush();resolveRoster({ok:false,json:async()=>({message:'Acceso no autorizado'})});await errorOpening;assert.match(manifest.children[0].textContent,/Acceso no autorizado/);
console.log('Pasajeros por salida: apertura, consulta autenticada, doble toque, reconsulta, contactos seguros, lista vacía y error verificados.');

const sameCard=driver.get('horarios').children[0],beforePoll=driver.calls.length;
const timer=driver.intervals.find(t=>t.ms===20000);assert.ok(timer);timer.fn();await flush();
assert.equal(driver.calls.length,beforePoll+1);assert.equal(driver.get('horarios').children[0],sameCard,'unchanged automatic refresh keeps the open card intact');
driver.get('actualizar-app').onclick();assert.match(driver.location.href,/actualizar=[0-9]+/);
console.log('Panel: actualización cada 20 segundos sin reconstruir tarjetas intactas y recarga de app con URL nueva verificadas.');

const blockedNavigation=await app('reservar.js','reservar.html',name=>ok(name==='r200_horarios'?trips:ticket));
blockedNavigation.get('nombre').value='Pasajero de prueba';blockedNavigation.get('asientos').value='1';
blockedNavigation.local.set('r200-tickets',JSON.stringify({dato_antiguo:true}));
Object.defineProperty(blockedNavigation.location,'href',{get:()=> 'https://example.test/ruta200/reservar.html',set:()=>{throw Error('Navegación bloqueada');}});
await blockedNavigation.get('continuar').onclick();
assert.equal(blockedNavigation.get('abrir-boleto').hidden,false);assert.match(blockedNavigation.get('abrir-boleto').href,/boleto.html#[a-f0-9]{64}$/);
assert.match(blockedNavigation.get('estado-confirmacion').textContent,/Reserva confirmada.*Abrir mi boleto/);
assert.equal(JSON.parse(blockedNavigation.local.get('r200-tickets')).length,1);
const rejectedBooking=await app('reservar.js','reservar.html',name=>name==='r200_horarios'?ok(trips):({ok:false,json:async()=>({message:'Este número ya tiene una reserva en esa salida'})}));
rejectedBooking.get('nombre').value='Pasajero de prueba';rejectedBooking.get('asientos').value='1';await rejectedBooking.get('continuar').onclick();
assert.match(rejectedBooking.get('estado-confirmacion').textContent,/ya tiene una reserva/);assert.equal(rejectedBooking.get('abrir-boleto').hidden,true);
console.log('Boleto: enlace de respaldo ante navegación bloqueada, historial local inválido y error visible junto al botón verificados.');
