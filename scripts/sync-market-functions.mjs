import{copyFile}from'node:fs/promises';
for(const[dir,files]of [['market-flow',['scripts/market-core.mjs','options-core.mjs','edge-cache.mjs']],['market-indicators',['live-indicators-core.mjs','edge-cache.mjs']]])for(const file of files)await copyFile(file,`supabase/functions/${dir}/${file.split('/').at(-1)}`);
console.log('Market function dependencies synchronized.');
