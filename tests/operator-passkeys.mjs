import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../operator-passkeys.js',import.meta.url),'utf8');
async function fixture({supported=true,enabled=true}={}){
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:''});return nodes.get(id);};
 let settings=enabled,calls=[],signed=[],busy=false,nextError=null;
 const session={access_token:'operator-access',refresh_token:'operator-refresh',expires_at:Math.floor(Date.now()/1000)+3600};
 const context=vm.createContext({Date,Number,Error,AbortSignal,isSecureContext:supported,PublicKeyCredential:supported?class{}:undefined,navigator:supported?{credentials:{}}:undefined,document:{getElementById:get},fetch:async()=>({ok:true,json:async()=>({passkeys_enabled:settings})})});
 const fakeClient=()=>({auth:{setSession:async value=>{calls.push(['setSession',value]);return {data:{session},error:null};},registerPasskey:async()=>{calls.push(['register']);return {data:{id:'test'},error:nextError};},signInWithPasskey:async value=>{calls.push(['signIn',value]);return {data:{session},error:nextError};}}});
 const sdk=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',fakeClient);},{context});await sdk.link(()=>{});await sdk.evaluate();
 const module=new vm.SourceTextModule(source,{context,importModuleDynamically:async()=>sdk});await module.link(()=>new vm.SyntheticModule(['API','KEY'],function(){this.setExport('API','https://example.supabase.co');this.setExport('KEY','public-test');},{context}));await module.evaluate();
 const control=module.namespace.setupOperatorPasskeys({getSession:async()=>session,canRegister:()=>true,canStart:()=>!busy,getCaptcha:async()=>'captcha-test',onBusy:value=>{busy=value;},onSession:async value=>signed.push(value)});await control.check();
 return {get,calls,signed,setError:error=>{nextError=error;},control,module};
}
const disabled=await fixture({enabled:false});assert.equal(disabled.get('entrar-huella').disabled,true);await disabled.get('entrar-huella').onclick();assert.equal(disabled.calls.length,0);
const unsupported=await fixture({supported:false});assert.equal(unsupported.get('activar-huella').disabled,true);
const app=await fixture();assert.equal(app.get('entrar-huella').disabled,false);await app.get('entrar-huella').onclick();assert.equal(app.signed.length,1);assert.equal(app.calls[0][1].options.captchaToken,'captcha-test');assert.ok(app.signed[0].expires_at>Date.now());
await app.get('activar-huella').onclick();assert.equal(app.calls[1][0],'setSession');assert.equal(app.calls[2][0],'register');assert.match(app.get('estado-activar-huella').textContent,/activada/);
app.setError({name:'NotAllowedError'});await app.get('entrar-huella').onclick();assert.equal(app.signed.length,1);assert.match(app.get('estado-huella').textContent,/canceló/);
assert.match(app.module.namespace.passkeyError({code:'passkey_disabled'}),/pendiente/);
assert.throws(()=>app.module.namespace.passkeySession({}),/sesión/);
console.log('Huella: bloqueo si no está activada o soportada, CAPTCHA conservado, sesión verificada, registro autenticado y cancelación sin iniciar sesión: verificados.');
