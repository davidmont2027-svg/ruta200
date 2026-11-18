import {setupDriverNotifications} from './avisos.js?v=20261118-sonido2';
import {createCaptcha} from './captcha.js';
import {API,KEY,rpc,today,message} from './r200.js';
import {fotosVehiculos} from './vehiculos.js';
const $=id=>document.getElementById(id);let session=null,data=null,busy=false,loading=false;
try{session=JSON.parse(sessionStorage.getItem('r200-operador'));}catch{}
let loginCaptcha;
function security(){if(!loginCaptcha){loginCaptcha=createCaptcha('captcha-operador');loginCaptcha.ready.catch(e=>message($('status'),e.message,true));}return loginCaptcha;}
$('reintentar-captcha-operador').onclick=()=>security().reset().catch(e=>message($('status'),e.message,true));

function saveSession(s){session=s;try{s?sessionStorage.setItem('r200-operador',JSON.stringify(s)):sessionStorage.removeItem('r200-operador');}catch{}}
async function access(){
 if(!session)throw new Error('Inicia sesión para continuar.');
 if(session.expires_at>Date.now()+60000)return session.access_token;
 const res=await fetch(API+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
 const s=await res.json();if(!res.ok){saveSession(null);throw new Error('La sesión venció. Vuelve a entrar.');}saveSession({...s,expires_at:Date.now()+s.expires_in*1000});return s.access_token;
}
const call=async(name,body)=>rpc(name,body,await access());
function p(text){const e=document.createElement('p');e.textContent=text;return e;}
function action(label,fn){const e=document.createElement('button');e.className='small';e.textContent=label;e.onclick=()=>mutate(fn);return e;}
function showMaintenance(error){
 if(!error?.message?.startsWith('Aplicación en mantenimiento'))return false;
 void avisos.stop();data=null;$('panel').hidden=true;$('login-panel').hidden=true;$('mantenimiento-panel').hidden=false;
 for(const id of ['horarios','reservaciones','pasajeros','flota','conductor'])$(id).replaceChildren();
 $('foto-vehiculo').hidden=true;$('foto-vehiculo').src='';message($('status'),'');return true;
}
async function mutate(fn){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;try{await fn();await load();}catch(e){if(!showMaintenance(e))message($('status'),e.message,true);}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;}}
async function load(){
 if(loading)return;loading=true;
 try{const next=await call('r200_panel');const changed=JSON.stringify(next)!==JSON.stringify(data);data=next;$('mantenimiento-panel').hidden=true;$('login-panel').hidden=true;$('panel').hidden=false;$('crear-panel').hidden=!data.conductores.length;if(changed)render();avisos.updateReservations(data.reservaciones);void avisos.start();message($('status'),'Panel actualizado · '+(data.administrador?'Administrador':'Conductor'));}
 catch(e){if(showMaintenance(e))return;if(!session){$('panel').hidden=true;$('login-panel').hidden=false;security();}message($('status'),e.message,true);}
 finally{loading=false;}
}
function fechaVisible(fecha){const [y,m,d]=fecha.split('-');return d+'/'+m+'/'+y;}
function horaVisible(hora){const [h,m]=hora.split(':');const n=Number(h);return (n%12||12)+(m==='00'?'':':'+m)+' '+(n<12?'a. m.':'p. m.');}
function render(){
 const selected=$('conductor').value;$('conductor').replaceChildren();for(const c of data.conductores){const v=data.vehiculos.find(x=>x.id===c.vehiculo_id);if(!v?.activo)continue;const o=document.createElement('option');o.value=c.id;o.textContent=c.nombre+' · '+v.modelo+' '+v.color;$('conductor').append(o);}if(selected&&data.conductores.some(c=>String(c.id)===selected))$('conductor').value=selected;else if(borrador?.conductor&&data.conductores.some(c=>String(c.id)===borrador.conductor))$('conductor').value=borrador.conductor;
 $('conductor').disabled=!data.administrador;
 renderFleet();const expanded=new Set([...document.querySelectorAll('.pasajeros-salida[open]')].map(el=>el.id));const hs=$('horarios');hs.replaceChildren();
 const ordenadas=[...data.horarios].sort((a,b)=>Number(b.activo)-Number(a.activo)||a.fecha.localeCompare(b.fecha)||a.hora_salida.localeCompare(b.hora_salida));
 for(const h of ordenadas){
  const a=document.createElement('article');a.className='salida-card';
  const info=document.createElement('div');info.className='salida-info';
  const c=data.conductores.find(c=>c.id===h.conductor_id),v=data.vehiculos.find(v=>v.id===h.vehiculo_id);
  const title=document.createElement('strong');title.textContent=(h.conductor_nombre||c?.nombre||'Conductor por confirmar')+' · '+(v?.modelo||h.vehiculo_nombre||'Vehículo '+h.vehiculo_id);
  info.append(title,p('Salida: '+horaVisible(h.hora_salida)),p(fechaVisible(h.fecha)),p(h.origen+' → '+h.destino));
  const estado=p(!h.activo?'Cerrada':Number(h.cupos_ocupados)>=Number(h.cupos_totales)?'Completa':'Disponible para reservar');estado.className='pill';info.append(estado);a.append(info);
  const photo=fotosVehiculos[h.vehiculo_id];if(photo){const img=document.createElement('img');img.src=photo.src;img.alt=photo.alt;img.className='salida-foto';a.append(img);}
  const disclosure=tripPassengerList(h);a.append(disclosure);disclosure.open=expanded.has(disclosure.id);
  if(data.administrador&&h.activo)info.append(action('Cerrar nuevas reservas',async()=>{if(confirm('¿Cerrar esta salida a nuevas reservas? Los boletos se conservan.'))await call('r200_cerrar_horario',{p_horario:h.id});}));
  hs.append(a);
 }if(!data.horarios.length)hs.textContent='No hay salidas asignadas.';
 actualizarFoto();renderReservations();renderPassengers();
}
function tripPassengerList(h){
 const details=document.createElement('details');details.className='pasajeros-salida';details.id='pasajeros-salida-'+h.id;
 const summary=document.createElement('summary');summary.textContent=h.cupos_ocupados+'/'+h.cupos_totales+' asientos ocupados · Ver pasajeros';
 const list=document.createElement('div');list.className='lista-viajeros';
 details.append(summary,list);let loading=false;
 details.ontoggle=async()=>{
  if(!details.open||loading)return;loading=true;list.replaceChildren(p('Consultando pasajeros…'));
  try{
   const passengers=await call('r200_pasajeros_salida',{p_horario:h.id});
   if(!Array.isArray(passengers))throw new Error('No se pudo consultar esta salida.');
   list.replaceChildren();
   if(!passengers.length)list.append(p('Esta salida todavía no tiene reservaciones activas.'));
   for(const person of passengers){
    const row=document.createElement('div');row.className='viajero';
    const name=document.createElement('strong');name.textContent=person.nombre;
    row.append(name,p(person.asientos+(Number(person.asientos)===1?' asiento':' asientos')+' · '+(person.estado==='ausente'?'Ausencia registrada':'Reservación confirmada')));
    const phone=String(person.telefono||'').replace(/\D/g,'');
    row.append(p('Teléfono: '+(phone||'No disponible')));
    const international=phone.length===10?'52'+phone:phone;
    if(/^52[0-9]{10}$/.test(international)){
     const links=document.createElement('div');links.className='contacto-viajero';
     const callLink=document.createElement('a');callLink.href='tel:+'+international;callLink.textContent='Llamar';
     const whatsapp=document.createElement('a');whatsapp.href='https://wa.me/'+international;whatsapp.textContent='WhatsApp';whatsapp.target='_blank';whatsapp.rel='noopener noreferrer';
     links.append(callLink,whatsapp);row.append(links);
    }
    list.append(row);
   }
  }catch(e){if(!showMaintenance(e))list.replaceChildren(p(e.message+' Cierra y vuelve a abrir para reintentar.'));}
  finally{loading=false;}
 };
 return details;
}
function renderFleet(){
 $('flota-panel').hidden=!data.administrador;const list=$('flota');list.replaceChildren();
 for(const c of data.conductores){const v=data.vehiculos.find(x=>x.id===c.vehiculo_id);if(!v)continue;const card=document.createElement('article');const photo=fotosVehiculos[v.id];if(photo){const img=document.createElement('img');img.src=photo.src;img.alt=photo.alt;img.style.cssText='width:100%;height:180px;object-fit:contain;border-radius:10px';card.append(img);}const name=document.createElement('strong');name.textContent=c.nombre;card.append(name,p(v.marca+' '+v.modelo+' · '+v.color));list.append(card);}
}
function renderReservations(){
 if(!data)return;const list=$('reservaciones');list.replaceChildren();const query=$('buscar').value.trim().toLocaleLowerCase('es');
 for(const r of data.reservaciones){if(![r.nombre_pasajero,r.telefono_pasajero,r.folio].join(' ').toLocaleLowerCase('es').includes(query))continue;const h=data.horarios.find(x=>x.id===r.horario_id);const a=document.createElement('article');a.append(p(r.nombre_pasajero+' · '+r.telefono_pasajero),p((h?h.fecha+' '+h.hora_salida.slice(0,5)+' '+h.origen+' → '+h.destino:'Salida #'+r.horario_id)+' · '+r.asientos+' asiento(s) · '+r.estado),p('Folio: '+r.folio));
 if(r.estado==='confirmada')a.append(action('Registrar ausencia',async()=>{const reason=prompt('Motivo de la ausencia (solo después de la salida):');if(reason)await call('r200_ausencia',{p_reservacion:r.id,p_ausente:true,p_motivo:reason});}));
 if(data.administrador&&r.estado==='ausente')a.append(action('Corregir ausencia',async()=>{const reason=prompt('Explica por qué se corrige esta ausencia:');if(reason)await call('r200_ausencia',{p_reservacion:r.id,p_ausente:false,p_motivo:reason});}));list.append(a);
 }if(!list.children.length)list.textContent='No hay reservaciones que mostrar.';
}
function renderPassengers(){
 if(!data)return;const list=$('pasajeros');list.replaceChildren();const query=$('buscar-pasajero').value.trim().toLocaleLowerCase('es');
 for(const person of data.pasajeros){if(!(person.nombre+' '+person.telefono).toLocaleLowerCase('es').includes(query))continue;const a=document.createElement('article');a.append(p(person.nombre+' · '+person.telefono),p(person.ausencias+' ausencia(s) desde la última reactivación · '+(person.suspendido?'SUSPENDIDO':'Activo')));if(person.motivo_suspension)a.append(p(person.motivo_suspension));
 for(const h of data.historial.filter(x=>x.telefono_pasajero===person.telefono))a.append(p(new Date(h.fecha_registro).toLocaleDateString('es-MX')+' · '+h.motivo+(h.anulada_at?' · CORREGIDA':'')));
 if(data.administrador&&person.suspendido)a.append(action('Dar segunda oportunidad',async()=>{const reason=prompt('Motivo de la reactivación acordada con el pasajero:');if(reason)await call('r200_reactivar',{p_telefono:person.telefono,p_motivo:reason});}));list.append(a);
 }if(!list.children.length)list.textContent='No hay pasajeros que mostrar.';
}
$('login').onsubmit=async e=>{e.preventDefault();if($('entrar').disabled)return;$('entrar').disabled=true;try{const captchaToken=await security().token();const res=await fetch(API+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value,gotrue_meta_security:{captcha_token:captchaToken}})});const s=await res.json();$('password').value='';if(!res.ok)throw new Error('No se pudo iniciar sesión. Revisa tu cuenta registrada de RUTA 200.');saveSession({...s,expires_at:Date.now()+s.expires_in*1000});await load();}catch(e){message($('status'),e.message,true);}finally{$('entrar').disabled=false;security().reset().catch(()=>{});}};
$('logout').onclick=async()=>{await avisos.stop({unsubscribe:true});const old=session;saveSession(null);data=null;$('mantenimiento-panel').hidden=true;$('panel').hidden=true;$('login-panel').hidden=false;$('password').value='';if(old)fetch(API+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+old.access_token}}).catch(()=>{});security().reset().catch(()=>{});message($('status'),'Sesión cerrada.');};
$('reintentar-mantenimiento').onclick=load;$('salir-mantenimiento').onclick=()=>$('logout').onclick();
$('actualizar-app').onclick=()=>{const url=new URL(location.href);url.searchParams.set('actualizar',String(Date.now()));location.replace(url.href);};
$('refresh').onclick=load;$('buscar').oninput=renderReservations;$('buscar-pasajero').oninput=renderPassengers;
let filas=[],filaId=0;
function guardarRol(){try{sessionStorage.setItem('r200-rol-borrador',JSON.stringify({conductor:$('conductor').value,salidas:filas.map(f=>({fecha:f.fecha.value,hora:f.hora.value,origen:f.origen.value}))}));}catch{}}
function actualizarFoto(){const c=data?.conductores.find(x=>x.id===Number($('conductor').value));const foto=fotosVehiculos[c?.vehiculo_id];const img=$('foto-vehiculo');img.hidden=!foto;if(foto){img.src=foto.src;img.alt=foto.alt;}}
$('conductor').onchange=()=>{actualizarFoto();guardarRol();};
function nuevaFila(valores={}){
 const id=++filaId,wrap=document.createElement('article'),grid=document.createElement('div');grid.className='grid';
 const fila={wrap};for(const [campo,titulo] of [['origen','Origen'],['fecha','Fecha'],['hora','Hora de salida']]){
  const box=document.createElement('div'),label=document.createElement('label'),input=document.createElement(campo==='origen'?'select':'input');
  input.id='rol-'+campo+'-'+id;label.htmlFor=input.id;label.textContent=titulo+' · Salida '+id;
  if(campo==='origen'){for(const origen of ['Tepic','Mezcales']){const opt=document.createElement('option');opt.value=origen;opt.textContent=origen;input.append(opt);}input.value=valores.origen||'Tepic';}
  else{input.type=campo==='fecha'?'date':'time';input.required=true;input.value=valores[campo]||(campo==='fecha'?today(valores.origen):'');}
  fila[campo]=input;input.onchange=()=>{fila.fecha.min=today(fila.origen.value);guardarRol();};box.append(label,input);grid.append(box);
 }
 fila.fecha.min=today(fila.origen.value);const remove=document.createElement('button');remove.type='button';remove.className='small';remove.textContent='Quitar esta salida';
 remove.onclick=()=>{filas=filas.filter(f=>f!==fila);wrap.remove();guardarRol();};wrap.append(grid,remove);filas.push(fila);$('rol-filas').append(wrap);return fila;
}
$('agregar-salida').onclick=()=>{const last=filas.at(-1);nuevaFila(last?{fecha:last.fecha.value,origen:last.origen.value==='Tepic'?'Mezcales':'Tepic'}:{});guardarRol();};
let borrador=null;try{borrador=JSON.parse(sessionStorage.getItem('r200-rol-borrador'));}catch{}
for(const s of borrador?.salidas?.length?borrador.salidas:[{}])nuevaFila(s);
$('crear').onsubmit=e=>{e.preventDefault();mutate(async()=>{
 const c=data.conductores.find(x=>x.id===Number($('conductor').value));if(!c)throw new Error('Selecciona un conductor.');
 if(!filas.length)throw new Error('Agrega al menos una salida al rol.');
 const salidas=filas.map(f=>({fecha:f.fecha.value,hora:f.hora.value,origen:f.origen.value}));
 if(salidas.some(s=>!s.fecha||!s.hora||s.fecha<today(s.origen)))throw new Error('Completa las fechas y horas futuras de todas las salidas.');
 const resumen=salidas.map((s,i)=>(i+1)+'. '+fechaVisible(s.fecha)+' · '+horaVisible(s.hora)+' · '+s.origen+' → '+(s.origen==='Tepic'?'Mezcales':'Tepic')).join('\n');
 if(!confirm('¿Publicar estas '+salidas.length+' salidas de '+c.nombre+'?\n\n'+resumen+'\n\nHoras locales de cada origen. Serán reservables al publicar.'))return;
 const controls=[...$('crear').querySelectorAll('input,select')];for(const el of controls)el.disabled=true;
 try{const result=await call('r200_crear_rol',{p_conductor:c.id,p_salidas:salidas});$('rol-filas').replaceChildren();filas=[];nuevaFila();guardarRol();message($('rol-estado'),'Rol publicado: '+result.creadas+' salidas nuevas; '+result.ya_publicadas+' ya estaban publicadas.');}
 finally{for(const el of controls)el.disabled=false;}
 });};
const avisos=setupDriverNotifications({getToken:access,onReservation:()=>{if(session&&!busy)void load();}});
if(session)load();else security();

setInterval(()=>{if(session&&data&&!busy&&!document.hidden)void load();},20000);
