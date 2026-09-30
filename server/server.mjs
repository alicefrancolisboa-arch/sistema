import http from 'node:http';
import fs from 'node:fs/promises';
import {storage} from './storage.mjs';
import {operation,hash} from './domain.mjs';
const store=await storage();let queue=Promise.resolve();const limits=new Map();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(code,value)=>{res.writeHead(code);res.end(JSON.stringify(value));};
  if(req.url==='/'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile(new URL('./index.html',import.meta.url)));return;}
  if(req.url==='/Tempo-de-Crescer.apk'&&req.method==='GET'){try{const apk=await fs.readFile(new URL('./Tempo-de-Crescer.apk',import.meta.url));res.setHeader('Content-Type','application/vnd.android.package-archive');res.setHeader('Content-Disposition','attachment; filename="Tempo-de-Crescer.apk"');res.end(apk);}catch{reply(404,{error:'APK em preparação.'});}return;}
  if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true,persistent:store.persistent,app:'Tempo de Crescer'});
  if(req.method!=='POST'||!req.url.startsWith('/api/'))return reply(404,{error:'Rota não encontrada.'});
  const sensitive=['/api/register','/api/pair'].includes(req.url);const address=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();const rateKey=hash(sensitive?address:address+String(req.headers.authorization||''));const now=Date.now();let bucket=limits.get(rateKey)||{n:0,start:now};if(now-bucket.start>60000)bucket={n:0,start:now};limits.set(rateKey,bucket);if(++bucket.n>(sensitive?15:180))return reply(429,{error:'Muitas tentativas. Aguarde um minuto.'});if(limits.size>10000)for(const[k,b]of limits)if(now-b.start>60000)limits.delete(k);
  try {let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536){reply(413,{error:'Solicitação muito grande.'});return;}}const body=JSON.parse(raw||'{}');if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Invalid JSON');
    const work=queue.then(async()=>{const {data,revision}=await store.load();const result=operation(data,req.url,body,String(req.headers.authorization||'').replace(/^Bearer /,''));await store.save(data,revision);return result;});queue=work.catch(()=>{});reply(200,await work);
  }catch(e){reply(e.status||503,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'});}
});server.requestTimeout=30000;server.listen(Number(process.env.PORT||8788),'0.0.0.0',()=>console.log('Tempo de Crescer: servidor iniciado; persistência='+store.persistent));
