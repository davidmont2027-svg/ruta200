// Clave publicable: el acceso a datos lo controlan las funciones y permisos de Supabase.
export const API='https://iepawxzdkkpssmoppfpd.supabase.co';
export const KEY='sb_publishable_OemUgJw5cU1-kTJYah37XQ_EEpOlQ-o';
export async function rpc(name,body={},accessToken){
 const headers={'Content-Type':'application/json',apikey:KEY};
 if(accessToken)headers.Authorization='Bearer '+accessToken;
 let response;
 try{response=await fetch(API+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw new Error('No se pudo confirmar la respuesta. Revisa tu conexión y reintenta la misma solicitud.');}
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(data?.message||'No se pudo completar la solicitud.');
 return data;
}
export function today(origin='Tepic'){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:origin==='Tepic'?'America/Mazatlan':'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=t=>parts.find(p=>p.type===t).value;
 return get('year')+'-'+get('month')+'-'+get('day');
}
export function token(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
export function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
export function saveLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function ticketLink(key){return new URL('boleto.html#'+key,location.href).href;}
export function saveTicket(key,ticket){
 const tickets=readLocal('r200-tickets',[]).filter(t=>t.key!==key);
 saveLocal('r200-tickets',[{key,folio:ticket.folio,fecha:ticket.fecha},...tickets].slice(0,30));
}
export function message(el,text,error=false){el.textContent=text;el.style.color=error?'#ffb6b6':'#f3d58c';}
