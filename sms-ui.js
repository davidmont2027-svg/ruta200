import {sendCode,verifyCode,passengerSession,samePhone,logoutPassenger} from './pasajero-auth.js';
import {message} from './r200.js';
export function setupSms(){
 const $=id=>document.getElementById(id),phone=$('telefono'),send=$('enviar-sms'),verify=$('verificar-sms'),code=$('codigo-sms'),status=$('estado-sms');
 let busy=false,nextSend=0;
 send.onclick=async()=>{
  if(busy)return;
  if(Date.now()<nextSend){message(status,'Espera un minuto antes de solicitar otro código.',true);return;}
  busy=true;send.disabled=true;phone.disabled=true;
  try{await sendCode(phone.value);nextSend=Date.now()+60000;message(status,'Código enviado. Escríbelo abajo. No lo compartas.');}
  catch(e){message(status,e.message,true);}
  finally{busy=false;send.disabled=false;phone.disabled=false;}
 };
 verify.onclick=async()=>{
  if(busy)return;busy=true;verify.disabled=true;phone.disabled=true;
  try{await verifyCode(phone.value,code.value.trim());code.value='';message(status,'Teléfono confirmado. Ya puedes reservar.');}
  catch(e){message(status,e.message,true);}
  finally{busy=false;verify.disabled=false;phone.disabled=false;}
 };
 phone.oninput=()=>message(status,'Si cambias el teléfono, debes confirmar el nuevo número.');
 $('cerrar-pasajero').onclick=async()=>{try{await logoutPassenger();message(status,'Sesión cerrada.');}catch{message(status,'Sesión cerrada en este dispositivo.');}};
 passengerSession().then(s=>{if(s){const number=String(s.phone).replace(/\D/g,'').slice(2);if(samePhone(s,number)){phone.value=number;message(status,'Sesión de pasajero conservada.');}}}).catch(e=>message(status,e.message,true));
}
