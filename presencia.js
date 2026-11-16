import {passengerSession,sendCode,verifyCode,logoutPassenger} from './pasajero-auth.js';
import {createCaptcha} from './captcha.js';
import {presenceRequest,guestCredentials,CONSENT} from './presencia-api.js';

const $=id=>document.getElementById(id);
const production=document.body?.dataset?.entry==='production';
const storageKey='r200-presencia-prueba';
let busy=false,captcha,phone='',attempt=null,unmount=null,timer=null,nextSend=0;
const say=(text,error=false)=>{$('estado').textContent=text;$('estado').style.color=error?'#ffb6b6':'#f3d58c';};
function screen(name){
 for(const panel of ['telefono','selfie','camara','listo'])$(panel+'-panel').hidden=panel!==name;
 $('paso-telefono').removeAttribute('aria-current');$('paso-selfie').removeAttribute('aria-current');
 if(name==='telefono')$('paso-telefono').setAttribute('aria-current','step');
 if(name==='selfie'||name==='camara')$('paso-selfie').setAttribute('aria-current','step');
 if(name==='telefono'&&!captcha){captcha=createCaptcha('captcha-presencia');captcha.ready.catch(e=>say(e.message,true));}
}
function saveAttempt(value){attempt=value;try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch{}}
function clearCamera(){if(unmount){unmount();unmount=null;}}
function holdConsumedAttempt(){
 clearTimeout(timer);
 const remaining=Date.parse(attempt?.expiresAt||'')-Date.now();
 const waiting=attempt?.used&&remaining>0;
 $('iniciar').disabled=busy||waiting;
 $('consultar').hidden=!attempt?.attemptId;
 if(waiting){
  say('La prueba anterior ya se inició. Consulta su resultado o espera hasta 3 minutos antes de iniciar otra.');
  timer=setTimeout(()=>{if(!busy){saveAttempt(null);$('iniciar').disabled=false;$('consultar').hidden=true;say('Ya puedes iniciar otra prueba.');}},remaining+1000);
 }
}
function approved(){clearCamera();clearTimeout(timer);saveAttempt(null);screen('listo');say('Verificación confirmada por el servidor.');if(production)location.replace('reservar.html');}
async function enterSelfie(){
 screen('selfie');$('cerrar').hidden=false;say('Comprobando tu verificación…');
 const status=await presenceRequest({action:'status'});
 if(status.verified){approved();return;}
 try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved?.phone===phone&&Date.parse(saved.expiresAt)>Date.now())attempt=saved;}catch{}
 say('Tu teléfono está confirmado. Ahora puedes hacer la prueba de presencia.');holdConsumedAttempt();
}
async function run(action){
 if(busy)return;busy=true;
 for(const id of ['enviar','confirmar','iniciar','consultar','cerrar'])$(id).disabled=true;
 try{await action();}catch(e){say(e.message||'No pudimos completar la prueba.',true);}
 finally{busy=false;for(const id of ['enviar','confirmar','consultar','cerrar'])$(id).disabled=false;$('iniciar').disabled=Boolean(attempt?.used&&Date.parse(attempt.expiresAt)>Date.now());}
}
$('enviar').onclick=()=>run(async()=>{
 if(Date.now()<nextSend)throw Error('Espera un minuto antes de solicitar otro código.');
 try{await sendCode($('telefono').value,await captcha.token());nextSend=Date.now()+60000;$('codigo-panel').hidden=false;say('Código enviado. Escríbelo abajo.');}
 finally{captcha.reset().catch(()=>{});}
});
$('confirmar').onclick=()=>run(async()=>{
 const session=await verifyCode($('telefono').value,$('codigo').value.trim());
 phone=session.phone;$('codigo').value='';await enterSelfie();
});
async function checkResult(){
 if(!attempt?.attemptId)throw Error('Primero inicia la prueba de presencia.');
 const result=await presenceRequest({action:'result',attemptId:attempt.attemptId});
 if(result.verified){approved();return true;}
 if(['rechazado','expirado'].includes(result.status)){
  clearCamera();saveAttempt(null);clearTimeout(timer);screen('selfie');$('consultar').hidden=true;
  const reasons={aws_failed:'La prueba de cámara no se completó correctamente. Hazla tú solo frente a la cámara y sigue todas las indicaciones.',confianza_insuficiente:'No se alcanzó la confianza necesaria para confirmar tu presencia. Mantén el rostro visible y sigue todas las indicaciones.'};
  const guidance={FACE_NOT_VISIBLE:'AWS no pudo ver tu rostro durante toda la prueba. Mantén el rostro dentro del óvalo.',FACE_OBSTRUCTION_DETECTED:'AWS detectó parte del rostro cubierta. Deja el rostro visible durante toda la prueba.',LOW_VIDEO_QUALITY_DETECTED:'AWS detectó calidad de video insuficiente. Limpia la cámara frontal y mantén el teléfono estable; si persiste, prueba otro celular.',FACE_NOT_ALIGNED:'AWS detectó el rostro desalineado. Coloca el teléfono frente a tu cara y sigue el óvalo.',EYES_CLOSED_DETECTED:'AWS detectó los ojos cerrados durante parte de la prueba. Mantén los ojos abiertos siguiendo las indicaciones.',LOW_LIGHTING_DETECTED:'AWS detectó iluminación insuficiente. Busca luz uniforme frente a tu rostro.',HIGH_LIGHTING_DETECTED:'AWS detectó demasiada luz. Evita el sol directo y los reflejos sobre tu rostro y teléfono.'};
  const detail=Array.isArray(result.feedback)?result.feedback.slice(0,7).map(code=>guidance[code]).filter(Boolean).join(' '):'';
  throw Error(result.status==='expirado'?'La prueba venció. Puedes iniciar otra si tienes intentos disponibles.':detail||reasons[result.reason]||'No pudimos confirmar tu presencia. Revisa las indicaciones antes de intentar otra vez.');
 }
 say('El resultado aún no está listo. Vuelve a consultar en unos segundos.');return false;
}
$('consultar').onclick=()=>run(checkResult);
$('iniciar').onclick=()=>run(async()=>{
 if(!$('consentimiento').checked)throw Error('Acepta la prueba de presencia para continuar.');
 if(attempt&&Date.parse(attempt.expiresAt)<=Date.now())saveAttempt(null);
 if(attempt?.used&&Date.parse(attempt.expiresAt)>Date.now())throw Error('Espera a que venza la prueba anterior o consulta su resultado.');
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Abre esta página en Chrome y permite el acceso a la cámara.');
 say('Preparando la cámara…');
 // Preparar recursos y permiso antes de consumir uno de los intentos del servidor.
 const [component,credentials]=await Promise.all([import('./presencia-assets/detector.js'),guestCredentials()]);
 let stream;
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});}
 catch{throw Error('Permite el acceso a la cámara en tu navegador para continuar.');}
 finally{stream?.getTracks().forEach(track=>track.stop());}
 const requestId=attempt?.requestId||crypto.randomUUID();
 saveAttempt({phone,requestId,expiresAt:attempt?.expiresAt||new Date(Date.now()+180000).toISOString(),used:false});
 const result=await presenceRequest({action:'start',requestId,consent:CONSENT});
 if(result.verified){approved();return;}
 if(!result.sessionId||!result.attemptId||!Number.isFinite(Date.parse(result.expiresAt)))throw Error('La prueba todavía no está lista. Reintenta la misma solicitud.');
 saveAttempt({phone,requestId,attemptId:result.attemptId,expiresAt:result.expiresAt,used:true});
 const failed=()=>{clearCamera();screen('selfie');holdConsumedAttempt();};
 screen('camara');say('Sigue las indicaciones de la cámara.');
 unmount=component.mountDetector($('detector'),{
  sessionId:result.sessionId,credentials,
  onAnalysisComplete:async()=>{clearCamera();screen('selfie');say('Comprobando el resultado…');await run(checkResult);holdConsumedAttempt();},
  onError:failed,onCancel:failed
 });
});
$('cerrar').onclick=()=>run(async()=>{
 clearCamera();clearTimeout(timer);saveAttempt(null);
 try{await logoutPassenger();}finally{phone='';screen('telefono');$('cerrar').hidden=true;$('telefono').value='';$('codigo').value='';$('codigo-panel').hidden=true;say('Sesión cerrada en este dispositivo.');}
});
window.addEventListener('pagehide',clearCamera);
try{
 const session=await passengerSession();
 if(session){phone=session.phone;await enterSelfie();}
 else{screen('telefono');say('Empieza confirmando tu número.');}
}catch(e){screen(phone?'selfie':'telefono');say(e.message,true);}
