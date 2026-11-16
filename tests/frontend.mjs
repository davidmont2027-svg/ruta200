import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url);
class Element{
 constructor(){this.children=[];this.style={};this.hidden=false;this.disabled=false;this._value='';this.textContent='';const s=new Set();this.classList={add:v=>s.add(v),remove:v=>s.delete(v),contains:v=>s.has(v)};}
 set value(v){this._value=String(v);}get value(){return this._value;}get options(){return this.children;}
 append(...es){this.children.push(...es);}replaceChildren(...es){this.children=[...es];this._value=es[0]?.value||'';}
 setCustomValidity(s){this.validityMessage=s;}reportValidity(){return !this.validityMessage;}
}
async function app(file,html,respond,{hash=''}={}){
 const elements=new Map();const source=fs.readFileSync(new URL(html,root),'utf8');
 for(const m of source.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const el=new Element();el.hidden=/\bhidden\b/.test(m[0]);elements.set(m[1],el);}
 const get=id=>{if(!elements.has(id))throw Error('ID ausente: '+id);return elements.get(id);};
 const local=new Map(),session=new Map(),calls=[],opened=[];const storage=s=>({getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,v),removeItem:k=>s.delete(k)});
 const location={href:'https://example.test/ruta200/'+html,hash};
 const context=vm.createContext({Intl,Date,URL,Uint8Array,crypto:webcrypto,AbortSignal,JSON,Number,String,Array,Map,Math,Error,document:{hidden:false,getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]},location,localStorage:storage(local),sessionStorage:storage(session),setInterval:()=>0,confirm:()=>true,prompt:()=>null,window:{scrollTo(){},open:(...args)=>opened.push(args)},fetch:async(url,opts)=>{const name=url.split('/').pop(),body=JSON.parse(opts.body||'{}');calls.push({name,body});return respond(name,body,opts);}});
 const modules=new Map();async function load(name){if(modules.has(name))return modules.get(name);const mod=new vm.SourceTextModule(fs.readFileSync(new URL(name,root),'utf8'),{context,identifier:name});modules.set(name,mod);await mod.link(s=>load(s.replace('./','')));return mod;}
 await (await load(file)).evaluate();await flush();return {get,calls,local,location,context,opened};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const ok=data=>({ok:true,json:async()=>data});
const ticket={folio:'00000000-0000-4000-8000-000000000001',estado:'confirmada',pasajero:'<img src=x onerror=alert(1)>',telefono:'3111234567',asientos:3,total:750,origen:'Tepic',destino:'Mezcales',fecha:'2030-11-20',hora:'08:00',salida:'2030-11-20T15:00:00Z',cancelable_hasta:'2030-11-20T14:30:00Z',vehiculo:'Chevrolet Aveo 2026 Azul'};
const trips=[{id:101,hora:'08:00',disponibles:2},{id:102,hora:'08:00',disponibles:4}];
let app1=await app('reservar.js','index.html',()=>ok([]));app1.get('ruta').value='ida';app1.get('asientos').value='1';await app1.get('abrir-reserva').onclick();await flush();assert.equal(app1.get('continuar').disabled,true);assert.match(app1.get('estado-reserva').textContent,/No hay salidas/);
let resolveBooking;const app2=await app('reservar.js','index.html',(name)=>name==='r200_horarios'?ok(trips):new Promise(resolve=>resolveBooking=resolve));app2.get('ruta').value='ida';app2.get('asientos').value='3';app2.get('abrir-reserva').onclick();await flush();assert.equal(app2.get('salida').options.length,1);assert.equal(app2.get('continuar').disabled,false);
app2.get('nombre').value='David';app2.get('telefono').value='123';await app2.get('continuar').onclick();assert.equal(app2.calls.filter(x=>x.name==='r200_reservar').length,0);
app2.get('telefono').value='3111234567';const booking=app2.get('continuar').onclick();await app2.get('continuar').onclick();assert.equal(app2.calls.filter(x=>x.name==='r200_reservar').length,1);assert.equal(app2.calls.at(-1).body.p_horario,102);assert.match(app2.calls.at(-1).body.p_clave,/^[a-f0-9]{64}$/);assert.equal(app2.get('telefono').disabled,true);resolveBooking(ok(ticket));await booking;assert.match(app2.location.href,/boleto\.html#[a-f0-9]{64}$/);assert.equal(app2.location.href.includes('3111234567'),false);
let attempts=0;const app3=await app('reservar.js','index.html',name=>{if(name==='r200_horarios')return ok(trips);if(++attempts===1)throw Error('Respuesta perdida');return ok(ticket);});app3.get('ruta').value='ida';app3.get('asientos').value='1';app3.get('abrir-reserva').onclick();await flush();app3.get('nombre').value='David';app3.get('telefono').value='3111234567';await app3.get('continuar').onclick();assert.match(app3.get('estado-reserva').textContent,/reintenta/);assert.ok(app3.local.get('r200-pendiente'));await app3.get('continuar').onclick();const requests=app3.calls.filter(x=>x.name==='r200_reservar');assert.equal(requests[0].body.p_clave,requests[1].body.p_clave);assert.equal(requests[0].body.p_horario,requests[1].body.p_horario);
const noTicket=await app('boleto.js','boleto.html',()=>{throw Error('No debería llamar API');});assert.equal(noTicket.calls.length,0);assert.match(noTicket.get('estado-boleto').textContent,/no contiene/);
const view=await app('boleto.js','boleto.html',name=>ok(name==='r200_cancelar'?{...ticket,estado:'cancelada'}:ticket),{hash:'#'+'a'.repeat(64)});assert.equal(view.get('pasajero').textContent,ticket.pasajero);assert.equal(view.get('confirmacion').textContent,'🎟️ RESERVACIÓN CONFIRMADA');await view.get('cancelar').onclick();assert.equal(view.get('cancelar').hidden,true);assert.equal(view.get('confirmacion').textContent,'RESERVACIÓN CANCELADA');view.get('compartir').onclick();assert.match(decodeURIComponent(view.opened[0][0]),/Enlace privado: https:\/\/example.test\/ruta200\/boleto.html#/);
console.log('Frontend verificado: sin horarios, vehículo con cupos suficientes, validación, doble toque, respuesta perdida, clave privada, boleto y cancelación.');
