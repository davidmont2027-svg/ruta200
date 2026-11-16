import {build} from 'esbuild';
await build({entryPoints:['detector.jsx'],bundle:true,minify:true,format:'esm',target:['es2022'],outdir:'../presencia-assets',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'}});
