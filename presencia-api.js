import {API,KEY} from './r200.js';
import {passengerSession} from './pasajero-auth.js';

export const CONSENT='r200-presencia-v1';
export const IDENTITY_POOL='us-east-1:21ac92d6-d274-4651-b3b5-e2424d6c3b3b';

export async function presenceRequest(body){
 const session=await passengerSession();
 if(!session)throw Error('Confirma tu teléfono para continuar.');
 let response;
 try{
  response=await fetch(API+'/functions/v1/ruta200-liveness',{
   method:'POST',headers:{'content-type':'application/json',apikey:KEY,authorization:'Bearer '+session.access_token},
   body:JSON.stringify(body),signal:AbortSignal.timeout(30000)
  });
 }catch{throw Error('No pudimos confirmar la respuesta. Revisa tu conexión antes de reintentar.');}
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error||'No pudimos completar la prueba.');
 if(typeof data?.verified!=='boolean')throw Error('Respuesta no válida. Intenta consultar de nuevo.');
 return data;
}

export async function guestCredentials(){
 async function call(action,body){
  const response=await fetch('https://cognito-identity.us-east-1.amazonaws.com/',{
   method:'POST',headers:{'content-type':'application/x-amz-json-1.1','x-amz-target':'AWSCognitoIdentityService.'+action},
   body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('No pudimos preparar la cámara. Revisa tu conexión e intenta de nuevo.');
  return response.json();
 }
 const identity=await call('GetId',{IdentityPoolId:IDENTITY_POOL});
 if(typeof identity.IdentityId!=='string')throw Error('No pudimos preparar la cámara.');
 const result=await call('GetCredentialsForIdentity',{IdentityId:identity.IdentityId});
 const c=result.Credentials;
 if(!c?.AccessKeyId||!c.SecretKey||!c.SessionToken||!Number.isFinite(c.Expiration)||c.Expiration*1000<Date.now()+60000)throw Error('El acceso temporal no está disponible.');
 // Solo memoria. Nunca almacenar ni registrar estas credenciales temporales.
 return {accessKeyId:c.AccessKeyId,secretAccessKey:c.SecretKey,sessionToken:c.SessionToken,expiration:new Date(c.Expiration*1000)};
}
