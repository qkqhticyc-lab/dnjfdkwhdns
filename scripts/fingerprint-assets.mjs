import{readFile,writeFile,readdir}from'node:fs/promises';
import{createHash}from'node:crypto';import{join}from'node:path';
const hash=content=>createHash('sha256').update(content).digest('hex').slice(0,12);
export async function fingerprintAssets(directory){
 const htmlFiles=(await readdir(directory)).filter(f=>f.endsWith('.html')),pages=await Promise.all(htmlFiles.map(async name=>({name,content:await readFile(join(directory,name),'utf8')}))),assets={};
 const refs=new Set(pages.flatMap(p=>[...p.content.matchAll(/(?:src|href)="\.\/([^"?]+\.(?:js|css))(?:\?[^"]*)?"/g)].map(m=>m[1])));
 for(const name of [...refs].sort()){const content=await readFile(join(directory,name));const versioned=name.replace(/\.(js|css)$/,'.'+hash(content)+'.$1');await writeFile(join(directory,versioned),content);assets[name]=versioned;}
 const revision=hash(JSON.stringify(assets));
 for(const page of pages){const content=page.content.replace(/((?:src|href)=")\.\/([^"?]+\.(?:js|css))(?:\?[^"]*)?"/g,(_match,start,name)=>`${start}./${assets[name]}"`).replace('</head>',`<meta name="app-version" content="${revision}"></head>`);await writeFile(join(directory,page.name),content);}
 await writeFile(join(directory,'asset-version.json'),JSON.stringify({revision,assets}));return{revision,assets};
}
