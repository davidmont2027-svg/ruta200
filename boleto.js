import {rpc,saveTicket,ticketLink,message} from './r200.js';
import {fotosVehiculos} from './vehiculos.js';
const $=id=>document.getElementById(id),key=location.hash.slice(1);let ticket,busy=false;
function render(t){
 ticket=t;$('encuentro-boleto').hidden=!t.punto_encuentro;$('encuentro-boleto').textContent=t.punto_encuentro?'Punto de encuentro: '+t.punto_encuentro:'';const foto=fotosVehiculos[t.vehiculo_id];const img=$('foto-carro');img.hidden=!foto;if(foto){img.src=foto.src;img.alt=foto.alt;}$('conductor-boleto').textContent='Conductor: '+(t.conductor||'Por confirmar');
 for(const [id,value] of Object.entries({folio:'R200-'+t.folio.toUpperCase(),fecha:t.fecha,hora:t.hora+' (hora de '+t.origen+')',origen:t.origen,destino:t.destino,asientos:t.asientos+' lugar(es)',pasajero:t.pasajero,telefono:t.telefono,vehiculo:t.vehiculo,total:'$'+t.total+' MXN'}))$(id).textContent=value;
 $('folio').style.fontSize='15px';$('folio').style.overflowWrap='anywhere';
 $('confirmacion').textContent=t.estado==='confirmada'?'🎟️ RESERVACIÓN CONFIRMADA':t.estado==='cancelada'?'RESERVACIÓN CANCELADA':'AUSENCIA REGISTRADA';
 $('detalle-estado').textContent='Estado verificado en RUTA 200 · Pago al abordar';
 $('cancelar').hidden=t.estado!=='confirmada';$('cancelar').disabled=Date.now()>new Date(t.cancelable_hasta).getTime();
 $('limite').textContent='Puedes cancelar hasta el '+new Intl.DateTimeFormat('es-MX',{timeZone:t.origen==='Tepic'?'America/Mazatlan':'America/Mexico_City',dateStyle:'short',timeStyle:'short'}).format(new Date(t.cancelable_hasta))+' (hora de '+t.origen+').';
 $('compartir').disabled=false;saveTicket(key,t);
 message($('estado-boleto'),'Guarda este enlace privado: permite consultar y cancelar tu reserva. Compártelo solo con personas de confianza.');
}
async function load(){
 if(!/^[a-f0-9]{64}$/.test(key)){message($('estado-boleto'),'Este enlace no contiene una reservación verificable. Vuelve al inicio para reservar.',true);return;}
 try{render(await rpc('r200_boleto',{p_clave:key}));}catch(e){message($('estado-boleto'),e.message+' Si acabas de reservar y hubo un problema de conexión, pulsa Actualizar boleto.',true);}
}
$('actualizar-boleto').onclick=load;
$('cancelar').onclick=async()=>{if(busy||!ticket||!confirm('¿Cancelar esta reservación y liberar tus '+ticket.asientos+' asiento(s)?'))return;busy=true;$('cancelar').disabled=true;try{render(await rpc('r200_cancelar',{p_clave:key}));}catch(e){message($('estado-boleto'),e.message,true);}finally{busy=false;}};
$('compartir').onclick=()=>{if(!ticket)return;const text='🎟️ RUTA 200\n'+ticket.pasajero+'\n'+ticket.origen+' → '+ticket.destino+'\n'+ticket.fecha+' · '+ticket.hora+' (hora de '+ticket.origen+')\n'+ticket.asientos+' asiento(s) · $'+ticket.total+' MXN\nEstado: '+ticket.estado+(ticket.punto_encuentro?'\nEncuentro: '+ticket.punto_encuentro:'')+'\nVehículo: '+ticket.vehiculo+'\nEnlace privado: '+ticketLink(key);window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');};
load();
