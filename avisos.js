import {API,KEY} from './r200.js';
export function setupDriverNotifications({getToken,onReservation}){
 const $=id=>document.getElementById(id),sound=$('activar-sonido'),activate=$('activar-avisos'),test=$('probar-avisos'),disable=$('desactivar-avisos'),status=$('estado-avisos');
 let started=false,registration=null,active=false,working=false,audio=null,soundOn=false,seen=null;
 const supported=typeof navigator!=='undefined'&&'serviceWorker' in navigator&&typeof window!=='undefined'&&'PushManager' in window&&'Notification' in window;
 const say=text=>{status.textContent=text;};
 const controls=()=>{activate.disabled=working||!supported;test.disabled=working||!active;disable.disabled=working||!active;};

 function ding(){
  if(!soundOn||!audio||audio.state!=='running')return;
  try{for(const [offset,frequency] of Array.from({length:8},(_,i)=>[i*.38,i%2?1174:880])){
   const oscillator=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+offset;
   oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(.75,at+.035);gain.gain.exponentialRampToValueAtTime(.001,at+.30);
   oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+.32);
  }}catch{soundOn=false;say('Vuelve a pulsar Activar y probar sonido.');}
 }
 sound.onclick=async()=>{
  try{const Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor)throw Error('Este navegador no admite la prueba de sonido.');
   audio=audio||new Constructor();await audio.resume();soundOn=audio.state==='running';if(!soundOn)throw Error('No se pudo activar el sonido. Revisa el volumen y vuelve a intentarlo.');
   ding();say('Timbre fuerte de 3 segundos activado mientras el panel esté abierto y visible. Revisa el volumen del teléfono.');
  }catch(e){say(e.message);}
 };
 async function request(body){
  const token=await getToken();const r=await fetch(API+'/functions/v1/ruta200-push',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await r.json().catch(()=>null);if(!r.ok)throw Error(data?.error||'No se pudo configurar el aviso.');return data;
 }
 const subscription=()=>registration?.pushManager.getSubscription();
 function decode(key){const binary=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(binary,c=>c.charCodeAt(0));}
 async function getRegistration(){
  registration=await navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:'./',updateViaCache:'none'});
  const worker=registration.installing||registration.waiting;
  if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{worker.removeEventListener('statechange',change);reject(Error('La app está actualizándose. Ciérrala y vuelve a abrirla.'));},20000);
   function change(){if(worker.state==='activated'){clearTimeout(timer);worker.removeEventListener('statechange',change);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',change);reject(Error('No se pudo actualizar la app.'));}}
   worker.addEventListener('statechange',change);change();
  });
  return registration;
 }
 async function run(fn){if(working)return;working=true;controls();try{await fn();}catch(e){say(e.message);}finally{working=false;controls();}}
 activate.onclick=()=>run(async()=>{
  if(!supported)return;
  // Ask in the driver's click handler, before any network request (required on iPhone).
  const permission=await window.Notification.requestPermission();
  if(permission!=='granted'){say('Permiso no concedido. Permite las notificaciones de RUTA 200 en la configuración de tu navegador o teléfono.');return;}
  await getRegistration();let sub=await subscription();
  const config=await request({action:'config',endpoint:sub?.endpoint});
  if(sub&&sub.options?.applicationServerKey){const current=new Uint8Array(sub.options.applicationServerKey),next=decode(config.publicKey);if(current.length!==next.length||current.some((v,i)=>v!==next[i])){await sub.unsubscribe();sub=null;}}
  if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.publicKey)});
  await request({action:'subscribe',subscription:sub.toJSON()});active=true;say('Avisos activados en este celular. Pulsa «Enviar prueba» para comprobarlos.');
 });
 test.onclick=()=>run(async()=>{const sub=await subscription();if(!sub)throw Error('Vuelve a activar los avisos.');await request({action:'test',endpoint:sub.endpoint});say('Prueba enviada. Revisa las notificaciones de tu teléfono. El sonido depende de tu volumen y del modo silencio.');});
 async function unsubscribe(){
  const sub=await subscription();if(sub){try{await request({action:'unsubscribe',endpoint:sub.endpoint});}finally{await sub.unsubscribe();}}
  active=false;controls();
 }
 disable.onclick=()=>run(async()=>{await unsubscribe();say('Avisos desactivados en este celular.');});
 if(supported)navigator.serviceWorker.addEventListener('message',event=>{if(started&&event.data?.type==='r200-nueva-reserva')onReservation();});
 controls();
 return {
  updateReservations(reservations){
   const rows=Array.isArray(reservations)?reservations:[];
   if(seen===null){seen=new Set(rows.map(r=>String(r.id)));return;}
   const fresh=rows.filter(r=>r.estado==='confirmada'&&!seen.has(String(r.id)));
   for(const r of rows)seen.add(String(r.id));
   if(fresh.length){say('Nueva reservación recibida. Revisa los pasajeros de tu salida.');if(!document.hidden)ding();}
  },
  async start(){
   if(started)return;started=true;
   if(!supported){say('Este navegador no admite estos avisos. En iPhone, instala RUTA 200 y abre la app desde su ícono. En Android, usa Chrome.');return;}
   await run(async()=>{await getRegistration();const sub=await subscription();const state=await request({action:'config',endpoint:sub?.endpoint});active=!!sub&&state.active&&window.Notification.permission==='granted';say(active?'Avisos activos en este celular. Puedes enviar una prueba.':'Activa los avisos para recibir nuevas reservas de tus viajes.');});
  },
  async stop({unsubscribe:remove=false}={}){started=false;seen=null;soundOn=false;if(audio){void audio.close().catch(()=>{});audio=null;}if(remove&&registration){try{await unsubscribe();}catch{say('Se cerraron los avisos en este dispositivo.');}}active=false;controls();}
 };
}
