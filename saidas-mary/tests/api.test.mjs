
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
