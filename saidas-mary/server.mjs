
import http from 'node:http';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join,dirname } from 'node:path';
import { randomBytes,createHash,timingSafeEqual,randomUUID } from 'node:crypto';
import { CloudStore } from './lib/cloud-store.mjs';
import { Store,norm } from './lib/store.mjs';
import { recognize } from './lib/vision.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function createApp({dbPath=join(process.env.DATA_DIR||join(root,'data'),'acai.sqlite'),apiKey=process.env.GEMINI_API_KEY||'',password=process.env.APP_PASSWORD||'',model=process.env.GEMINI_MODEL||'gemini-3.6-flash',vision=recognize,cloud=null}={}){
 if(!cloud&&dbPath!==':memory:')mkdirSync(dirname(dbPath),{recursive:true});
 const store=cloud||new Store(dbPath),sessions=new Map(),drafts=new Map(),attempts=new Map();
 let reading=false;
 const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=')));
 const authenticated=req=>!password || (sessions.get(cookies(req).acai_session)||0)>Date.now();
 const samePassword=value=>{const a=createHash('sha256').update(String(value||'')).digest(),b=createHash('sha256').update(password).digest();return timingSafeEqual(a,b);};
 const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
 async function body(req){
  let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16*1024*1024)throw Error('Arquivo muito grande. Escolha uma foto menor.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Dados inválidos.');}
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
   if(req.url==='/healthz'&&['GET','HEAD'].includes(req.method))return send(res,200,{ok:true,app:'saidas-mary'});
   const host=req.headers.host||'',local=/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
   if(!password&&!local)return send(res,403,{error:'Defina uma senha antes de permitir acesso pela rede.'});
   if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{return send(res,403,{error:'Origem inválida.'});}if(origin.host!==host)return send(res,403,{error:'Acesso de outra origem não permitido.'});}
   const url=new URL(req.url,'http://'+host),path=url.pathname;
   if(path==='/api/login'&&req.method==='POST'){
    if(req.headers['x-acai-app']!=='1')return send(res,403,{error:'Abra o aplicativo para entrar.'});
    const ip=req.socket.remoteAddress,entry=attempts.get(ip)||{count:0,until:Date.now()+600000};
    if(entry.until<Date.now()){entry.count=0;entry.until=Date.now()+600000;}
    if(entry.count>=10)return send(res,429,{error:'Muitas tentativas. Aguarde dez minutos.'});
    const b=await body(req);if(!samePassword(b.password)){entry.count++;attempts.set(ip,entry);return send(res,401,{error:'Senha incorreta.'});}
    attempts.delete(ip);for(const [id,expires]of sessions)if(expires<Date.now())sessions.delete(id);
    const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+12*3600000);
    return send(res,200,{ok:true},{'Set-Cookie':'acai_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+(process.env.COOKIE_SECURE==='true'?'; Secure':'')});
   }
   if(path.startsWith('/api/')){
    if(!authenticated(req))return send(res,401,{error:'Entre com a senha da loja.'});
    if(req.method!=='GET' && req.headers['x-acai-app']!=='1')return send(res,403,{error:'Abra o aplicativo para fazer alterações.'});
    if(path==='/api/state'&&req.method==='GET')return send(res,200,{...await store.snapshot(),visionReady:true,geminiConfigured:!!apiKey,ocrReady:true,protected:!!password,model});
    if(path==='/api/backup'&&req.method==='GET')return send(res,200,await store.backup(),{'Content-Disposition':'attachment; filename="acai-backup-'+new Date().toISOString().slice(0,10)+'.json"'});
    if(req.method!=='POST')return send(res,404,{error:'Página não encontrada.'});
    const b=await body(req);
    if(path==='/api/customers/archive')return send(res,200,await store.archiveCustomer(b));
    if(path==='/api/stock/daily')return send(res,200,await store.saveDailyStock(b));
    if(path==='/api/stock/complements')return send(res,200,await store.saveComplement(b));
    if(path==='/api/customers')return send(res,200,await store.saveCustomer(b));
    if(path==='/api/sales')return send(res,200,await store.sale(b));
    if(path==='/api/payments')return send(res,200,await store.payment(b));
    if(path==='/api/payments/undo')return send(res,200,await store.undoPayment(b.id));
    if(path==='/api/sheets')return send(res,200,await store.createSheet(b));
    if(path==='/api/holidays')return send(res,200,await store.setExtras(b.dates));
    if(path==='/api/vision/key'){
     if(typeof b.key!=='string'||b.key.length<20||b.key.length>1000)throw Error('Informe uma chave válida da API.');
     apiKey=b.key.trim();return send(res,200,{ok:true});
    }
    if(path==='/api/restore'){
     if(b.confirm!=='RESTAURAR')throw Error('Confirme a restauração.');
     if(!cloud&&dbPath!==':memory:')writeFileSync(join(dirname(dbPath),'antes-restauracao-'+Date.now()+'.json'),JSON.stringify(store.backup()));
     const result=await store.restore(b.backup);drafts.clear();return send(res,200,result);
    }
    if(path==='/api/photos/read'){
     const sheet=await store.sheet(b.sheet);
     if(typeof b.image!=='string'||b.image.length>14000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image))throw Error('Escolha uma imagem JPG, PNG ou WebP com até 10 MB.');
     const raw=Buffer.from(b.image.split(',')[1],'base64'),hash=createHash('sha256').update(raw).digest('hex');
     if(await store.imported(hash))throw Error('Esta foto já foi contabilizada. Envie uma foto atualizada da mesma folha.');
     if(reading)return send(res,429,{error:'Uma foto já está sendo lida. Aguarde a conclusão.'});
     for(const [id,d]of drafts)if(d.expires<Date.now())drafts.delete(id);
     if(drafts.size>=20)throw Error('Há muitas leituras em revisão. Conclua uma delas ou aguarde.');
     reading=true;let result;
     try{result=await vision(b.image,apiKey,model);}finally{reading=false;}
     const customers=(await store.snapshot()).customers,totals=await store.totals(sheet.id),id=randomUUID();
     drafts.set(id,{sheet:sheet.id,hash,expires:Date.now()+3600000});
     return send(res,200,{id,source:result.source||'gemini',rawText:result.rawText||'',warning:result.warning,rows:result.rows.map(r=>{
      const match=customers.find(c=>norm(c.name)===norm(r.name));
      return {...r,matchedCustomer:match?.id||'',customer:'',previous:totals.find(t=>t.customer===match?.id)?.qty||0};
     })});
    }
    if(path==='/api/photos/confirm'){
     const draft=drafts.get(b.draft);
     if(!draft||draft.expires<Date.now())throw Error('Esta leitura expirou. Envie a foto novamente.');
     const result=await store.commit({...b,sheet:draft.sheet,hash:draft.hash});return send(res,200,result);
    }
    return send(res,404,{error:'Página não encontrada.'});
   }
   if(path==='/baixar-apk' && req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="Saidas-Mary.apk"','Cache-Control':'no-cache'});
    return res.end(readFileSync(join(root,'dist','Saidas-Mary.apk')));
   }
   const routes={'/':'public/index.html','/app.js':'public/app.js','/styles.css':'public/styles.css','/dates.mjs':'lib/dates.mjs','/manifest.webmanifest':'public/manifest.webmanifest','/icon.svg':'public/icon.svg','/sw.js':'public/sw.js'};
   if(!routes[path]||!['GET','HEAD'].includes(req.method))return send(res,404,{error:'Página não encontrada.'});
   const mime=path.endsWith('.css')?'text/css':path.endsWith('.js')||path.endsWith('.mjs')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.webmanifest')?'application/manifest+json':'text/html';
   res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'});
   res.end(req.method==='HEAD'?undefined:readFileSync(join(root,routes[path])));
  }catch(e){send(res,e.status||400,{error:e.name==='TimeoutError'?'A leitura demorou demais. Tente uma foto mais nítida.':e.message.includes('SQLITE')?'Não foi possível salvar. Confira os dados.':e.message});}
 });
 server.on('close',()=>store.close());return {server,store};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
 const host=process.env.HOST||(process.env.RENDER?'0.0.0.0':'127.0.0.1'),port=Number(process.env.PORT||3210),password=process.env.APP_PASSWORD||'';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&password.length<6)throw Error('Defina APP_PASSWORD com pelo menos 6 caracteres para acesso pela rede.');
 const useCloud=process.env.STORAGE_DRIVER==='turso';
 if(process.env.RENDER&&!useCloud&&!process.env.DATA_DIR)throw Error('Configure o banco Turso antes de usar o Render gratuito.');
 if(useCloud&&(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN))throw Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no Render.');
 const cloud=useCloud?new CloudStore({url:process.env.TURSO_DATABASE_URL,token:process.env.TURSO_AUTH_TOKEN}):null;
 if(cloud)await cloud.ready();
 const {server}=createApp({cloud});server.listen(port,host,()=>console.log('Saídas Mary disponível em http://'+host+':'+port+' — leitura de fotos: '+(process.env.GEMINI_API_KEY?'Gemini configurado + OCR local':'OCR local; Gemini ainda não configurado')));
}
