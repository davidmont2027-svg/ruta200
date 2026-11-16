import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../captcha.js',import.meta.url),'utf8');
async function moduleFor(window,document){const m=new vm.SourceTextModule(source,{context:vm.createContext({window,document,setTimeout,clearTimeout,Promise,Error})});await m.link(()=>{});await m.evaluate();return m.namespace;}
let config,expired=false,resets=0;
const turnstile={render:(element,options)=>{assert.equal(element.id,'target');config=options;return 'widget-1';},isExpired:()=>expired,reset:id=>{assert.equal(id,'widget-1');resets++;}};
const mod=await moduleFor({turnstile},{getElementById:id=>({id})});const widget=mod.createCaptcha('target');await widget.ready;
assert.equal(config.sitekey,'0x4AAAAAAGDVlu-KNWklQBqL');assert.equal(config.size,'flexible');
await assert.rejects(widget.token(),/seguridad/);config.callback('fresh-token');assert.equal(await widget.token(),'fresh-token');expired=true;await assert.rejects(widget.token());expired=false;
config['expired-callback']();await assert.rejects(widget.token(),/venció/);config.callback('new-token');assert.equal(await widget.token(),'new-token');await widget.reset();assert.equal(resets,1);await assert.rejects(widget.token());config.callback('third-token');config['error-callback']();await assert.rejects(widget.token(),/conexión/);
let scriptLoads=0;const failed=await moduleFor({}, {createElement:()=>({}),getElementById:id=>({id}),head:{append:script=>{scriptLoads++;queueMicrotask(()=>script.onerror());}}});
const first=failed.createCaptcha('a'),second=failed.createCaptcha('b');await assert.rejects(first.token(),/No cargó/);await assert.rejects(second.token(),/No cargó/);assert.equal(scriptLoads,1);
console.log('Widget Turnstile: clave pública, token ausente/vencido, reinicio, error y fallo de carga compartida verificados con API simulada.');
