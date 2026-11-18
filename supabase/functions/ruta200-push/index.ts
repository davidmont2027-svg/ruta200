import webpush from 'npm:web-push@3.6.7';
const API=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGIN='https://davidmont2027-svg.github.io';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
async function rpc(name:string,body:unknown={},bearer=SERVICE){
 const response=await fetch(API+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE,Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.message||'No se pudo completar la operación');return data;
}
async function keys(){
 let value=await rpc('r200_push_claves');
 if(!value){const pair=webpush.generateVAPIDKeys();value=await rpc('r200_push_claves',{p_public:pair.publicKey,p_private:pair.privateKey});}
 return value;
}
function endpointAllowed(endpoint:unknown){
 if(typeof endpoint!=='string'||endpoint.length>2048)return false;
 try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname);}catch{return false;}
}
async function send(destinos:any[],eventId:string,test=false){
 const key=await keys();const expired:string[]=[];let failed=0,sent=0;
 await Promise.all(destinos.slice(0,5).map(async sub=>{
  if(!endpointAllowed(sub.endpoint)){expired.push(sub.id);return;}
  try{
   await webpush.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify({title:test?'Avisos de RUTA 200 activados':'Nueva reservación · RUTA 200',body:test?'Este es un aviso de prueba.':'Tienes una nueva reservación. Abre tu panel para ver al pasajero.',tag:'r200-'+eventId}),{vapidDetails:{subject:ORIGIN+'/ruta200/',publicKey:key.publicKey,privateKey:key.privateKey},TTL:3600,urgency:'high',timeout:10000});sent++;
  }catch(error:any){if(error?.statusCode===404||error?.statusCode===410)expired.push(sub.id);else failed++;}
 }));return {expired,failed,sent};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'Método no permitido'},405);
 if(Number(req.headers.get('content-length')||0)>10000)return json({error:'Solicitud demasiado grande'},413);
 let body:any;try{const raw=await req.text();if(raw.length>10000)return json({error:'Solicitud demasiado grande'},413);body=JSON.parse(raw);}catch{return json({error:'Solicitud inválida'},400);}
 try{
  if(body.action==='dispatch'){
   // Database hook authenticates with a single-event, random 256-bit capability.
   if(!/^[0-9a-f-]{36}$/i.test(body.event_id||'')||!/^[0-9a-f]{64}$/.test(body.token||''))return json({error:'No autorizado'},401);
   const event=await rpc('r200_push_tomar',{p_id:body.event_id,p_token:body.token});
   if(!event)return json({error:'Evento no disponible'},403);if(event.skip){await keys();return json({ok:true,omitted:true});}
   const result=await send(event.destinos,event.eventId);
   await rpc('r200_push_completar',{p_id:body.event_id,p_token:body.token,p_exito:result.failed===0,p_caducados:result.expired});
   return json({ok:result.failed===0,sent:result.sent},result.failed?503:200);
  }
  if(req.headers.get('origin')!==ORIGIN)return json({error:'Origen no permitido'},403);
  const bearer=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!bearer)return json({error:'Inicia sesión'},401);
  const response=await fetch(API+'/auth/v1/user',{headers:{apikey:SERVICE,Authorization:'Bearer '+bearer},signal:AbortSignal.timeout(10000)});
  const user=await response.json().catch(()=>null);if(!response.ok||!user?.id)return json({error:'Sesión no válida'},401);
  if(body.action==='unsubscribe'){
   await rpc('r200_push_quitar',{p_endpoint:body.endpoint||''},bearer);return json({ok:true});
  }
  const state=await rpc('r200_push_estado',{p_endpoint:body.endpoint||null},bearer);
  if(body.action==='config')return json({publicKey:(await keys()).publicKey,active:state.activo});
  if(body.action==='subscribe'){
   const sub=body.subscription;if(!sub||!endpointAllowed(sub.endpoint))return json({error:'Este servicio de notificaciones no está admitido.'},400);
   await rpc('r200_push_guardar',{p_endpoint:sub.endpoint,p_p256dh:sub.keys?.p256dh,p_auth:sub.keys?.auth},bearer);return json({ok:true});
  }
  if(body.action==='test'){
   // Test only the requesting browser; never fan out to other devices or accounts.
   const destinations=(await rpc('r200_push_destinos',{p_usuario:user.id})).filter((s:any)=>s.endpoint===body.endpoint);
   if(!destinations.length)return json({error:'Activa primero los avisos en este celular.'},400);
   const result=await send(destinations,crypto.randomUUID(),true);
   if(result.expired.length)await rpc('r200_push_caducados',{p_ids:result.expired});
   return json(result.sent?{ok:true}:{error:'No se pudo enviar la prueba. Vuelve a activar los avisos.'},result.sent?200:503);
  }
  return json({error:'Operación no válida'},400);
 }catch{return json({error:'No se pudo completar la operación. Revisa tu sesión e inténtalo de nuevo.'},503);}
});
