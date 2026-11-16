// Clave pública del widget; la clave secreta se guarda únicamente en Supabase.
export const SITE_KEY='0x4AAAAAAGDVlu-KNWklQBqL';
let scriptReady;
function api(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(!scriptReady)scriptReady=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timer=setTimeout(()=>reject(new Error('No cargó la comprobación de seguridad. Recarga la página.')),20000);
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;script.defer=true;
  script.onload=()=>{clearTimeout(timer);window.turnstile?resolve(window.turnstile):reject(new Error('No se pudo iniciar la comprobación de seguridad.'));};
  script.onerror=()=>{clearTimeout(timer);reject(new Error('No cargó la comprobación de seguridad. Revisa tu conexión y recarga.'));};
  document.head.append(script);
 });
 return scriptReady;
}
export function createCaptcha(container){
 let widget=null,current='',error='';
 const ready=api().then(turnstile=>{
  widget=turnstile.render(document.getElementById(container),{
   sitekey:SITE_KEY,theme:'auto',size:'flexible',language:'es','response-field':false,
   callback:token=>{current=token;error='';},
   'expired-callback':()=>{current='';error='La comprobación de seguridad venció. Espera a que se renueve.';},
   'timeout-callback':()=>{current='';error='Repite la comprobación de seguridad.';},
   'error-callback':()=>{current='';error='No se pudo comprobar la seguridad. Revisa tu conexión y reintenta.';return true;}
  });
  return turnstile;
 });
 // Conservar el error para el envío, sin una promesa rechazada sin observador.
 ready.catch(()=>{});
 return {
  ready,
  async token(){
   const turnstile=await ready;
   if(error||!current||turnstile.isExpired(widget))throw new Error(error||'Completa la comprobación de seguridad antes de continuar.');
   return current;
  },
  async reset(){const turnstile=await ready;current='';error='';turnstile.reset(widget);}
 };
}
