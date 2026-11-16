import {API,KEY,rpc,today,message} from './r200.js';
const $=id=>document.getElementById(id);let session=null,data=null,busy=false;
try{session=JSON.parse(sessionStorage.getItem('r200-operador'));}catch{}
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
async function mutate(fn){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;try{await fn();await load();}catch(e){message($('status'),e.message,true);}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;}}
async function load(){
 try{data=await call('r200_panel');$('login-panel').hidden=true;$('panel').hidden=false;$('crear-panel').hidden=!data.administrador;render();message($('status'),'Panel actualizado · '+(data.administrador?'Administrador':'Conductor'));}
 catch(e){if(!session){$('panel').hidden=true;$('login-panel').hidden=false;}message($('status'),e.message,true);}
}
function render(){
 const selected=$('conductor').value;$('conductor').replaceChildren();for(const c of data.conductores){const v=data.vehiculos.find(x=>x.id===c.vehiculo_id);if(!v?.activo)continue;const o=document.createElement('option');o.value=c.id;o.textContent=c.nombre+' · '+v.modelo+' '+v.color;$('conductor').append(o);}if(selected)$('conductor').value=selected;
 const hs=$('horarios');hs.replaceChildren();for(const h of data.horarios){const a=document.createElement('article');a.append(p(h.fecha+' · '+h.hora_salida.slice(0,5)+' · '+h.origen+' → '+h.destino),p(h.cupos_ocupados+'/'+h.cupos_totales+' asientos ocupados · '+(h.activo?'Abierta':'Cerrada')));if(data.administrador&&h.activo)a.append(action('Cerrar nuevas reservas',async()=>{if(confirm('¿Cerrar esta salida a nuevas reservas? Los boletos se conservan.'))await call('r200_cerrar_horario',{p_horario:h.id});}));hs.append(a);}if(!data.horarios.length)hs.textContent='No hay salidas asignadas.';
 renderReservations();renderPassengers();
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
$('login').onsubmit=async e=>{e.preventDefault();$('entrar').disabled=true;try{const res=await fetch(API+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});const s=await res.json();$('password').value='';if(!res.ok)throw new Error('No se pudo iniciar sesión. Revisa tu cuenta registrada de RUTA 200.');saveSession({...s,expires_at:Date.now()+s.expires_in*1000});await load();}catch(e){message($('status'),e.message,true);}finally{$('entrar').disabled=false;}};
$('logout').onclick=async()=>{const old=session;saveSession(null);data=null;$('panel').hidden=true;$('login-panel').hidden=false;$('password').value='';if(old)fetch(API+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+old.access_token}}).catch(()=>{});message($('status'),'Sesión cerrada.');};
$('refresh').onclick=load;$('buscar').oninput=renderReservations;$('buscar-pasajero').oninput=renderPassengers;
$('fecha').min=today();$('fecha').value=today();$('origen').onchange=()=>{const min=today($('origen').value);$('fecha').min=min;if($('fecha').value<min)$('fecha').value=min;};
$('crear').onsubmit=e=>{e.preventDefault();mutate(async()=>{const c=data.conductores.find(x=>x.id===Number($('conductor').value));if(!c)throw new Error('Selecciona un conductor.');if(!confirm('¿Publicar esta salida para que los pasajeros puedan reservar?'))return;await call('r200_crear_horario',{p_vehiculo:c.vehiculo_id,p_conductor:c.id,p_fecha:$('fecha').value,p_hora:$('hora').value,p_origen:$('origen').value});});};
if(session)load();
