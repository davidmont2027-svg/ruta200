import {passengerSession,samePhone,logoutPassenger} from './pasajero-auth.js';
import {presenceRequest} from './presencia-api.js';
import {rpc,today,token,readLocal,saveLocal,saveTicket,ticketLink,message} from './r200.js?v=20261118-boleto2';
import {fotosVehiculos} from './vehiculos.js';
const $=id=>document.getElementById(id);
const route=$('ruta'),date=$('fecha'),departure=$('salida'),seats=$('asientos'),button=$('continuar'),status=$('estado-reserva');
let trips=[],loading=false,busy=false,version=0,accessReady=false;
const origin=()=>route.value==='ida'?'Tepic':'Mezcales';
async function checkAccess(){
 if(busy)return;busy=true;accessReady=false;button.disabled=true;$('contenido').classList.add('hidden');
 $('reintentar-acceso').hidden=true;$('reintentar-acceso').disabled=true;message($('estado-acceso'),'Comprobando tu acceso…');
 try{
  const session=await passengerSession();
  if(!session){location.replace('index.html');return;}
  const result=await presenceRequest({action:'status'});
  if(!result.verified){location.replace('index.html');return;}
  const phone=String(session.phone).replace(/\D/g,'').slice(2);
  if(!/^\d{10}$/.test(phone)){location.replace('index.html');return;}
  $('telefono').value=phone;accessReady=true;$('contenido').classList.remove('hidden');
  $('estado-acceso').hidden=true;$('reintentar-acceso').hidden=true;
 }catch(e){$('estado-acceso').hidden=false;$('reintentar-acceso').hidden=false;message($('estado-acceso'),e.message,true);}
 finally{busy=false;$('reintentar-acceso').disabled=false;}
 if(accessReady)await load();
}
$('reintentar-acceso').onclick=checkAccess;
$('cerrar-pasajero').onclick=async()=>{if(busy)return;busy=true;try{await logoutPassenger();}finally{location.replace('index.html');}};
function options(){
 const previous=departure.value;departure.replaceChildren();
 const groups=new Map();for(const t of trips){if(!groups.has(t.hora))groups.set(t.hora,[]);groups.get(t.hora).push(t);}
 for(const [hour,items] of groups){const o=document.createElement('option');o.value=hour;const available=items.reduce((a,t)=>a+t.disponibles,0);o.textContent=hour+' — '+available+' lugar(es) disponible(s)';o.disabled=!items.some(t=>t.disponibles>=Number(seats.value));departure.append(o);}
 if([...departure.options].some(o=>o.value===previous&&!o.disabled))departure.value=previous;
 else departure.value=[...departure.options].find(o=>!o.disabled)?.value||'';
 button.disabled=busy||loading||!departure.value;
 if(!trips.length)message(status,'No hay salidas publicadas para esta fecha y recorrido. Consulta otra fecha o atención al cliente.');
 else if(!departure.value)message(status,'No hay un vehículo con esa cantidad de lugares. Prueba con menos asientos u otra fecha.');
 else message(status,'Hora local de '+origin()+'. Disponibilidad sujeta a confirmación al reservar.');
 $('total').textContent='$'+Number(seats.value)*250+' MXN';
 renderTripCards();
}
function updateSummary(){
 const [y,m,d]=date.value.split('-');
 $('resumen-ruta').textContent=origin()+' → '+(origin()==='Tepic'?'Mezcales':'Tepic');
 $('resumen-fecha').textContent=y&&m&&d?d+'/'+m+'/'+y:'Por elegir';
 const hour=departure.value;
 if(loading)$('resumen-hora').textContent='Consultando…';
 else if(!hour)$('resumen-hora').textContent='Sin salida disponible';
 else{const [h,min]=hour.split(':');const n=Number(h);$('resumen-hora').textContent=(n%12||12)+(min==='00'?'':':'+min)+' '+(n<12?'a. m.':'p. m.')+' · '+origin();}
 $('resumen-nombre').textContent=$('nombre').value.trim()||'Escribe tu nombre';
 $('resumen-asientos').textContent=seats.value+(Number(seats.value)===1?' asiento':' asientos');
}
$('nombre').oninput=updateSummary;
function renderTripCards(){
 updateSummary();
 const list=$('carros-horario');list.replaceChildren();
 const selected=trips.filter(t=>!departure.value||t.hora===departure.value);
 for(const trip of selected){const card=document.createElement('article');card.className='carro-horario';
  const photo=fotosVehiculos[trip.vehiculo_id];if(photo){const img=document.createElement('img');img.src=photo.src;img.alt=photo.alt;card.append(img);}
  const title=document.createElement('strong');title.textContent=trip.conductor||'Conductor por confirmar';
  const car=document.createElement('p');car.textContent=trip.vehiculo||'Vehículo asignado';
  const details=document.createElement('p');details.textContent=trip.hora+' (hora de '+origin()+') · '+trip.disponibles+' lugar(es)';
  card.append(title,car,details);list.append(card);
 }
 if(selected.length){const note=document.createElement('p');note.className='muted';note.textContent='Elige tu horario. El carro se asigna al confirmar, según los lugares disponibles.';list.append(note);}
}
departure.onchange=renderTripCards;
async function load(){
 if(busy||!accessReady)return;const current=++version;loading=true;button.disabled=true;
 date.min=today(origin());if(!date.value||date.value<date.min)date.value=date.min;
 $('carros-horario').replaceChildren();
 message(status,'Consultando asientos disponibles…');updateSummary();
 try{const data=await rpc('r200_horarios',{p_fecha:date.value,p_origen:origin()});if(current!==version)return;trips=data;loading=false;options();}
 catch(e){if(current!==version)return;trips=[];departure.replaceChildren();$('carros-horario').replaceChildren();loading=false;updateSummary();message(status,e.message,true);}
}
date.value=today();date.min=date.value;date.onchange=load;route.onchange=load;seats.onchange=options;
$('actualizar').onclick=load;
function bookingMessage(text,error=false){message(status,text,error);message($('estado-confirmacion'),text,error);}
button.onclick=async()=>{
 if(busy||loading||!accessReady)return;
 const name=$('nombre'),phone=$('telefono');$('abrir-boleto').hidden=true;
 name.setCustomValidity(name.value.trim().length>=2?'':'Escribe el nombre completo.');
 phone.setCustomValidity(/^\d{10}$/.test(phone.value.trim())?'':'Escribe un teléfono de 10 dígitos.');
 if(!name.reportValidity()||!phone.reportValidity()||!departure.value)return;
 const amount=Number(seats.value);const candidates=trips.filter(t=>t.hora===departure.value&&t.disponibles>=amount);
 if(!Number.isInteger(amount)||amount<1||amount>4||!candidates.length){await load();return;}
 let session;busy=true;
 try{session=await passengerSession();}catch(e){busy=false;bookingMessage(e.message,true);return;}
 if(!session||!samePhone(session,phone.value)){busy=false;location.replace('index.html');return;}
 const signature=JSON.stringify([name.value.trim(),phone.value.trim(),date.value,origin(),departure.value,amount]);
 const pending=readLocal('r200-pendiente',null);
 // Tras una respuesta perdida, conservar también el horario original aunque cambien los cupos.
 const intent=pending?.signature===signature?pending:{signature,key:token(),horario:candidates[0].id};
 const body={p_horario:intent.horario,p_nombre:name.value.trim(),p_telefono:phone.value.trim(),p_asientos:amount,p_clave:intent.key};
 if(!saveLocal('r200-pendiente',intent)){busy=false;bookingMessage('Permite el almacenamiento de este sitio para conservar y recuperar tu boleto antes de reservar.',true);return;}
 busy=true;button.disabled=true;button.textContent='CONFIRMANDO…';
 for(const el of [name,phone,route,date,departure,seats])el.disabled=true;
 bookingMessage('Confirmando tu reserva. Espera la respuesta…');
 try{
  const ticket=await rpc('r200_reservar',body,session.access_token);
  if(!ticket||typeof ticket.folio!=='string'||typeof ticket.fecha!=='string')throw new Error('No se pudo leer la confirmación. Conservamos tu solicitud para revisarla.');
  const link=ticketLink(intent.key),fallback=$('abrir-boleto');fallback.href=link;fallback.hidden=false;
  let saved=false;try{saved=saveTicket(intent.key,ticket);}catch{}
  if(saved)saveLocal('r200-pendiente',null);
  bookingMessage('Reserva confirmada. Abriendo tu boleto… Si no abre, pulsa «Abrir mi boleto».');
  try{location.href=link;}catch{bookingMessage('Reserva confirmada. Pulsa «Abrir mi boleto» para verlo.');}
 }catch(e){bookingMessage(e.message+' Tu solicitud pendiente puede revisarse desde Mis boletos.',true);}
 finally{busy=false;for(const el of [name,phone,route,date,departure,seats])el.disabled=false;button.textContent='Confirmar mi reservación →';button.disabled=!departure.value;renderTickets();}
};
function renderTickets(){
 const list=$('mis-boletos');list.replaceChildren();const stored=readLocal('r200-tickets',[]);const saved=(Array.isArray(stored)?stored:[]).filter(t=>t&&/^[a-f0-9]{64}$/.test(t.key)&&typeof t.folio==='string'&&typeof t.fecha==='string');const pending=readLocal('r200-pendiente',null);
 if(pending&&/^[a-f0-9]{64}$/.test(pending.key)){const a=document.createElement('a');a.href=ticketLink(pending.key);a.textContent='Revisar mi solicitud pendiente';const p=document.createElement('p');p.append(a);list.append(p);}
 for(const t of saved){const a=document.createElement('a');a.href=ticketLink(t.key);a.textContent=t.fecha+' · Folio '+t.folio.slice(0,8).toUpperCase();const p=document.createElement('p');p.append(a);list.append(p);}
 if(!pending&&!saved.length)list.textContent='Aquí aparecerán los boletos guardados en este dispositivo.';
}
renderTickets();
setInterval(()=>{if(!document.hidden&&!$('contenido').classList.contains('hidden')&&!busy&&!loading)load();},30000);

await checkAccess();
