const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES=['CREATED','IN_PROGRESS','SUCCEEDED','FAILED','EXPIRED'];
const ORIGIN='https://davidmont2027-svg.github.io';
export const CONSENT='r200-presencia-v1';

async function smallJson(req){
 if(!req.body)throw new Error('Solicitud inválida.');
 const reader=req.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new Error('Solicitud demasiado grande.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Solicitud inválida.');
 return data;
}
export function makeHandler({getUser,rpc,lambda,ready=()=>true}){
 return async req=>{
  const origin=req.headers.get('origin');
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};
  if(origin===ORIGIN)Object.assign(headers,{'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'});
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&origin!==ORIGIN)return reply(403,{error:'Origen no permitido.'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'Método no permitido.'});
  const token=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!token)return reply(401,{error:'Confirma tu teléfono para continuar.'});
  let user;try{user=await getUser(token);}catch{return reply(401,{error:'Inicia sesión de nuevo.'});}
  if(!UUID.test(user?.id??'')||!user.phone_confirmed_at||!/^52\d{10}$/.test(String(user.phone??'').replace(/\D/g,'')))return reply(403,{error:'Confirma tu teléfono para continuar.'});
  let body;try{body=await smallJson(req);}catch{return reply(400,{error:'Solicitud inválida.'});}
  try{
   if(body.action==='status'){
    const result=await rpc('r200_presencia_estado',{},token);
    return reply(200,{verified:result?.presencia_confirmada===true});
   }
   if(body.action==='start'){
    if(body.consent!==CONSENT||!UUID.test(body.requestId??''))return reply(400,{error:'Confirma que aceptas la prueba de presencia.'});
    if(!ready())return reply(503,{error:'La prueba de presencia todavía no está disponible.'});
    const attempt=await rpc('r200_presencia_iniciar',{p_usuario:user.id,p_intento:body.requestId,p_consentimiento:CONSENT});
    if(attempt?.verificado===true)return reply(200,{verified:true});
    if(!UUID.test(attempt?.intento_id??''))throw Error('bad attempt');
    // La sesión/clave provienen del registro del servidor, no de sessionId del cliente.
    const created=await lambda({action:'create',userId:user.id,requestId:attempt.intento_id});
    if(!UUID.test(created?.sessionId??'')||created.region!=='us-east-1')throw Error('bad AWS response');
    const saved=await rpc('r200_presencia_asociar',{p_usuario:user.id,p_intento:attempt.intento_id,p_sesion:created.sessionId});
    return reply(200,{verified:false,attemptId:attempt.intento_id,sessionId:created.sessionId,region:'us-east-1',expiresAt:saved.vence_at});
   }
   if(body.action==='result'){
    if(!UUID.test(body.attemptId??''))return reply(400,{error:'Solicitud inválida.'});
    if(!ready())return reply(503,{error:'La prueba de presencia todavía no está disponible.'});
    const attempt=await rpc('r200_presencia_consultar',{p_usuario:user.id,p_intento:body.attemptId});
    if(!attempt?.puede_consultar)return reply(attempt?.estado==='aprobado'?200:202,{verified:attempt?.estado==='aprobado',status:attempt?.estado});
    if(!UUID.test(attempt.aws_session_id??''))throw Error('bad stored session');
    const result=await lambda({action:'result',userId:user.id,sessionId:attempt.aws_session_id});
    if(!STATES.includes(result?.status)||result.status==='SUCCEEDED'&&(!Number.isFinite(result.confidence)||result.confidence<0||result.confidence>100))throw Error('bad result');
    const saved=await rpc('r200_presencia_finalizar',{p_usuario:user.id,p_intento:body.attemptId,p_estado:result.status,p_confianza:result.status==='SUCCEEDED'?result.confidence:null});
    return reply(200,{verified:saved.verificado===true,status:saved.estado});
   }
   return reply(400,{error:'Solicitud inválida.'});
  }catch(e){
   // Solo mostrar mensajes previstos; nunca datos internos, JWT, claves o errores SDK.
   const messages=new Set(['Límite de intentos. Contacta a atención al cliente','Contacta a atención al cliente','La prueba venció. Inicia otra','La prueba no está disponible','Confirma tu teléfono','Prueba no encontrada','Límite de consultas. Contacta a atención al cliente']);
   return reply(messages.has(e?.message)?409:503,{error:messages.has(e?.message)?e.message:'No pudimos completar la prueba. Reintenta con la misma solicitud.'});
  }
 };
}

function checkedEndpoint(url,secret){
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||!/^[a-z0-9]+\.lambda-url\.us-east-1\.on\.aws$/.test(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||endpoint.port)throw Error('bad endpoint');
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(secret))throw Error('missing secret');
 return endpoint;
}
export function lambdaReady(options){try{checkedEndpoint(options.url,options.secret);return true;}catch{return false;}}
export async function signedLambda({url,secret,body,fetcher=fetch,now=Date.now}){
 const endpoint=checkedEndpoint(url,secret);
 const raw=JSON.stringify(body),timestamp=String(Math.floor(now()/1000));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw));
 const signature=Array.from(new Uint8Array(signed),x=>x.toString(16).padStart(2,'0')).join('');
 const response=await fetcher(endpoint.href,{method:'POST',headers:{'content-type':'application/json','x-ruta200-timestamp':timestamp,'x-ruta200-signature':signature},body:raw,redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('AWS request failed');
 return response.json();
}
