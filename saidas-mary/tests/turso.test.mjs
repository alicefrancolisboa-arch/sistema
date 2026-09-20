import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {CloudStore} from '../lib/cloud-store.mjs';
import {createApp} from '../server.mjs';
function remote(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());let fail=false,lost=false;
 const fetcher=async(url,options)=>{
  assert.equal(url,'https://mary-test.turso.io/v2/pipeline');assert.equal(options.headers.Authorization,'Bearer test-token');
  if(fail)throw Error('provider private test-token');
  const stmt=JSON.parse(options.body).requests[0].stmt,q=db.prepare(stmt.sql),args=stmt.args.map(a=>a.type==='integer'?Number(a.value):a.value);
  let rows=[],changed=0,cols=[];
  if(stmt.sql.startsWith('SELECT')){rows=q.all(...args);cols=q.columns().map(c=>({name:c.name}));}
  else changed=Number(q.run(...args).changes);
  if(lost&&stmt.sql.startsWith('UPDATE')){lost=false;throw Error('response lost after commit');}
  return {ok:true,json:async()=>({results:[{type:'ok',response:{result:{affected_row_count:changed,cols,rows:rows.map(r=>cols.map(c=>r[c.name]===null?{type:'null'}:{type:typeof r[c.name]==='number'?'integer':'text',value:String(r[c.name])}))}}}]})};
 };
 const open=()=>new CloudStore({url:'libsql://mary-test.turso.io',token:'test-token',fetcher});
 return {db,open,fail:()=>{fail=true},recover:()=>{fail=false},lose:()=>{lost=true}};
}
test('Turso: reinício e dois dispositivos mantêm clientes, vendas e pagamentos',async t=>{
 const r=remote(t),a=r.open();const c=await a.saveCustomer({name:'Maria'});await a.sale({customer:c.id,qty:3,purchased:'2026-08-19',operation:'sale-1'});a.close();
 const b=r.open();assert.equal((await b.snapshot()).sales.length,1);await b.payment({customer:c.id,cents:1000,paid:'2026-08-20',operation:'pay-1'});
 assert.equal((await r.open().snapshot()).balances.reduce((n,s)=>n+s.cents,0),2000);
});
test('Turso: gravações concorrentes não apagam uma à outra',async t=>{
 const r=remote(t);await Promise.all([r.open().saveCustomer({name:'Maria'}),r.open().saveCustomer({name:'Joana'})]);assert.equal((await r.open().snapshot()).customers.length,2);
});
test('Turso: resposta perdida e repetição não duplicam venda',async t=>{
 const r=remote(t),a=r.open(),c=await a.saveCustomer({name:'Maria'}),input={customer:c.id,qty:2,purchased:'2026-08-19',operation:'retry-sale'};
 r.lose();await assert.rejects(a.sale(input),e=>e.status===503);await r.open().sale(input);assert.equal((await r.open().snapshot()).sales.length,1);
});
test('Turso: indisponibilidade não vira loja vazia nem sucesso falso',async t=>{
 const r=remote(t),a=r.open();await a.saveCustomer({name:'Maria'});r.fail();await assert.rejects(a.snapshot(),e=>e.status===503&&!e.message.includes('test-token'));await assert.rejects(a.saveCustomer({name:'Joana'}));r.recover();assert.equal((await a.snapshot()).customers.length,1);
});
test('Turso: restauração guarda versão anterior e rejeita backup inválido',async t=>{
 const r=remote(t),a=r.open();await a.saveCustomer({name:'Maria'});const backup=await a.backup();await a.saveCustomer({name:'Joana'});await a.restore(backup);
 assert.equal((await a.snapshot()).customers.length,1);assert.equal(JSON.parse(r.db.prepare('SELECT previous_payload FROM mary_state').get().previous_payload).tables.customers.length,2);
 await assert.rejects(a.restore({}));assert.equal((await a.snapshot()).customers.length,1);
});
test('API usa armazenamento remoto e confirma somente após persistir',async t=>{
 const r=remote(t),{server}=createApp({cloud:r.open()});await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const url='http://127.0.0.1:'+server.address().port;
 const create=()=>fetch(url+'/api/customers',{method:'POST',headers:{'Content-Type':'application/json','X-Acai-App':'1'},body:JSON.stringify({name:'Maria'})});
 assert.equal((await create()).status,200);assert.equal((await r.open().snapshot()).customers.length,1);
 r.fail();assert.equal((await fetch(url+'/api/state')).status,503);assert.equal((await create()).status,503);
});
