import {makeHandler,signedLambda,lambdaReady} from './core.mjs';

function envKey(mapName,legacyName){
 try{const map=JSON.parse(Deno.env.get(mapName)||'{}');if(typeof map.default==='string'&&map.default)return map.default;}catch{}
 return Deno.env.get(legacyName)||'';
}
const base=Deno.env.get('SUPABASE_URL');
const publicKey=envKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
const serverKey=envKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
async function request(path,key,token,body){
 if(!base||!key)throw Error('not configured');
 const headers={apikey:key,'content-type':'application/json'};
 if(token)headers.authorization='Bearer '+token;
 else if(key.startsWith('eyJ'))headers.authorization='Bearer '+key;
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const data=await response.json();
 if(!response.ok)throw Error(typeof data?.message==='string'?data.message:'Request failed');
 return data;
}
Deno.serve(makeHandler({
 ready:()=>lambdaReady({url:Deno.env.get('LIVENESS_LAMBDA_URL')||'',secret:Deno.env.get('LIVENESS_SHARED_SECRET')||''}),
 getUser:token=>request('/auth/v1/user',publicKey,token),
 rpc:(name,body,token)=>request('/rest/v1/rpc/'+name,token?publicKey:serverKey,token,body),
 lambda:body=>signedLambda({url:Deno.env.get('LIVENESS_LAMBDA_URL')||'',secret:Deno.env.get('LIVENESS_SHARED_SECRET')||'',body})
}));
