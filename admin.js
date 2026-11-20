import {setupOperatorPasskeys} from './operator-passkeys.js?v=20261119-compacta1';
import {setupDriverNotifications} from './avisos.js?v=20261119-auto1';
import {createCaptcha} from './captcha.js?v=20261119-wait1';
import {API,KEY,rpc,today,message as baseMessage} from './r200.js';
import {fotosVehiculos} from './vehiculos.js';
const $=id=>document.getElementById(id);let session=null,data=null,busy=false,loading=false,vistaTodos=false,fechaVista='';
function message(el,text,error=false){baseMessage(el,text,error);if(el===$('status'))el.style.color=error?'#8c3024':'#294a35';}
try{session=JSON.parse(localStorage.getItem('r200-operador')||sessionStorage.getItem('r200-operador'));if(session){localStorage.setItem('r200-operador',JSON.stringify(session));sessionStorage.removeItem('r200-operador');}}catch{}
let loginCaptcha;
function security(){if(!loginCaptcha){loginCaptcha=createCaptcha('captcha-operador');loginCaptcha.ready.catch(e=>message($('status'),e.message,true));}return loginCaptcha;}
$('reintentar-captcha-operador').onclick=()=>security().reset().catch(e=>message($('status'),e.message,true));

function saveSession(s){session=s;try{s?localStorage.setItem('r200-operador',JSON.stringify(s)):localStorage.removeItem('r200-operador');sessionStorage.removeItem('r200-operador');}catch{}}
let refreshing=null;
async function access(){
 if(!session)throw new Error('Inicia sesión para continuar.');
 if(session.expires_at>Date.now()+60000)return session.access_token;
 if(refreshing)return refreshing;
 const original=session;
 refreshing=(async()=>{
  const res=await fetch(API+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:original.refresh_token})});
  const s=await res.json();
  if(session!==original)throw new Error('La sesión cambió. Vuelve a abrir tu panel.');
  if(!res.ok){if(res.status===400||res.status===401||res.status===403){saveSession(null);throw new Error('La sesión venció. Vuelve a entrar.');}throw new Error('No se pudo renovar la sesión. Revisa tu conexión e intenta de nuevo.');}
  saveSession({...s,expires_at:Date.now()+s.expires_in*1000});return s.access_token;
 })();
 try{return await refreshing;}finally{refreshing=null;}
}
const call=async(name,body)=>rpc(name,body,await access());
async function diagnosticoHuella(detalle){
 try{sessionStorage.setItem('r200-huella-diagnostico',JSON.stringify(detalle));}catch{}
 if(session&&data){try{await call('r200_diagnostico_huella',detalle);sessionStorage.removeItem('r200-huella-diagnostico');}catch{}}
}
function enviarDiagnosticoGuardado(){try{const raw=sessionStorage.getItem('r200-huella-diagnostico');if(raw)void diagnosticoHuella(JSON.parse(raw));}catch{}}
function p(text){const e=document.createElement('p');e.textContent=text;return e;}
function action(label,fn){const e=document.createElement('button');e.className='small';e.textContent=label;e.onclick=()=>mutate(fn);return e;}
function showMaintenance(error){
 if(!error?.message?.startsWith('Aplicación en mantenimiento'))return false;
 void avisos.stop();data=null;$('panel').hidden=true;$('login-panel').hidden=true;$('mantenimiento-panel').hidden=false;
 for(const id of ['horarios','horarios-proximos','horarios-pasados','jornada-proxima-contenido','reservaciones','pasajeros','flota','conductor'])$(id).replaceChildren();
 $('foto-vehiculo').hidden=true;$('foto-vehiculo').src='';message($('status'),'');return true;
}
async function mutate(fn){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;try{await fn();await load();}catch(e){if(!showMaintenance(e))message($('status'),e.message,true);}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;}}
async function load(){
 if(loading)return;loading=true;
 try{const next=await call('r200_panel');const changed=JSON.stringify(next)!==JSON.stringify(data)||fechaVista!==today('Tepic')+today('Mezcales');data=next;$('mantenimiento-panel').hidden=true;$('login-panel').hidden=true;$('panel').hidden=false;$('crear-panel').hidden=!data.conductores.length;if(changed)render();else renderJornada();avisos.updateReservations(data.reservaciones);void avisos.start();enviarDiagnosticoGuardado();message($('status'),'Panel actualizado · '+(data.administrador?'Administrador':'Conductor'));}
 catch(e){if(showMaintenance(e))return;if(!session){$('panel').hidden=true;$('login-panel').hidden=false;security();}message($('status'),e.message,true);}
 finally{loading=false;}
}
function fechaVisible(fecha){const [y,m,d]=fecha.split('-');return d+'/'+m+'/'+y;}
function horaVisible(hora){const [h,m]=hora.split(':');const n=Number(h);return (n%12||12)+(m==='00'?'':':'+m)+' '+(n<12?'a. m.':'p. m.');}
function propios(){return data.mis_conductores||(!data.administrador?data.conductores.map(c=>c.id):[]);}
function visible(h){return !data.administrador||vistaTodos||propios().includes(h.conductor_id);}
$('vista-mis-viajes').onclick=()=>{vistaTodos=false;render();};
$('vista-todos-carros').onclick=()=>{vistaTodos=true;render();};
function grupoViaje(h){const hoy=today(h.origen);return h.fecha<hoy?'pasados':h.fecha>hoy?'proximos':'hoy';}
function render(){
 fechaVista=today('Tepic')+today('Mezcales');
 $('vistas-administrador').hidden=!data.administrador;
 $('vista-mis-viajes').disabled=!vistaTodos;$('vista-todos-carros').disabled=vistaTodos;
 $('salidas-titulo').textContent=vistaTodos?'Salidas de todos los carros':'Mis salidas';
 $('resumen-viajes').textContent=vistaTodos?'Ver viajes de hoy · Todos los carros':'Ver mis viajes de hoy';
 const selected=$('conductor').value;$('conductor').replaceChildren();for(const c of data.conductores){if(data.administrador&&!vistaTodos&&!propios().includes(c.id))continue;const v=data.vehiculos.find(x=>x.id===c.vehiculo_id);if(!v?.activo)continue;const o=document.createElement('option');o.value=c.id;o.textContent=c.nombre+' · '+v.modelo+' '+v.color;$('conductor').append(o);}if(selected&&data.conductores.some(c=>String(c.id)===selected&&(vistaTodos||!data.administrador||propios().includes(c.id))))$('conductor').value=selected;else if(borrador?.conductor&&data.conductores.some(c=>String(c.id)===borrador.conductor&&(vistaTodos||!data.administrador||propios().includes(c.id))))$('conductor').value=borrador.conductor;else if(propios().length)$('conductor').value=propios()[0];
 $('conductor').disabled=!data.administrador;
 renderFleet();const expanded=new Set([...document.querySelectorAll('.pasajeros-salida[open],.administrar-viaje[open]')].map(el=>el.id));const listas={hoy:$('horarios'),proximos:$('horarios-proximos'),pasados:$('horarios-pasados')};for(const lista of Object.values(listas))lista.replaceChildren();
 const ordenadas=data.horarios.filter(visible).sort((a,b)=>(grupoViaje(a)==='pasados'&&grupoViaje(b)==='pasados'?-1:1)*(a.fecha.localeCompare(b.fecha)||a.hora_salida.localeCompare(b.hora_salida)));
 for(const h of ordenadas){
  const a=document.createElement('article');a.className='salida-card';
  const info=document.createElement('div');info.className='salida-info';
  const c=data.conductores.find(c=>c.id===h.conductor_id),v=data.vehiculos.find(v=>v.id===h.vehiculo_id);
  const title=document.createElement('strong');title.textContent=(h.conductor_nombre||c?.nombre||'Conductor por confirmar')+' · '+(v?.modelo||h.vehiculo_nombre||'Vehículo '+h.vehiculo_id);
  info.append(title,p('Salida: '+horaVisible(h.hora_salida)),p(fechaVisible(h.fecha)),p(h.origen+' → '+h.destino));
  const futura=salidaInstante(h)>Date.now();
  const estado=p(h.cancelado_at?'Viaje cancelado':!h.activo?'Cerrada':!futura?'Salida pasada':Number(h.cupos_ocupados)>=Number(h.cupos_totales)?'Completa':Math.max(0,h.cupos_totales-h.cupos_ocupados)+' lugares disponibles');estado.className='pill';info.append(estado);a.append(info);
  const disclosure=tripPassengerList(h);a.append(disclosure);disclosure.open=expanded.has(disclosure.id);
  const administrar=document.createElement('details');administrar.className='administrar-viaje';administrar.id='administrar-viaje-'+h.id;administrar.open=expanded.has(administrar.id);
  const summary=document.createElement('summary');summary.textContent='Administrar viaje';administrar.append(summary);
  if(!h.cancelado_at&&futura){const cancel=action('Cancelar viaje completo',()=>cancelarViaje(h));cancel.className='small cancelar-viaje';administrar.append(cancel);}
  if(h.punto_encuentro)administrar.append(p('Encuentro: '+h.punto_encuentro));
  if(h.activo&&futura)administrar.append(ajusteAsientos(h));
  if(data.administrador&&h.activo&&futura)administrar.append(action('Cerrar nuevas reservas',async()=>{if(confirm('¿Cerrar esta salida a nuevas reservas? Los boletos se conservan.'))await call('r200_cerrar_horario',{p_horario:h.id});}));
  a.append(administrar);
  listas[grupoViaje(h)].append(a);
 }for(const [grupo,lista] of Object.entries(listas))if(!lista.children.length)lista.textContent=grupo==='hoy'?'No tienes viajes para hoy.':grupo==='proximos'?'No tienes próximos viajes.':'No hay viajes pasados.';
 actualizarFoto();renderReservations();renderPassengers();renderJornada();
}
function tripPassengerList(h){
 const details=document.createElement('details');details.className='pasajeros-salida';details.id='pasajeros-salida-'+h.id;
 const summary=document.createElement('summary');summary.textContent='Ver pasajeros · '+h.cupos_ocupados+' reservado'+(Number(h.cupos_ocupados)===1?'':'s');
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
    const contacts=contactosPasajero(phone,person.nombre);if(contacts)row.append(contacts);
    if(person.id&&person.estado==='confirmada'&&salidaInstante(h)>Date.now())row.append(action('Cancelar esta reservación',()=>cancelarReserva(person.id,person.nombre)));
    list.append(row);
   }
  }catch(e){if(!showMaintenance(e))list.replaceChildren(p(e.message+' Cierra y vuelve a abrir para reintentar.'));}
  finally{loading=false;}
 };
 return details;
}
function motivoCancelacion(texto){const value=prompt(texto);if(value===null)return null;const reason=value.trim();if(reason.length<3||reason.length>240)throw Error('Escribe un motivo de 3 a 240 caracteres.');return reason;}
async function cancelarViaje(h){
 if(!confirm('¿Cancelar COMPLETAMENTE este viaje? Se cancelarán todas sus reservaciones y se liberarán sus lugares.'))return;
 const motivo=motivoCancelacion('Motivo de la cancelación del viaje (lo verá el pasajero en su boleto):');if(motivo===null)return;
 const result=await call('r200_cancelar_viaje',{p_horario:h.id,p_motivo:motivo});
 message($('status'),'Viaje cancelado. '+result.reservas_canceladas+' reservación(es) cancelada(s). Contacta a los pasajeros por llamada o WhatsApp.');
}
async function cancelarReserva(id,nombre){
 if(!confirm('¿Cancelar la reservación de '+nombre+'? Sus lugares volverán a estar disponibles.'))return;
 const motivo=motivoCancelacion('Motivo de cancelación (lo verá el pasajero en su boleto):');if(motivo===null)return;
 await call('r200_cancelar_reserva_conductor',{p_reservacion:id,p_motivo:motivo});
 message($('status'),'Reservación cancelada y lugares liberados. Contacta al pasajero por llamada o WhatsApp.');
}
function contactosPasajero(phone,name='pasajero'){
 const digits=String(phone||'').replace(/\D/g,''),international=digits.length===10?'52'+digits:digits;
 if(!/^52[0-9]{10}$/.test(international))return null;
 const links=document.createElement('div');links.className='contacto-viajero';
 for(const [label,href,icon] of [['Llamar','tel:+'+international,'contacto-llamar.svg'],['WhatsApp','https://wa.me/'+international,'contacto-whatsapp.svg']]){
  const link=document.createElement('a');link.href=href;link.className=label==='WhatsApp'?'contacto-whatsapp':'contacto-llamar';link.ariaLabel=label+' a '+name;link.title=label+' a '+name;
  const image=document.createElement('img');image.src='icons/'+icon;image.alt='';image.width=22;image.height=22;const text=document.createElement('span');text.textContent=label;link.append(image,text);
  if(label==='WhatsApp'){link.target='_blank';link.rel='noopener noreferrer';}
  links.append(link);
 }
 return links;
}
function renderFleet(){
 $('flota-panel').hidden=!data.administrador||!vistaTodos;const list=$('flota');list.replaceChildren();
 for(const c of data.conductores){const v=data.vehiculos.find(x=>x.id===c.vehiculo_id);if(!v)continue;const card=document.createElement('article');const photo=fotosVehiculos[v.id];if(photo){const img=document.createElement('img');img.src=photo.src;img.alt=photo.alt;img.style.cssText='width:100%;height:180px;object-fit:contain;border-radius:10px';card.append(img);}const name=document.createElement('strong');name.textContent=c.nombre;card.append(name,p(v.marca+' '+v.modelo+' · '+v.color));list.append(card);}
}
function renderReservations(){
 if(!data)return;const list=$('reservaciones');list.replaceChildren();const query=$('buscar').value.trim().toLocaleLowerCase('es');
 for(const r of data.reservaciones){if(!vistaTodos&&data.administrador&&!data.horarios.some(h=>h.id===r.horario_id&&visible(h)))continue;if(![r.nombre_pasajero,r.telefono_pasajero,r.folio].join(' ').toLocaleLowerCase('es').includes(query))continue;const h=data.horarios.find(x=>x.id===r.horario_id);const a=document.createElement('article');a.append(p(r.nombre_pasajero+' · '+r.telefono_pasajero),p((h?h.fecha+' '+h.hora_salida.slice(0,5)+' '+h.origen+' → '+h.destino:'Salida #'+r.horario_id)+' · '+r.asientos+' asiento(s) · '+r.estado),p('Folio: '+r.folio));const contacts=contactosPasajero(r.telefono_pasajero,r.nombre_pasajero);if(contacts)a.append(contacts);
 if(r.estado==='confirmada'&&h&&salidaInstante(h)>Date.now())a.append(action('Cancelar esta reservación',()=>cancelarReserva(r.id,r.nombre_pasajero)));
 if(r.motivo_cancelacion)a.append(p('Motivo de cancelación: '+r.motivo_cancelacion));
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
$('logout').onclick=async()=>{await avisos.stop({unsubscribe:true});const old=session;saveSession(null);data=null;reservasVistas=null;proximaClave='';$('jornada-nueva').hidden=true;$('mantenimiento-panel').hidden=true;$('panel').hidden=true;$('login-panel').hidden=false;$('password').value='';if(old)fetch(API+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+old.access_token}}).catch(()=>{});security().reset().catch(()=>{});message($('status'),'Sesión cerrada.');};
$('reintentar-mantenimiento').onclick=load;$('salir-mantenimiento').onclick=()=>$('logout').onclick();
$('actualizar-app').onclick=()=>{const url=new URL(location.href);url.searchParams.set('actualizar',String(Date.now()));location.replace(url.href);};
$('refresh').onclick=load;$('buscar').oninput=()=>{$('lista-reservaciones').open=!!$('buscar').value.trim();renderReservations();};$('buscar-pasajero').oninput=renderPassengers;
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
let publicarPaso=0,publicarAsientos=4;
try{const draft=JSON.parse(sessionStorage.getItem('r200-publicar-borrador'));if(draft){$('publicar-origen').value=draft.origen==='Mezcales'?'Mezcales':'Tepic';$('publicar-fecha').value=draft.fecha||'';$('publicar-hora').value=draft.hora||'';$('publicar-encuentro').value=String(draft.encuentro||'').slice(0,160);publicarAsientos=Number.isInteger(draft.asientos)&&draft.asientos>=1&&draft.asientos<=4?draft.asientos:4;}}catch{}
if(!$('publicar-fecha').value)$('publicar-fecha').value=today($('publicar-origen').value);
function guardarPublicacion(){try{sessionStorage.setItem('r200-publicar-borrador',JSON.stringify({origen:$('publicar-origen').value,fecha:$('publicar-fecha').value,hora:$('publicar-hora').value,encuentro:$('publicar-encuentro').value,asientos:publicarAsientos}));}catch{}}
function mapaPublicacion(){
 const origen=$('publicar-origen').value,destino=origen==='Tepic'?'Mezcales':'Tepic';
 const from=encodeURIComponent(origen+', Nayarit, México'),to=encodeURIComponent(destino+', Nayarit, México');
 const frame=document.createElement('iframe');frame.title='Mapa de '+origen+' a '+destino;frame.src='https://maps.google.com/maps?saddr='+from+'&daddr='+to+'&output=embed';frame.loading='lazy';
 const link=document.createElement('a');link.textContent='Abrir recorrido en Google Maps ↗';link.href='https://www.google.com/maps/dir/?api=1&origin='+from+'&destination='+to+'&travelmode=driving';link.target='_blank';link.rel='noopener';$('publicar-mapa').replaceChildren(frame,link);
}
function mostrarPublicacion(){
 for(let i=0;i<5;i++)$('publicar-paso-'+i).hidden=i!==publicarPaso;
 const labels=['Tu recorrido','Tus asientos','Hora de salida','Punto de encuentro','Revisa tu salida'];
 $('publicar-progreso').textContent='Paso '+(publicarPaso+1)+' de 5 · '+labels[publicarPaso];
 $('publicar-cantidad').textContent=String(publicarAsientos);$('publicar-atras').hidden=publicarPaso===0;
 $('publicar-menos').disabled=publicarAsientos<=1;$('publicar-mas').disabled=publicarAsientos>=4;
 $('publicar-siguiente').textContent=publicarPaso===4?'Publicar mi viaje →':'Continuar →';
 $('publicar-zona').textContent='Hora local de '+$('publicar-origen').value+'.';
 $('publicar-fecha').min=today($('publicar-origen').value);
 $('publicar-resumen-ruta').textContent=$('publicar-origen').value+' → '+($('publicar-origen').value==='Tepic'?'Mezcales':'Tepic');
 $('publicar-resumen-fecha').textContent=($('publicar-fecha').value?fechaVisible($('publicar-fecha').value):'')+' · '+($('publicar-hora').value?horaVisible($('publicar-hora').value):'')+' (hora de '+$('publicar-origen').value+')';
 $('publicar-resumen-asientos').textContent=publicarAsientos+' asiento(s) disponibles';$('publicar-resumen-encuentro').textContent=$('publicar-encuentro').value.trim();
}
for(const id of ['publicar-fecha','publicar-hora','publicar-encuentro'])$(id).oninput=guardarPublicacion;
$('publicar-origen').onchange=()=>{guardarPublicacion();mapaPublicacion();mostrarPublicacion();};
$('publicar-menos').onclick=()=>{publicarAsientos=Math.max(1,publicarAsientos-1);guardarPublicacion();mostrarPublicacion();};
$('publicar-mas').onclick=()=>{publicarAsientos=Math.min(4,publicarAsientos+1);guardarPublicacion();mostrarPublicacion();};
$('publicar-atras').onclick=()=>{if(busy)return;publicarPaso=Math.max(0,publicarPaso-1);message($('publicar-error'),'');mostrarPublicacion();};
$('publicar-otra').onclick=()=>{$('publicar-listo').hidden=true;$('publicar-form').hidden=false;publicarPaso=0;mostrarPublicacion();};
$('publicar-form').onsubmit=e=>{e.preventDefault();if(busy)return;
 const fecha=$('publicar-fecha').value,hora=$('publicar-hora').value,encuentro=$('publicar-encuentro').value.trim(),origen=$('publicar-origen').value;
 let error='';
 if(publicarPaso===0&&(!fecha||fecha<today(origen)))error='Elige una fecha de hoy en adelante.';
 if(publicarPaso===2&&!/^\d{2}:\d{2}$/.test(hora))error='Elige la hora de salida.';
 if(publicarPaso===3&&(encuentro.length<3||encuentro.length>160))error='Escribe el punto de encuentro (3 a 160 caracteres).';
 message($('publicar-error'),error,!!error);if(error)return;
 if(publicarPaso<4){publicarPaso++;mostrarPublicacion();return;}
 const conductor=Number($('conductor').value);if(!data?.conductores.some(c=>c.id===conductor)){message($('publicar-error'),'Selecciona tu conductor y vehículo.',true);return;}
 const body={p_conductor:conductor,p_fecha:fecha,p_hora:hora,p_origen:origen,p_asientos:publicarAsientos,p_encuentro:encuentro};
 void mutate(async()=>{const inputs=[$('publicar-origen'),$('publicar-fecha'),$('publicar-hora'),$('publicar-encuentro')];for(const input of inputs)input.disabled=true;
 try{const result=await call('r200_publicar_viaje',body);$('publicar-form').hidden=true;$('publicar-listo').hidden=false;message($('publicar-resultado'),result.ya_publicado?'Esta salida ya estaba publicada. Conservamos sus asientos y punto de encuentro actuales.':'Salida publicada. Ya pueden reservar y puedes ajustar sus lugares en «Mis salidas».');try{sessionStorage.removeItem('r200-publicar-borrador');}catch{}}
 catch(error){message($('publicar-error'),error.message,true);throw error;}finally{for(const input of inputs)input.disabled=false;}
 });
};
mostrarPublicacion();mapaPublicacion();
function ajusteAsientos(h){
 const wrap=document.createElement('section');wrap.className='ajuste-asientos';const heading=document.createElement('h3');heading.textContent='Asientos disponibles';
 let disponibles=Math.max(0,Number(h.cupos_totales)-Number(h.cupos_ocupados));const max=Math.max(0,4-Number(h.cupos_ocupados));
 const counter=document.createElement('div');counter.className='seat-counter';const minus=document.createElement('button'),output=document.createElement('output'),plus=document.createElement('button'),save=document.createElement('button'),status=document.createElement('p');
 minus.type=plus.type=save.type='button';minus.textContent='−';plus.textContent='+';minus.ariaLabel='Reducir asientos disponibles';plus.ariaLabel='Aumentar asientos disponibles';save.textContent='Aceptar';status.className='muted';status.setAttribute?.('role','status');
 const update=()=>{output.textContent=String(disponibles);minus.disabled=disponibles===0;plus.disabled=disponibles>=max;};
 minus.onclick=()=>{disponibles=Math.max(0,disponibles-1);update();};plus.onclick=()=>{disponibles=Math.min(max,disponibles+1);update();};
 save.onclick=()=>{if(busy)return;void mutate(async()=>{try{const result=await call('r200_ajustar_disponibles',{p_horario:h.id,p_disponibles:disponibles,p_ocupados_esperados:Number(h.cupos_ocupados),p_total_esperado:Number(h.cupos_totales)});message($('status'),'Actualizado: '+result.disponibles+' asiento(s) disponibles.');}catch(error){message(status,error.message,true);throw error;}});};
 counter.append(minus,output,plus);wrap.append(heading,counter,save,status,p('Las reservas confirmadas se conservan.'));update();return wrap;
}

const huella=setupOperatorPasskeys({getSession:async()=>{await access();return session;},canRegister:()=>!!(session&&data&&!busy),canStart:()=>!busy&&!$('entrar').disabled,getCaptcha:()=>security().token({wait:true}),onSession:async s=>{saveSession(s);await load();},onDiagnostic:diagnosticoHuella,onBusy:value=>{busy=value;$('entrar').disabled=value;if(!value)security().reset().catch(()=>{});}});
const avisos=setupDriverNotifications({getToken:access,onReservation:()=>{if(session&&!busy)void load();}});
if(session)load();else security();

setInterval(()=>{if(session&&data&&!busy&&!document.hidden)void load();},20000);

$('navegar-salidas').onclick=()=>{abrirVista('viajes');$('lista-viajes').open=true;};
$('publicar-ver-salidas').onclick=()=>{abrirVista('viajes');$('lista-viajes').open=true;$('lista-proximos').open=true;};
$('navegar-reservas').onclick=()=>{abrirVista('reservas');$('lista-reservaciones').open=true;};

function abrirVista(vista){for(const id of ['publicar','viajes','reservas'])$('vista-'+id).hidden=id!==vista;const el=$('vista-'+vista);el.scrollIntoView?.({behavior:'smooth',block:'start'});}
$('jornada-publicar').onclick=()=>abrirVista('publicar');
$('jornada-nueva-ver').onclick=()=>{$('navegar-reservas').onclick();$('jornada-nueva').hidden=true;};
let reservasVistas=null,proximaClave='';
function salidaInstante(h){const utc=new Date(h.fecha+'T'+h.hora_salida+'Z').getTime();return utc+(h.origen==='Tepic'?7:6)*3600000;}
function renderJornada(){
 const viajes=data.horarios.filter(visible),hoy=viajes.filter(h=>grupoViaje(h)==='hoy');
 $('jornada-viajes').textContent=String(hoy.filter(h=>h.activo).length);
 const confirmadas=data.reservaciones.filter(r=>r.estado==='confirmada'&&viajes.some(h=>h.id===r.horario_id));
 $('jornada-pasajeros').textContent=String(confirmadas.filter(r=>hoy.some(h=>h.id===r.horario_id)).reduce((n,r)=>n+Number(r.asientos),0));
 const proximas=viajes.filter(h=>h.activo&&salidaInstante(h)>=Date.now()).sort((a,b)=>salidaInstante(a)-salidaInstante(b));
 const h=proximas[0],key=JSON.stringify(h||null);const box=$('jornada-proxima-contenido');
 if(key!==proximaClave){proximaClave=key;box.replaceChildren();
  if(!h){box.append(p('No tienes próximas salidas publicadas.'));const button=document.createElement('button');button.textContent='Publicar mi primer viaje';button.onclick=()=>abrirVista('publicar');box.append(button);}
  else{const date=p((grupoViaje(h)==='hoy'?'Hoy':fechaVisible(h.fecha))+' · Hora de '+h.origen),time=p(horaVisible(h.hora_salida));time.className='proxima-hora';const route=p(h.origen+' → '+h.destino);route.className='proxima-ruta';const cupos=p(h.cupos_ocupados+' lugares reservados · '+Math.max(0,h.cupos_totales-h.cupos_ocupados)+' disponibles');cupos.className='proxima-cupos';box.append(date,time,route,p('Encuentro: '+(h.punto_encuentro||'Consulta el punto de encuentro de tu salida.')),cupos);const list=tripPassengerList(h);list.id='proxima-pasajeros-'+h.id;list.children[0].textContent='Ver mis pasajeros';box.append(list);const button=document.createElement('button');button.textContent='Ajustar lugares disponibles';button.onclick=()=>{abrirVista('viajes');$('lista-viajes').open=true;$('lista-proximos').open=true;};box.append(button);}
 }
 const ids=new Set(data.reservaciones.filter(r=>r.estado==='confirmada').map(r=>String(r.id)));
 if(reservasVistas){const nuevas=confirmadas.filter(r=>!reservasVistas.has(String(r.id)));if(nuevas.length){const r=nuevas[0],trip=viajes.find(h=>h.id===r.horario_id);$('jornada-nueva-texto').textContent=r.nombre_pasajero+' · '+r.asientos+' lugar(es) · '+(trip?fechaVisible(trip.fecha)+' · '+horaVisible(trip.hora_salida):'Consulta tu salida');$('jornada-nueva').hidden=false;}}
 reservasVistas=ids;
}
