import{copyFile}from'node:fs/promises';
for(const name of['club-core.mjs','quotes-core.mjs','chart-price.mjs'])await copyFile(name,'supabase/functions/club-board/'+name);
console.log('Synced club function modules.');
