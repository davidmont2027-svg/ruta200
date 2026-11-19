import {API,KEY} from './r200.js';
// El SDK usa únicamente memoria; la sesión de operador sigue en su almacenamiento original.
export function passkeyError(error){
 const code=error?.code||'',name=error?.name||'',text=error?.message||'';
 if(code==='passkey_disabled'||/passkeys?.*(disabled|not enabled)/i.test(text))return 'La huella aún está pendiente de activación en RUTA 200. Puedes entrar con tu contraseña.';
 if(name==='NotAllowedError'||/cancel|not allowed|timed out/i.test(text))return 'Se canceló o no se completó la comprobación. Puedes reintentar o usar tu contraseña.';
 if(/support|PublicKeyCredential/i.test(text))return 'Este navegador no admite llaves de acceso. Abre RUTA 200 en Chrome o usa tu contraseña.';
 if(/already|duplicate|excluded/i.test(text))return 'Ya existe una llave de acceso para esta cuenta en este dispositivo.';
 return 'No se pudo completar el acceso con huella. Reintenta o usa tu contraseña.';
}
export function passkeySession(session){
 if(!session?.access_token||!session?.refresh_token)throw Error('No se recibió una sesión verificable.');
 return {...session,expires_at:Number.isFinite(session.expires_at)?session.expires_at*1000:Date.now()+Number(session.expires_in||3600)*1000};
}
export function setupOperatorPasskeys({getSession,onSession,canRegister,canStart,getCaptcha,onBusy}){
 const $=id=>document.getElementById(id);let active=false,working=false;
 const supported=!!(globalThis.isSecureContext&&globalThis.PublicKeyCredential&&globalThis.navigator?.credentials);
 const write=(text)=>{$('estado-huella').textContent=text;$('estado-activar-huella').textContent=text;};
 function refresh(){for(const id of ['entrar-huella','activar-huella'])$(id).disabled=!active||working;}
 async function client(){const {createClient}=await import('./auth-assets/supabase-2.105.0.mjs');return createClient(API,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,experimental:{passkey:true}}});}
 async function check(){
  if(!supported){write('Usa Chrome en un celular compatible con bloqueo de pantalla, o entra con tu contraseña.');refresh();return;}
  try{const response=await fetch(API+'/auth/v1/settings',{headers:{apikey:KEY},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('settings');const settings=await response.json();active=settings.passkeys_enabled===true;write(active?'Usa la huella, rostro o PIN que permita tu celular. Para la primera vez, entra con contraseña y activa tu llave en el panel.':'Acceso con huella pendiente de activación. Por ahora utiliza tu contraseña.');}
  catch{write('No se pudo comprobar el acceso con huella. Puedes usar tu contraseña.');}
  refresh();
 }
 async function run(register){
  if(!active||working||!canStart())return;if(register&&!canRegister())return;
  working=true;onBusy(true);refresh();write(register?'Confirma en tu celular para crear tu llave de acceso…':'Confirma tu identidad en el celular…');
  try{
   const sdk=await client();
   if(register){const session=await getSession();if(!session)throw Error('Sin sesión');const linked=await sdk.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});if(linked.error)throw linked.error;
    const result=await sdk.auth.registerPasskey();if(result.error)throw result.error;write('Llave de acceso activada para esta cuenta. La próxima vez puedes tocar «Entrar con huella / PIN».');
   }else{const captchaToken=await getCaptcha();const result=await sdk.auth.signInWithPasskey({options:{captchaToken}});if(result.error)throw result.error;const session=passkeySession(result.data?.session);await onSession(session);write('Identidad verificada. Se aplican los mismos permisos de tu cuenta.');}
  }catch(error){write(passkeyError(error));}
  finally{working=false;onBusy(false);refresh();}
 }
 $('entrar-huella').onclick=()=>run(false);$('activar-huella').onclick=()=>run(true);
 refresh();void check();return {check};
}
