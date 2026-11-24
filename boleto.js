import {rpc,saveTicket,ticketLink,message} from './r200.js';
import {fotosVehiculos} from './vehiculos.js';
const $=id=>document.getElementById(id),key=location.hash.slice(1);let ticket,busy=false;
function render(t){
 ticket=t;$('encuentro-boleto').hidden=!t.punto_encuentro;$('encuentro-boleto').textContent=t.punto_encuentro?'Punto de encuentro: '+t.punto_encuentro:'';const foto=fotosVehiculos[t.vehiculo_id];const img=$('foto-carro');img.hidden=!foto;if(foto){img.src=foto.src;img.alt=foto.alt;}$('conductor-boleto').textContent='Conductor: '+(t.conductor||'Por confirmar');
 for(const [id,value] of Object.entries({folio:'R200-'+t.folio.toUpperCase(),fecha:t.fecha,hora:t.hora+' (hora de '+t.origen+')',origen:t.origen,destino:t.destino,asientos:t.asientos+' lugar(es)',pasajero:t.pasajero,telefono:t.telefono,vehiculo:t.vehiculo,total:'$'+t.total+' MXN'}))$(id).textContent=value;
 $('folio').style.fontSize='15px';$('folio').style.overflowWrap='anywhere';
 $('confirmacion').textContent=t.estado==='confirmada'?'🎟️ RESERVACIÓN CONFIRMADA':t.estado==='cancelada'?(t.viaje_cancelado?'VIAJE CANCELADO':'RESERVACIÓN CANCELADA'):'AUSENCIA REGISTRADA';
 $('detalle-estado').textContent=t.estado==='cancelada'?(t.viaje_cancelado?'El conductor canceló este viaje.':t.cancelada_por_conductor?'El conductor canceló tu reservación.':'Reservación cancelada.')+(t.motivo_cancelacion?' Motivo: '+t.motivo_cancelacion:''):'Estado verificado en RUTA 200 · Pago al abordar';
 $('cancelar').hidden=t.estado!=='confirmada';$('cancelar').disabled=Date.now()>new Date(t.cancelable_hasta).getTime();
 $('limite').textContent='Puedes cancelar hasta el '+new Intl.DateTimeFormat('es-MX',{timeZone:t.origen==='Tepic'?'America/Mazatlan':'America/Mexico_City',dateStyle:'short',timeStyle:'short'}).format(new Date(t.cancelable_hasta))+' (hora de '+t.origen+').';
 $('descargar-boleto').disabled=false;
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
$('descargar-boleto').onclick=()=>{
 if(!ticket)return;
 try{
  const canvas=document.createElement('canvas');
  canvas.width=840;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas indisponible');
  const lines=[];
  function add(value,size,color,bold=false){
   const font=(bold?'bold ':'')+size+'px Arial';
   ctx.font=font;
   let line='';
   for(const word of String(value).split(/\s+/)){
    if(line&&ctx.measureText(line+' '+word).width>744){lines.push({line,font,color,size});line='';}
    if(line)line+=' ';
    for(const char of word){
     if(ctx.measureText(line+char).width>744){lines.push({line,font,color,size});line='';}
     line+=char;
    }
   }
   if(line)lines.push({line,font,color,size});
  }
  const gold='#ffd36b',white='#ffffff';
  add('RUTA 200',52,gold,true);
  add('Kilómetros que nos acercan',28,white);
  add($('confirmacion').textContent.replace('🎟️ ',''),34,gold,true);
  for(const [label,id] of [['Folio','folio'],['Fecha','fecha'],['Salida','hora'],['Origen','origen'],['Destino','destino'],['Asientos','asientos'],['Pasajero','pasajero'],['Teléfono','telefono'],['Vehículo','vehiculo'],['','conductor-boleto'],['','encuentro-boleto'],['Total','total']]){
   const value=$(id).textContent;
   if(value)add(label?label+': '+value:value,30,white);
  }
  if(ticket.estado==='confirmada')add('Pago al abordar',28,gold);
  else add($('detalle-estado').textContent,26,white);
  add('Consulta tu boleto en línea para ver cambios.',24,'#b9cee2');
  const photo=$('foto-carro');
  const hasPhoto=!photo.hidden&&photo.complete&&photo.naturalWidth>0&&photo.naturalHeight>0;
  const photoHeight=hasPhoto?Math.min(420,744*photo.naturalHeight/photo.naturalWidth):0;
  canvas.height=96+lines.reduce((height,row)=>height+row.size+14,0)+(hasPhoto?photoHeight+16:0);
  ctx.fillStyle='#061426';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle=gold;ctx.lineWidth=4;ctx.strokeRect(14,14,812,canvas.height-28);
  let y=48;
  ctx.textBaseline='top';
  for(const row of lines){ctx.font=row.font;ctx.fillStyle=row.color;ctx.fillText(row.line,48,y);y+=row.size+14;}
  if(hasPhoto){const width=photoHeight*photo.naturalWidth/photo.naturalHeight;ctx.drawImage(photo,(840-width)/2,y+8,width,photoHeight);}
  const link=document.createElement('a');
  link.href=canvas.toDataURL('image/png');
  link.download='Boleto-RUTA200-'+ticket.folio.replace(/[^a-z0-9-]/gi,'')+'.png';
  link.click();
  message($('estado-descarga'),'Revisa las descargas de tu celular.');
 }catch{
  message($('estado-descarga'),'No pudimos guardar la imagen. Puedes intentar de nuevo o tomar una captura.',true);
 }
};
load();

setInterval(()=>{if(ticket?.estado==='confirmada'&&!busy&&!document.hidden)void load();},20000);

setInterval(()=>{if(ticket?.estado==='confirmada'&&!busy&&!document.hidden)void load();},20000);
