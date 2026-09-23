
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {recognize,recognizeGemini,parseOcrText} from '../lib/vision.mjs';
import {randomUUID} from 'node:crypto';
async function start(t,options={}){
 const app=createApp({dbPath:':memory:',...options});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>app.server.close(r)));const url='http://127.0.0.1:'+app.server.address().port;
 const request=async(path,body,extra={})=>fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'X-Acai-App':'1','Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 return {...app,url,request};
}
test('servidor entrega telas e nunca serve arquivos privados',async t=>{
 const {request}=await start(t);assert.equal((await request('/')).status,200);assert.equal((await request('/app.js')).status,200);
 for(const p of ['/.env','/data/acai.sqlite','/android/signing/password.txt'])assert.equal((await request(p)).status,404);
 assert.equal((await request('/api/state',undefined,{Origin:'https://evil.invalid'})).status,403);
});
test('sem Gemini: OCR continua disponível sem inventar quantidades',async t=>{
 const {request,store}=await start(t,{vision:async()=>parseOcrText('Maria Silva |||')});
 const sheet=store.createSheet({name:'Folha',purchased:'2026-08-18'});
 const r=await request('/api/photos/read',{sheet:sheet.id,image:'data:image/png;base64,AAAA'});assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.source,'ocr');assert.equal(data.rows[0].total,null);assert.equal(store.snapshot().sales.length,0);
});
test('senha protege dados e cookie permite sessão autenticada',async t=>{
 const {request}=await start(t,{password:'senha-de-teste-123'});
 assert.equal((await request('/api/state')).status,401);assert.equal((await request('/api/login',{password:'errada'})).status,401);
 const login=await request('/api/login',{password:'senha-de-teste-123'});assert.equal(login.status,200);
 assert.equal((await request('/api/state',undefined,{Cookie:login.headers.get('set-cookie').split(';')[0]})).status,200);
});
test('leitura não grava antes da confirmação e protege repetição',async t=>{
 const {request,store}=await start(t,{apiKey:'test-only',vision:async()=>({source:'gemini',warning:'',rows:[{name:'Ana',total:3,uncertain:false,note:''}]})});
 const sheet=store.createSheet({name:'Folha',purchased:'2026-08-18'}),photo={sheet:sheet.id,image:'data:image/png;base64,AAAA'};
 const reading=await (await request('/api/photos/read',photo)).json();assert.equal(reading.rows[0].total,3);assert.equal(store.snapshot().sales.length,0);
 const data={draft:reading.id,purchased:'2026-08-18',reviewed:true,operation:randomUUID(),rows:reading.rows};
 const confirmed=await (await request('/api/photos/confirm',data)).json();assert.equal(confirmed.added,3);
 assert.equal((await (await request('/api/photos/confirm',data)).json()).id,confirmed.id);assert.equal((await request('/api/photos/read',photo)).status,400);
});
test('Gemini recebe imagem e JSON schema; chave não vai na URL',async()=>{
 let sent;
 const fetcher=async(url,init)=>{assert.ok(url.endsWith('gemini-3.6-flash:generateContent'));assert.ok(!url.includes('test-key'));assert.equal(init.headers['x-goog-api-key'],'test-key');sent=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({warning:'',rows:[{name:'Ana',total:3,uncertain:false,note:''}]})}]}}]})};};
 const result=await recognizeGemini('data:image/png;base64,AAAA','test-key','gemini-3.6-flash',fetcher);
 assert.equal(result.source,'gemini');assert.equal(sent.contents[0].parts[0].inlineData.mimeType,'image/png');assert.equal(sent.generationConfig.responseMimeType,'application/json');
});
test('Gemini indisponível ou ilegível aciona OCR automaticamente',async()=>{
 for(const gemini of [async()=>{throw Error('Limite atingido.');},async()=>({rows:[],warning:''})]){
  let called=0;const r=await recognize('image','key','gemini-3.6-flash',{gemini,ocr:async()=>{called++;return parseOcrText('Maria Silva |||');}});
  assert.equal(called,1);assert.equal(r.source,'ocr');assert.equal(r.rows[0].total,null);assert.equal(r.rows[0].uncertain,true);
 }
});
test('Gemini tenta outro modelo quando o primeiro falha',async()=>{
 const tried=[];const r=await recognize('image','key','gemini-3.6-flash',{gemini:async(_image,_key,model)=>{tried.push(model);if(model==='gemini-3.6-flash'){const e=Error('indisponível');e.modelStatus=503;throw e;}return {source:'gemini',warning:'',rows:[{name:'Ana',total:3,uncertain:false,note:''}]};},ocr:async()=>{throw Error('OCR não deveria ser chamado');}});
 assert.deepEqual(tried,['gemini-3.6-flash','gemini-3.8-flash']);assert.equal(r.source,'gemini');assert.equal(r.model,'gemini-3.8-flash');
});
test('a mesma foto sem mudança pode ser conferida em outro dia e gera zero novos',async t=>{
 const {request,store}=await start(t,{vision:async()=>({source:'gemini',warning:'',rows:[{name:'Ana',total:1,uncertain:false,note:''}]})});
 const c=store.saveCustomer({name:'Ana'}),sheet=store.createSheet({name:'Folha',purchased:'2026-08-18'}),image='data:image/png;base64,QUJD';
 const first=await (await request('/api/photos/read',{sheet:sheet.id,image,purchased:'2026-08-18'})).json();
 await request('/api/photos/confirm',{draft:first.id,purchased:'2026-08-18',reviewed:true,operation:randomUUID(),rows:[{customer:c.id,total:1,previous:0,matchConfirmed:true,purchased:'2026-08-18'}]});
 const next=await request('/api/photos/read',{sheet:sheet.id,image,purchased:'2026-08-19'});assert.equal(next.status,200);const review=await next.json();assert.equal(review.rows[0].previous,1);assert.equal(review.rows[0].total,1);
 const saved=await request('/api/photos/confirm',{draft:review.id,purchased:'2026-08-19',reviewed:true,operation:randomUUID(),rows:[{customer:c.id,total:1,previous:1,matchConfirmed:true,purchased:'2026-08-19'}]});assert.equal((await saved.json()).added,0);assert.equal(store.snapshot().sales.filter(s=>s.customer===c.id).length,1);
});
test('Gemini tenta outro modelo se não encontrou riscos novos e escolhe o maior total confiável',async()=>{
 const tried=[];const r=await recognize('image','key','gemini-3.6-flash',{previousTallies:{Ana:8},gemini:async(_image,_key,model,_fetcher,baseline)=>{tried.push(model);assert.equal(baseline.Ana,8);return {source:'gemini',warning:'',rows:[{name:'Ana',total:model==='gemini-3.6-flash'?8:11,uncertain:false,note:''}]};},ocr:async()=>{throw Error('OCR não deveria ser chamado');}});
 assert.deepEqual(tried,['gemini-3.6-flash','gemini-3.8-flash']);assert.equal(r.rows[0].total,11);assert.equal(r.model,'gemini-3.8-flash');
});
test('falha de autenticação Gemini vai direto para OCR sem repetir com outras versões',async()=>{
 let calls=0;const r=await recognize('image','key','gemini-3.6-flash',{gemini:async()=>{calls++;const e=Error('chave inválida');e.modelStatus=403;throw e;},ocr:async()=>parseOcrText('Maria Silva |||')});
 assert.equal(calls,1);assert.equal(r.source,'ocr');assert.match(r.warning,/chave inválida/);
});
test('foto lida abaixo do acumulado fica para revisão e nunca reduz vendas anteriores',async t=>{
 const {request,store}=await start(t,{vision:async()=>({source:'gemini',model:'gemini-3.8-flash',warning:'',rows:[{name:'Maria Silva',total:2,uncertain:false,note:''}]})});
 const c=store.saveCustomer({name:'Maria Silva'}),sheet=store.createSheet({name:'Folha',purchased:'2026-08-18'});
 store.commit({sheet:sheet.id,hash:'1'.repeat(64),purchased:'2026-08-18',operation:randomUUID(),reviewed:true,rows:[{customer:c.id,total:4,previous:0,matchConfirmed:true}]});
 const result=await request('/api/photos/read',{sheet:sheet.id,image:'data:image/png;base64,AAAA'}),data=await result.json();
 assert.equal(result.status,200);assert.equal(data.rows[0].previous,4);assert.equal(data.rows[0].total,2);assert.equal(data.rows[0].uncertain,true);assert.match(data.rows[0].note,/abaixo dos 4 já confirmados/);assert.equal(data.model,'gemini-3.8-flash');
 assert.equal(store.snapshot().sales.reduce((sum,s)=>sum+s.qty,0),4);assert.equal(store.balances().reduce((sum,s)=>sum+s.cents,0),4000);
});
test('leitura vinculada a cliente existente compara pelo ID e lança somente diferença positiva',async t=>{
 let seenBaseline;
 const {request,store}=await start(t,{vision:async(_image,_key,_model,{previousTallies})=>{seenBaseline=previousTallies;return {source:'gemini',model:'gemini-3.8-flash',warning:'',rows:[{name:'Joao S.',total:3,uncertain:false,note:''}]};}});
 const c=store.saveCustomer({name:'João Silva'}),sheet=store.createSheet({name:'Folha',purchased:'2026-08-18'});
 // Establish two confirmed tally marks for this sheet.
 store.commit({sheet:sheet.id,hash:'2'.repeat(64),purchased:'2026-08-18',operation:randomUUID(),reviewed:true,rows:[{customer:c.id,total:2,previous:0,matchConfirmed:true}]});
 const read=await request('/api/photos/read',{sheet:sheet.id,image:'data:image/png;base64,Ag=='}),draft=await read.json();
 assert.equal(seenBaseline['João Silva'],2);assert.equal(draft.rows[0].matchedCustomer,'');
 // OCR spelling differs; operator explicitly selects the existing customer ID.
 const confirmed=await request('/api/photos/confirm',{draft:draft.id,purchased:'2026-08-18',reviewed:true,operation:randomUUID(),rows:[{customer:c.id,name:'Joao S.',total:3,previous:2,matchConfirmed:true,purchased:'2026-08-18'}]});
 assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).added,1);
 const sales=store.snapshot().sales.filter(s=>s.customer===c.id);assert.equal(sales.reduce((n,s)=>n+s.qty,0),3);assert.equal(store.totals(sheet.id).find(x=>x.customer===c.id).qty,3);
});
test('cliente existente com dívida recebe débito somado, não substituído',async t=>{
 const {request,store}=await start(t,{vision:async()=>({source:'gemini',warning:'',rows:[{name:'Ana',total:3,uncertain:false,note:''}]})});
 const c=store.saveCustomer({name:'Ana'}),sheet=store.createSheet({name:'Folha',purchased:'2026-08-18'});
 store.commit({sheet:sheet.id,hash:'3'.repeat(64),purchased:'2026-08-18',operation:randomUUID(),reviewed:true,rows:[{customer:c.id,total:2,previous:0,matchConfirmed:true}]});
 store.sale({customer:c.id,qty:3,purchased:'2026-08-19',operation:randomUUID()});
 assert.equal(store.balances().filter(s=>s.customer===c.id).reduce((n,s)=>n+s.cents,0),5000);
 const reading=await (await request('/api/photos/read',{sheet:sheet.id,image:'data:image/png;base64,Aw=='})).json();
 const result=await request('/api/photos/confirm',{draft:reading.id,purchased:'2026-08-18',reviewed:true,operation:randomUUID(),rows:[{customer:c.id,name:'Ana',total:3,previous:2,matchConfirmed:true,purchased:'2026-08-18'}]});
 assert.equal((await result.json()).added,1);assert.equal(store.balances().filter(s=>s.customer===c.id).reduce((n,s)=>n+s.cents,0),6000);
});
test('leitura igual ao acumulado não cria venda nova',async t=>{
 const {request,store}=await start(t,{vision:async()=>({source:'gemini',warning:'',rows:[{name:'Ana',total:2,uncertain:false,note:''}]})});
 const c=store.saveCustomer({name:'Ana'}),sheet=store.createSheet({name:'Folha',purchased:'2026-08-18'});
 store.commit({sheet:sheet.id,hash:'4'.repeat(64),purchased:'2026-08-18',operation:randomUUID(),reviewed:true,rows:[{customer:c.id,total:2,previous:0,matchConfirmed:true}]});
 const reading=await (await request('/api/photos/read',{sheet:sheet.id,image:'data:image/png;base64,BA=='})).json();
 const result=await request('/api/photos/confirm',{draft:reading.id,purchased:'2026-08-18',reviewed:true,operation:randomUUID(),rows:[{customer:c.id,name:'Ana',total:2,previous:2,matchConfirmed:true,purchased:'2026-08-18'}]});
 assert.equal((await result.json()).added,0);assert.equal(store.snapshot().sales.filter(s=>s.customer===c.id).reduce((n,s)=>n+s.qty,0),2);
});
test('sucesso do Gemini preserva contagem sem chamar OCR',async()=>{
 let calls=0;const r=await recognize('image','key','gemini-3.6-flash',{gemini:async()=>({source:'gemini',warning:'',rows:[{name:'Ana',total:3,uncertain:false,note:''}]}),ocr:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(r.rows[0].total,3);
});
test('sem chave usa OCR e nunca tenta Gemini',async()=>{
 let calls=0;const r=await recognize('image','','gemini-3.6-flash',{gemini:async()=>{calls++;},ocr:async()=>parseOcrText('Maria Silva |||\nJoão Lima 111')});
 assert.equal(calls,0);assert.equal(r.source,'ocr');assert.ok(r.rows.every(x=>x.total===null));
});
test('OCR não transforma valores monetários ou letras em número de compras',()=>{
 const r=parseOcrText('Nome\nMaria Silva ||||\nJoão Lima 10,00\nTotal 30');assert.equal(r.rows.length,2);assert.ok(r.rows.every(x=>x.total===null&&x.uncertain));assert.ok(r.rawText.includes('10,00'));
});
test('resposta incompleta e limite do Gemini são tratados',async()=>{
 await assert.rejects(recognizeGemini('data:image/png;base64,AAAA','key','gemini-3.6-flash',async()=>({ok:false,status:429})),/limite/);
 await assert.rejects(recognizeGemini('data:image/png;base64,AAAA','key','gemini-3.6-flash',async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}]})})),/concluiu/);
});
