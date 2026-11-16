import {API,KEY,readLocal,saveLocal} from './r200.js';
const storageKey='r200-pasajero-sesion';
let refreshing=null;
export function mexicanPhone(value){
 const phone=String(value).trim();
 if(!/^\d{10}$/.test(phone))throw new Error('Escribe un teléfono mexicano de 10 dígitos.');
 return '+52'+phone;
}
async function request(path,body,token){
 let response;
 try{response=await fetch(API+'/auth/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
 catch{throw new Error('No pudimos confirmar la respuesta. Revisa tu conexión antes de reintentar.');}
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||'No se pudo verificar el teléfono.');
 return data;
}
function remember(data){
 if(!data?.access_token||!data?.refresh_token||!data?.user?.phone_confirmed_at)throw new Error('La sesión no tiene un teléfono confirmado.');
 const value={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+Number(data.expires_in||3600)*1000,phone:data.user.phone};
 if(!saveLocal(storageKey,value))throw new Error('Permite el almacenamiento del sitio para conservar tu sesión.');
 return value;
}
export async function sendCode(phone,captchaToken){
 if(!captchaToken)throw new Error('Completa la comprobación de seguridad.');
 await request('otp',{phone:mexicanPhone(phone),create_user:true,channel:'sms',gotrue_meta_security:{captcha_token:captchaToken}});
}
export async function verifyCode(phone,code){
 if(!/^\d{6}$/.test(code))throw new Error('Escribe los 6 dígitos del código.');
 return remember(await request('verify',{phone:mexicanPhone(phone),token:code,type:'sms'}));
}
export async function passengerSession(){
 const value=readLocal(storageKey,null);
 if(!value?.access_token||!value?.refresh_token)return null;
 if(Number(value.expires_at)>Date.now()+60000)return value;
 if(!refreshing)refreshing=request('token?grant_type=refresh_token',{refresh_token:value.refresh_token}).then(remember).catch(e=>{saveLocal(storageKey,null);throw e;}).finally(()=>{refreshing=null;});
 return refreshing;
}
export function samePhone(session,phone){return String(session?.phone||'').replace(/\D/g,'')==='52'+String(phone).trim();}
export async function logoutPassenger(){
 const value=readLocal(storageKey,null);saveLocal(storageKey,null);
 if(value?.access_token)await request('logout',{},value.access_token);
}
