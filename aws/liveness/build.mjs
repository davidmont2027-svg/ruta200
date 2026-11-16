import {build} from 'esbuild';
await build({entryPoints:['index.mjs'],bundle:true,minify:true,platform:'node',format:'esm',target:'node26',outfile:'dist/index.mjs',legalComments:'linked',banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"}});
