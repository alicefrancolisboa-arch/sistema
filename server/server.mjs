import http from 'node:http';
import fs from 'node:fs/promises';
import {storage} from './storage.mjs';
import {operation,hash} from './domain.mjs';
import {checkWebPin,cookieToken,originAllowed} from './web-auth.mjs';
const store=await storage();let queue=Promise.resolve();const limits=new Map();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  const reply=(code,value)=>{res.writeHead(code);res.end(JSON.stringify(value));};
  if(req.url==='/painel'&&req.method==='GET'){try{res.setHeader('Content-Type','text/html; charset=utf-8');let html=await fs.readFile(new URL('./mobile.html',import.meta.url),'utf8');html=html.replace("script-src 'unsafe-inline'","script-src 'self' 'unsafe-inline'").replace("connect-src 'none'","connect-src 'self'").replace('<script>','<script src="/web-bridge.js"></script><script>');res.end(html);}catch{reply(503,{error:'Painel em preparação.'});}return;}
  if(req.url==='/web-bridge.js'&&req.method==='GET'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await fs.readFile(new URL('./web-bridge.js',import.meta.url)));return;}
  if(req.url==='/mobile-bundle.json'&&req.method==='GET'){try{res.end(await fs.readFile(new URL('./mobile-bundle.json',import.meta.url)));}catch{reply(503,{error:'Painel em preparação.'});}return;}
  if(req.url==='/crest.jpg'&&req.method==='GET'){try{res.setHeader('Content-Type','image/jpeg');res.end(await fs.readFile(new URL('./crest.jpg',import.meta.url)));}catch{reply(404,{error:'Imagem indisponível.'});}return;}
  if(req.url==='/'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile(new URL('./index.html',import.meta.url)));return;}
  if(req.url==='/Tempo-de-Crescer.apk'&&req.method==='GET'){try{const apk=await fs.readFile(new URL('./Tempo-de-Crescer.apk',import.meta.url));res.setHeader('Content-Type','application/vnd.android.package-archive');res.setHeader('Content-Disposition','attachment; filename="Tempo-de-Crescer.apk"');res.end(apk);}catch{reply(404,{error:'APK em preparação.'});}return;}
  if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true,persistent:store.persistent,app:'Tempo de Crescer'});
  if(req.method!=='POST'||!req.url.startsWith('/api/'))return reply(404,{error:'Rota não encontrada.'});
  if(!originAllowed(req))return reply(403,{error:'Origem não autorizada.'});
  const cookie=cookieToken(req);const sensitive=['/api/register','/api/pair','/api/web/pair'].includes(req.url)||!!cookie&&req.url.startsWith('/api/parent/');const address=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();const rateKey=hash(sensitive?address:address+String(req.headers.authorization||''));const now=Date.now();let bucket=limits.get(rateKey)||{n:0,start:now};if(now-bucket.start>60000)bucket={n:0,start:now};limits.set(rateKey,bucket);if(++bucket.n>(sensitive?15:180))return reply(429,{error:'Muitas tentativas. Aguarde um minuto.'});if(limits.size>10000)for(const[k,b]of limits)if(now-b.start>60000)limits.delete(k);
  try {let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536){reply(413,{error:'Solicitação muito grande.'});return;}}const body=JSON.parse(raw||'{}');if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Invalid JSON');
    const webPair=req.url==='/api/web/pair',webSnapshot=req.url==='/api/web/snapshot';const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'')||cookie;
    if((webPair||cookie&&!webSnapshot)&&!checkWebPin(body.pin))return reply(403,{error:'PIN incorreto.'});
    const work=queue.then(async()=>{const {data,revision}=await store.load();if(webSnapshot&&data.tokens?.[hash(bearer)]?.role!=='parent')throw Object.assign(Error('Entre como responsável.'),{status:401});const result=operation(data,webPair?'/api/pair':webSnapshot?'/api/parent/sync':req.url,body,webPair?'':bearer);await store.save(data,revision);if(webPair){res.setHeader('Set-Cookie',`family_session=${result.token}; Path=/; HttpOnly; ${process.env.RENDER?'Secure; ':''}SameSite=Strict; Max-Age=2592000`);delete result.token;}if(webSnapshot)return {...result,role:'parent',lastSync:Date.now()};return result;});queue=work.catch(()=>{});reply(200,await work);
  }catch(e){reply(e.status||503,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'});}
});server.requestTimeout=30000;server.listen(Number(process.env.PORT||8788),'0.0.0.0',()=>console.log('Tempo de Crescer: servidor iniciado; persistência='+store.persistent));
