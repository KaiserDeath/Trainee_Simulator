import http from 'node:http';
import fs from 'node:fs';
const page=fs.readFileSync(new URL('./index.html',import.meta.url));
http.createServer((request,response)=>{
 if(!['GET','HEAD'].includes(request.method)||!['/','/index.html'].includes(new URL(request.url,'http://127.0.0.1').pathname)){response.writeHead(404);response.end();return;}
 response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(request.method==='HEAD'?undefined:page);
}).listen(4387,'127.0.0.1',()=>console.log('Design preview: http://127.0.0.1:4387'));
