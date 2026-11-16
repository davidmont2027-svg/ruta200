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
async function app(file,html,respond,{hash='',sessionData=null}={}){
 const elements=new Map();const source=fs.readFileSync(new URL(html,root),'utf8');
 for(const m of source.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const el=new Element(m[0].match(/^<(\w+)/)[1]);el.hidden=/\bhidden\b/.test(m[0]);elements.set(m[1],el);}
 const dynamic=[];const get=id=>{const found=elements.get(id)||dynamic.find(e=>e.id===id);if(!found)throw Error('ID ausente: '+id);return found;};
 const local=new Map(),session=new Map(),calls=[],opened=[];const storage=s=>({getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,v),removeItem:k=>s.delete(k)});
 const location={href:'https://example.test/ruta200/'+html,hash};if(sessionData)session.set('r200-operador',JSON.stringify(sessionData));
 const context=vm.createContext({Intl,Date,URL,Uint8Array,crypto:webcrypto,AbortSignal,JSON,Number,String,Array,Map,Math,Error,document:{hidden:false,getElementById:get,createElement:tag=>{const e=new Element(tag);dynamic.push(e);return e;},querySelectorAll:()=>[]},location,localStorage:storage(local),sessionStorage:storage(session),setInterval:()=>0,confirm:()=>true,prompt:()=>null,window:{scrollTo(){},open:(...args)=>opened.push(args)},fetch:async(url,opts)=>{const name=url.split('/').pop(),body=JSON.parse(opts.body||'{}');calls.push({name,body});return respond(name,body,opts);}});
 const modules=new Map();async function load(name){if(modules.has(name))return modules.get(name);const mod=new vm.SourceTextModule(fs.readFileSync(new URL(name,root),'utf8'),{context,identifier:name});modules.set(name,mod);await mod.link(s=>load(s.replace('./','')));return mod;}
 await (await load(file)).evaluate();await flush();return {get,calls,local,location,context,opened};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const ok=data=>({ok:true,json:async()=>data});
const ticket={vehiculo_id:1,conductor:'Blanca',folio:'00000000-0000-4000-8000-000000000001',estado:'confirmada',pasajero:'<img src=x onerror=alert(1)>',telefono:'3111234567',asientos:3,total:750,origen:'Tepic',destino:'Mezcales',fecha:'2030-11-20',hora:'08:00',salida:'2030-11-20T15:00:00Z',cancelable_hasta:'2030-11-20T14:30:00Z',vehiculo:'Chevrolet Aveo 2026 Azul'};
const trips=[{id:101,hora:'08:00',disponibles:2},{id:102,hora:'08:00',disponibles:4}];
let app1=await app('reservar.js','index.html',()=>ok([]));app1.get('ruta').value='ida';app1.get('asientos').value='1';await app1.get('abrir-reserva').onclick();await flush();assert.equal(app1.get('continuar').disabled,true);assert.match(app1.get('estado-reserva').textContent,/No hay salidas/);
let resolveBooking;const app2=await app('reservar.js','index.html',(name)=>name==='r200_horarios'?ok(trips):new Promise(resolve=>resolveBooking=resolve));app2.get('ruta').value='ida';app2.get('asientos').value='3';app2.get('abrir-reserva').onclick();await flush();assert.equal(app2.get('salida').options.length,1);assert.equal(app2.get('continuar').disabled,false);
app2.get('nombre').value='David';app2.get('telefono').value='123';await app2.get('continuar').onclick();assert.equal(app2.calls.filter(x=>x.name==='r200_reservar').length,0);
app2.get('telefono').value='3111234567';const booking=app2.get('continuar').onclick();await app2.get('continuar').onclick();assert.equal(app2.calls.filter(x=>x.name==='r200_reservar').length,1);assert.equal(app2.calls.at(-1).body.p_horario,102);assert.match(app2.calls.at(-1).body.p_clave,/^[a-f0-9]{64}$/);assert.equal(app2.get('telefono').disabled,true);resolveBooking(ok(ticket));await booking;assert.match(app2.location.href,/boleto\.html#[a-f0-9]{64}$/);assert.equal(app2.location.href.includes('3111234567'),false);
let attempts=0;const app3=await app('reservar.js','index.html',name=>{if(name==='r200_horarios')return ok(trips);if(++attempts===1)throw Error('Respuesta perdida');return ok(ticket);});app3.get('ruta').value='ida';app3.get('asientos').value='1';app3.get('abrir-reserva').onclick();await flush();app3.get('nombre').value='David';app3.get('telefono').value='3111234567';await app3.get('continuar').onclick();assert.match(app3.get('estado-reserva').textContent,/reintenta/);assert.ok(app3.local.get('r200-pendiente'));await app3.get('continuar').onclick();const requests=app3.calls.filter(x=>x.name==='r200_reservar');assert.equal(requests[0].body.p_clave,requests[1].body.p_clave);assert.equal(requests[0].body.p_horario,requests[1].body.p_horario);
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
const cars=await app('reservar.js','index.html',()=>ok(rows));cars.get('ruta').value='ida';cars.get('asientos').value='1';cars.get('abrir-reserva').onclick();await flush();
assert.equal(cars.get('carros-horario').children.length,6);
for(let i=0;i<5;i++){const card=cars.get('carros-horario').children[i];assert.equal(card.children[0].src,'vehiculos/'+fleetPaths[i]);assert.equal(card.children[1].textContent,fleetNames[i]);assert.equal(card.children[2].textContent,fleetModels[i]);}
assert.equal(view.get('conductor-boleto').textContent,'Conductor: Blanca');
console.log('Cinco carros: fotos, nombres, modelos y hora vinculados correctamente; nombres en boleto verificados.');
