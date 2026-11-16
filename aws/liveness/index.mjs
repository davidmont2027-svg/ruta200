import {createHmac, timingSafeEqual} from 'node:crypto';

const REGION='us-east-1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify(body)});
let client;
async function awsRequest(action,input){
 const sdk=await import('@aws-sdk/client-rekognition');
 client??=new sdk.RekognitionClient({region:REGION,maxAttempts:2});
 const Command=action==='create'?sdk.CreateFaceLivenessSessionCommand:sdk.GetFaceLivenessSessionResultsCommand;
 return client.send(new Command(input),{abortSignal:AbortSignal.timeout(15000)});
}

// Solo el backend de Supabase debe llamar esta función y comprobar el dueño
// de la sesión. La clave compartida nunca se entrega al navegador.
export function makeHandler({request=awsRequest,env=process.env,now=Date.now}={}){
 return async event=>{
  const secret=env.LIVENESS_SHARED_SECRET;
  const configured=typeof secret==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(secret);
  if(!event?.requestContext){
   if(event?.accion!=='probar_configuracion')throw new Error('Solo se permite probar_configuracion desde la consola.');
   return {servicio:'ruta200-liveness',region:REGION,clave_configurada:configured,llamadas_aws:0};
  }
  if(event.requestContext.http?.method!=='POST')return reply(405,{error:'Método no permitido.'});
  if(!configured)return reply(503,{error:'Servicio no disponible.'});
  const headers=Object.fromEntries(Object.entries(event.headers??{}).map(([k,v])=>[k.toLowerCase(),v]));
  const timestamp=headers['x-ruta200-timestamp'];
  const signature=headers['x-ruta200-signature'];
  if(typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(Math.floor(now()/1000)-Number(timestamp))>60||typeof signature!=='string'||!/^([0-9a-f]{64})$/.test(signature))return reply(401,{error:'Solicitud no autorizada.'});
  if(typeof event.body!=='string'||event.body.length>6000)return reply(400,{error:'Solicitud inválida.'});
  const raw=event.isBase64Encoded?Buffer.from(event.body,'base64'):Buffer.from(event.body,'utf8');
  if(raw.byteLength>4096)return reply(400,{error:'Solicitud inválida.'});
  const expected=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return reply(401,{error:'Solicitud no autorizada.'});
  let body;try{body=JSON.parse(raw.toString('utf8'));}catch{return reply(400,{error:'Solicitud inválida.'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||!UUID.test(body.userId??''))return reply(400,{error:'Solicitud inválida.'});
  if(body.action==='create'){
   if(!UUID.test(body.requestId??''))return reply(400,{error:'Solicitud inválida.'});
   try{
    const data=await request('create',{ClientRequestToken:body.requestId,Settings:{AuditImagesLimit:0}});
    if(!UUID.test(data?.SessionId??''))return reply(502,{error:'No se pudo iniciar la prueba.'});
    return reply(200,{sessionId:data.SessionId,region:REGION});
   }catch{return reply(502,{error:'No se pudo iniciar la prueba.'});}
  }
  if(body.action==='result'){
   if(!UUID.test(body.sessionId??''))return reply(400,{error:'Solicitud inválida.'});
   try{
    const data=await request('result',{SessionId:body.sessionId});
    const statuses=['CREATED','IN_PROGRESS','SUCCEEDED','FAILED','EXPIRED'];
    if(!statuses.includes(data?.Status))return reply(502,{error:'No se pudo consultar el resultado.'});
    const confidence=data.Status==='SUCCEEDED'&&Number.isFinite(data.Confidence)&&data.Confidence>=0&&data.Confidence<=100?data.Confidence:null;
    if(data.Status==='SUCCEEDED'&&confidence===null)return reply(502,{error:'No se pudo consultar el resultado.'});
    // No transmitir imágenes, datos de auditoría ni respuestas completas del SDK.
    return reply(200,{status:data.Status,confidence});
   }catch{return reply(502,{error:'No se pudo consultar el resultado.'});}
  }
  return reply(400,{error:'Solicitud inválida.'});
 };
}
export const handler=makeHandler();
