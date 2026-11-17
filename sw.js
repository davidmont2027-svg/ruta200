// Network-only: never store sessions, tickets, availability or API responses in Cache Storage.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const offlineHTML=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Sin conexión | RUTA 200</title><style>body{margin:0;background:#11140f;color:#f5efdf;font:17px/1.7 system-ui;min-height:100vh;display:grid;place-items:center}main{max-width:430px;padding:30px}strong{color:#efc66d;letter-spacing:2px}h1{font-size:32px;line-height:1.2}a{display:block;background:#efc66d;color:#18170f;border-radius:12px;text-align:center;padding:13px;font-weight:700;text-decoration:none}p{color:#d5d0be}</style></head><body><main><strong>RUTA 200</strong><h1>Volvamos a conectar.</h1><p>Necesitas internet para consultar lugares, reservar y ver información actualizada de tu viaje.</p><p>Esta pantalla no confirma ninguna reservación. Recupera la conexión y vuelve a abrir tu página.</p><a href="">Volver a intentar</a></main></body></html>`;
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith(fetch(request).catch(()=>new Response(offlineHTML,{status:503,statusText:'Offline',headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
