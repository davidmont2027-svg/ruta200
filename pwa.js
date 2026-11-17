// Optional installation UI. Reservation and authentication modules remain independent.
const box=document.querySelector('[data-app-install]');
const button=box?.querySelector('[data-install-button]');
const help=box?.querySelector('details');
const status=box?.querySelector('[data-install-status]');
let deferred=null;
const standalone=window.matchMedia('(display-mode: standalone)');
function installed(){return standalone.matches||navigator.standalone===true;}
function sync(){if(box)box.hidden=installed();}
function say(text){if(status)status.textContent=text;}
sync();
standalone.addEventListener?.('change',sync);
window.addEventListener('beforeinstallprompt',event=>{
 if(!button)return;
 event.preventDefault();deferred=event;button.textContent='Instalar RUTA 200';
});
window.addEventListener('appinstalled',()=>{deferred=null;if(box)box.hidden=true;});
if(button)button.addEventListener('click',async()=>{
 if(!deferred){if(help)help.open=true;say('Sigue las instrucciones para tu navegador. Si abriste el enlace dentro de otra app, ábrelo primero en Chrome o Safari.');return;}
 const event=deferred;deferred=null;button.disabled=true;
 try{
  await event.prompt();const choice=await event.userChoice;
  say(choice.outcome==='accepted'?'Instalación solicitada. Revisa la confirmación de tu navegador.':'Puedes instalarla después desde el menú de tu navegador.');
 }catch{if(help)help.open=true;say('Usa el menú de tu navegador para instalar RUTA 200.');}
 finally{button.disabled=false;button.textContent='Cómo instalar RUTA 200';}
});
// Only a connection warning; the server remains the source of truth for every booking.
const offline=document.createElement('p');offline.className='app-offline';offline.role='status';offline.hidden=true;
offline.textContent='Sin conexión. Necesitas internet para consultar lugares, reservar y confirmar cambios.';
document.body.prepend(offline);
function connection(){offline.hidden=navigator.onLine!==false;}
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
if('serviceWorker' in navigator&&window.isSecureContext){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:'./',updateViaCache:'none'}).catch(()=>{
   say('La instalación no pudo prepararse. Puedes seguir usando la página y volver a intentarlo después.');
  });
 });
}
