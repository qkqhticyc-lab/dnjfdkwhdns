import{copyFile}from'node:fs/promises';
for(const file of ['risk-levels.mjs','quotes-core.mjs','chart-price.mjs','technical-core.mjs','reversal-core.mjs','chart-guide-core.mjs','strategy-core.mjs','live-chart-core.mjs'])await copyFile(file,'supabase/functions/stock-chart/'+file);
console.log('Synced live chart dependencies');
