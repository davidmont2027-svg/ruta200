import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../operator-passkeys.js',import.meta.url),'utf8');
async function fixture({supported=true,enabled=true}={}){
 const nodes=new Map(),calls=[],signed=[],native=[];let busy=false,nextError=null;
 const get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:''});return nodes.get(id);};
 const session={access_token:'operator-access',refresh_token:'operator-refresh',expires_at:Math.floor(Date.now()/1000)+3600};
 const credential={toJSON:()=>({id:'test-credential',type:'public-key',response:{clientDataJSON:'YQ'}})};
 const context=vm.createContext({Date,Number,Error,Promise,Uint8Array,atob,btoa,AbortSignal,isSecureContext:supported,PublicKeyCredential:supported?class{}:undefined,navigator:supported?{credentials:{create:()=>{native.push('create');return Promise.resolve(credential);},get:()=>{native.push('get');return Promise.resolve(credential);}}}:undefined,document:{getElementById:get},fetch:async()=>({ok:true,json:async()=>({passkeys_enabled:enabled})})});
 const fakeClient=()=>({auth:{setSession:async value=>{calls.push(['setSession',value]);return {data:{session},error:null};},passkey:{startRegistration:async()=>{calls.push(['startRegistration']);return {data:{challenge_id:'register-id',options:{challenge:'YQ',user:{id:'Yg'}}}};},startAuthentication:async value=>{calls.push(['startAuthentication',value]);return {data:{challenge_id:'signin-id',options:{challenge:'YQ'}}};},verifyRegistration:async value=>{calls.push(['verifyRegistration',value]);return {data:{id:'test'},error:nextError};},verifyAuthentication:async value=>{calls.push(['verifyAuthentication',value]);return {data:{session},error:nextError};}}}});
 const sdk=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',fakeClient);},{context});await sdk.link(()=>{});await sdk.evaluate();
 const module=new vm.SourceTextModule(source,{context,importModuleDynamically:async()=>sdk});await module.link(()=>new vm.SyntheticModule(['API','KEY'],function(){this.setExport('API','https://example.supabase.co');this.setExport('KEY','public-test');},{context}));await module.evaluate();
 const control=module.namespace.setupOperatorPasskeys({getSession:async()=>session,canRegister:()=>true,canStart:()=>!busy,getCaptcha:async()=>'captcha-test',onBusy:value=>{busy=value;},onSession:async value=>signed.push(value)});await control.check();return {get,calls,signed,native,setError:e=>{nextError=e;},control,module};
}
const disabled=await fixture({enabled:false});assert.equal(disabled.get('entrar-huella').disabled,true);await disabled.get('entrar-huella').onclick();assert.equal(disabled.calls.length,0);
const unsupported=await fixture({supported:false});assert.equal(unsupported.get('activar-huella').disabled,true);
const app=await fixture();await app.get('entrar-huella').onclick();assert.equal(app.signed.length,0);assert.equal(app.native.length,0);assert.equal(app.calls[0][1].options.captchaToken,'captcha-test');
const verification=app.get('entrar-huella').onclick();assert.deepEqual(app.native,['get']);await verification;assert.equal(app.signed.length,1);assert.ok(app.signed[0].expires_at>Date.now());assert.equal(app.calls[1][1].challengeId,'signin-id');
await app.get('activar-huella').onclick();assert.equal(app.native.length,1);const registration=app.get('activar-huella').onclick();assert.equal(app.native[1],'create');await registration;assert.match(app.get('estado-activar-huella').textContent,/registrada y confirmada/);
app.setError({cause:{name:'NotAllowedError'}});await app.get('entrar-huella').onclick();await app.get('entrar-huella').onclick();assert.equal(app.signed.length,1);assert.match(app.get('estado-huella').textContent,/Chrome/);
assert.match(app.module.namespace.passkeyError({code:'passkey_disabled'}),/pendiente/);assert.match(app.module.namespace.passkeyError({message:'Completa la comprobación de seguridad'}),/seguridad/);assert.throws(()=>app.module.namespace.passkeySession({}),/sesión/);
console.log('Huella: desafío y CAPTCHA primero, selector nativo inmediato en segundo toque, verificación del servidor, registro confirmado y mensajes específicos: verificados.');
