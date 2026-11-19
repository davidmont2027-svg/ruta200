// Solo presentación: reservar.js conserva acceso, cupos, confirmación y boleto.
const $=id=>document.getElementById(id);
const panels=[...document.querySelectorAll('[data-booking-step]')];
const labels=['¿A dónde vamos?','Tus asientos','Elige tu salida','Datos del pasajero','Revisa y confirma'];
let step=0;
function show(){
 for(const panel of panels)panel.hidden=Number(panel.dataset.bookingStep)!==step;
 $('wizard-header').hidden=false;$('wizard-actions').hidden=false;
 $('wizard-label').textContent='Paso '+(step+1)+' de 5 · '+labels[step];
 document.querySelectorAll('.wizard-progress span').forEach((el,i)=>el.classList.toggle('active',i<=step));
 $('wizard-back').hidden=step===0;$('wizard-next').hidden=step===4;
 $('wizard-error').textContent='';
}
function map(){
 const origin=$('ruta').value==='ida'?'Tepic':'Mezcales',destination=origin==='Tepic'?'Mezcales':'Tepic';
 const from=encodeURIComponent(origin+', Nayarit, México'),to=encodeURIComponent(destination+', Nayarit, México');
 const frame=document.createElement('iframe');frame.title='Mapa de '+origin+' a '+destination;frame.src='https://maps.google.com/maps?saddr='+from+'&daddr='+to+'&output=embed';frame.loading='lazy';
 const link=document.createElement('a');link.textContent='Abrir recorrido en Google Maps ↗';link.href='https://www.google.com/maps/dir/?api=1&origin='+from+'&destination='+to+'&travelmode=driving';link.target='_blank';link.rel='noopener';
 $('booking-map').replaceChildren(frame,link);
}
$('wizard-back').onclick=()=>{if(step>0){step--;show();}};
$('wizard-next').onclick=()=>{
 let error='';
 if(step===0&&(!$('fecha').value||!$('fecha').checkValidity()))error='Elige una fecha válida para viajar.';
 if(step===2&&(!$('salida').value||$('continuar').disabled))error='Espera la disponibilidad y elige un horario con espacio para tu grupo.';
 if(step===3&&$('nombre').value.trim().length<2){error='Escribe el nombre del pasajero.';$('nombre').focus();}
 if(error){$('wizard-error').textContent=error;return;}
 if(step<4){step++;show();$('wizard-header').scrollIntoView({behavior:'smooth',block:'start'});}
};
$('ruta').addEventListener('change',map);
show();map();
