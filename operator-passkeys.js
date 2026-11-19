import {API,KEY} from './r200.js';
// Sin almacenamiento compartido con pasajeros; la sesión de operador sigue en admin.js.
export function passkeyError(error){
 const cause=error?.cause||error;const code=error?.code||'',name=cause?.name||error?.name||'',text=error?.message||'';
 if(code==='passkey_disabled'||/passkeys?.*(disabled|not enabled)/i.test(text))return 'La huella aún está pendiente de activación. Puedes entrar con tu contraseña.';
 if(/captcha|comprobación|seguridad/i.test(text))return 'Completa o repite la comprobación de seguridad y vuelve a tocar el botón de huella.';
 if(name==='InvalidStateError'||/already|duplicate|excluded|credentials already registered/i.test(text))return 'La llave ya está registrada en este celular. No necesitas activarla otra vez: cierra sesión y usa «Entrar con huella / PIN» y después «Continuar con huella / PIN».';
 if(name==='SecurityError'||/relying party|origin mismatch|invalid.*domain/i.test(text))return 'La comprobación del sitio falló. El detalle de abajo permite revisar la causa.';
 if(name==='NotAllowedError'||/cancel|not allowed|timed out|empty credential/i.test(text))return 'El celular no entregó una llave de acceso. Abre RUTA 200 en Chrome y elige la cuenta donde la guardaste. También puedes usar tu contraseña.';
 if(name==='AbortError')return 'La comprobación se interrumpió. Toca de nuevo para volver a intentarlo.';
 if(/support|PublicKeyCredential/i.test(text))return 'Este navegador no admite llaves de acceso. Abre RUTA 200 en Chrome o usa tu contraseña.';
 const detail=String(code||name||'sin_codigo').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
 return 'No se completó la comprobación con el celular. Puedes usar tu contraseña. Referencia: '+detail+'.';
}
export function passkeyDiagnostic(error,stage,rp){
 const cause=error?.cause||error;
 const name=String(cause?.name||error?.name||'Error').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);
 const code=String(error?.code||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
 const domain=String(rp||'sin dato').replace(/[^a-zA-Z0-9. -]/g,'').slice(0,120);
 const site=globalThis.location?.hostname||'sin dato';
 // Solo errores estándar del navegador; nunca se muestran respuestas, desafíos ni tokens.
 const standard=['SecurityError','TypeError','EncodingError','InvalidStateError','NotSupportedError','NotAllowedError'];
 const message=standard.includes(name)?String(cause?.message||error?.message||'').replace(/[A-Za-z0-9_-]{45,}/g,'[omitido]').replace(/[^\S\r\n]+/g,' ').slice(0,320):'';
 return 'Detalle: '+stage+' · '+name+(code?' · '+code:'')+(message?'\n'+message:'')+'\nSitio: '+site+'\nDominio de la llave: '+domain;
}
export function passkeySession(session){
 if(!session?.access_token||!session?.refresh_token)throw Error('No se recibió una sesión verificable.');
 return {...session,expires_at:Number.isFinite(session.expires_at)?session.expires_at*1000:Date.now()+Number(session.expires_in||3600)*1000};
}
function decode(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function encode(buffer){return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function credentialOptions(options,register){
 if(register&&typeof globalThis.PublicKeyCredential?.parseCreationOptionsFromJSON==='function')return PublicKeyCredential.parseCreationOptionsFromJSON(options);
 if(!register&&typeof globalThis.PublicKeyCredential?.parseRequestOptionsFromJSON==='function')return PublicKeyCredential.parseRequestOptionsFromJSON(options);
 const result={...options,challenge:decode(options.challenge)};
 if(register)result.user={...options.user,id:decode(options.user.id)};
 for(const field of ['allowCredentials','excludeCredentials'])if(options[field])result[field]=options[field].map(c=>({...c,id:decode(c.id)}));
 return result;
}
export function credentialJSON(credential){
 if(typeof credential.toJSON==='function')return credential.toJSON();
 const response=credential.response,body={clientDataJSON:encode(response.clientDataJSON)};
 if(response.attestationObject)body.attestationObject=encode(response.attestationObject);
 if(response.authenticatorData)body.authenticatorData=encode(response.authenticatorData);
 if(response.signature)body.signature=encode(response.signature);
 if('userHandle' in response)body.userHandle=response.userHandle?encode(response.userHandle):null;
 if(typeof response.getTransports==='function')body.transports=response.getTransports();
 return {id:credential.id,rawId:encode(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment||null,response:body,clientExtensionResults:credential.getClientExtensionResults?.()||{}};
}
export function setupOperatorPasskeys({getSession,onSession,canRegister,canStart,getCaptcha,onBusy,onDiagnostic}){
 const $=id=>document.getElementById(id);let active=false,working=false,pending=null,lastRP='';
 const supported=!!(globalThis.isSecureContext&&globalThis.PublicKeyCredential&&typeof globalThis.navigator?.credentials?.create==='function'&&typeof globalThis.navigator?.credentials?.get==='function');
 const write=text=>{$('estado-huella').textContent=text;$('estado-activar-huella').textContent=text;};
 const report=(error,stage)=>{
  write(passkeyError(error)+'\n\n'+passkeyDiagnostic(error,stage,lastRP));
  const cause=error?.cause||error,name=String(cause?.name||error?.name||'Error').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);
  const standard=['SecurityError','TypeError','EncodingError','InvalidStateError','NotSupportedError','NotAllowedError'];
  const message=standard.includes(name)?String(cause?.message||error?.message||'').replace(/[A-Za-z0-9_-]{45,}/g,'[omitido]').slice(0,320):'';
  if(onDiagnostic)void Promise.resolve(onDiagnostic({p_etapa:stage,p_nombre:name,p_codigo:String(error?.code||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),p_mensaje:message,p_sitio:String(globalThis.location?.hostname||'').slice(0,120),p_dominio:String(lastRP||'').replace(/[^a-zA-Z0-9.-]/g,'').slice(0,120)})).catch(()=>{});
 };
 function refresh(){for(const id of ['entrar-huella','activar-huella'])$(id).disabled=!active||working;$('entrar-huella').textContent=pending&&!pending.register?'Continuar con huella / PIN':'Entrar con huella / PIN';$('activar-huella').textContent=pending?.register?'Confirmar en este celular':'Activar en este celular';}
 async function client(){const {createClient}=await import('./auth-assets/supabase-2.105.0.mjs');return createClient(API,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,experimental:{passkey:true}}});}
 async function check(){
  if(!supported){write('Usa Chrome en un celular compatible con bloqueo de pantalla, o entra con tu contraseña.');refresh();return;}
  try{const response=await fetch(API+'/auth/v1/settings',{headers:{apikey:KEY},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('settings');active=(await response.json()).passkeys_enabled===true;write(active?'Para la primera vez, entra con contraseña y activa tu llave en el panel.':'Acceso con huella pendiente de activación. Por ahora utiliza tu contraseña.');}catch{write('No se pudo comprobar el acceso con huella. Puedes usar tu contraseña.');}refresh();
 }
 async function prepare(register){
  working=true;onBusy(true);refresh();write('Preparando comprobación segura…');
  let stage='cargar modulo';try{const sdk=await client();let result;stage='preparar sesion';
   if(register){const session=await getSession();if(!session)throw Error('Sin sesión');const linked=await sdk.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});if(linked.error)throw linked.error;stage='obtener registro';result=await sdk.auth.passkey.startRegistration();}
   else {stage='comprobacion de seguridad';const captchaToken=await getCaptcha();stage='obtener acceso';result=await sdk.auth.passkey.startAuthentication({options:{captchaToken}});}
   if(result.error)throw result.error;if(!result.data?.challenge_id||!result.data?.options)throw Error('Respuesta sin desafío');
   stage='leer opciones';lastRP=result.data.options.rp?.id||result.data.options.rpId||'';
   pending={register,sdk,id:result.data.challenge_id,options:credentialOptions(result.data.options,register),expires:Date.now()+120000};
   write(register?'Ya está listo. Toca «Confirmar en este celular» para registrar tu llave.':'Ya está listo. Toca «Continuar con huella / PIN» para abrir la comprobación del celular.');
  }catch(error){pending=null;report(error,stage);}finally{working=false;onBusy(false);refresh();}
 }
 // Esta función no espera red ni carga de módulos antes de invocar el selector del teléfono.
 function run(register){
  if(!active||working||!canStart()||(register&&!canRegister()))return Promise.resolve();
  if(!pending||pending.register!==register||Date.now()>pending.expires){pending=null;return prepare(register);}
  const current=pending;pending=null;working=true;onBusy(true);refresh();write('Confirma la huella, rostro o PIN en el celular…');
  let stage='abrir selector';let operation;try{operation=register?navigator.credentials.create({publicKey:current.options}):navigator.credentials.get({publicKey:current.options});}catch(error){operation=Promise.reject(error);}
  return Promise.resolve(operation).then(async credential=>{
   if(!credential)throw Error('Empty credential response');const body={challengeId:current.id,credential:credentialJSON(credential)};
   stage='confirmar con servidor';const result=register?await current.sdk.auth.passkey.verifyRegistration(body):await current.sdk.auth.passkey.verifyAuthentication(body);if(result.error)throw result.error;
   if(register)write('Llave registrada y confirmada por RUTA 200. La próxima vez puedes entrar con huella / PIN.');
   else{await onSession(passkeySession(result.data?.session));write('Identidad verificada. Se aplican los permisos de tu cuenta.');}
  }).catch(error=>report(error,stage)).finally(()=>{working=false;onBusy(false);refresh();});
 }
 $('entrar-huella').onclick=()=>run(false);$('activar-huella').onclick=()=>run(true);refresh();void check();return {check};
}
