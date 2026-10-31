import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
const config=JSON.parse(await readFile('site.config.json','utf8'));
const key=config.supabase?.publishableKey||'';
if(key.startsWith('sb_secret_'))throw Error('A server secret must never be placed in the browser config.');
if(key.startsWith('eyJ')){const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(claims.role!=='anon')throw Error('Only an anon/publishable key may be shipped.');}
await mkdir('dist',{recursive:true});
await build({entryPoints:['app.js'],bundle:true,outfile:'dist/app.js',format:'esm',target:['es2022'],minify:true,legalComments:'eof'});
for(const file of ['index.html','styles.css','site.config.json','.nojekyll'])await copyFile(file,'dist/'+file);
await mkdir('dist/data',{recursive:true});
const research=JSON.parse(await readFile('data/research.json','utf8'));
if(research.schemaVersion!==1||!['targets','earnings','overseas'].every(key=>Array.isArray(research[key]?.items)))throw Error('Invalid research data');
await copyFile('data/research.json','dist/data/research.json');
console.log('Built dist/. '+(config.supabase?.url?'Supabase configured.':'Hosting and database connection still required.'));
