import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('dist'),port=5183;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/preview\//,'/');if(name==='/')name='/index.html';const full=path.resolve(root,'.'+name);if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':types[path.extname(full)]||'text/plain','Cache-Control':'no-store'});fs.createReadStream(full).pipe(res);}catch{res.writeHead(400);res.end();}}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/preview/`));
