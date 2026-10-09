import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {storage} from './storage.mjs';
import {operation,day} from './domain.mjs';

function harness() {
  const db=new DatabaseSync(':memory:');
  const requests=[];
  let fail=false;
  const env={TURSO_DATABASE_URL:'libsql://test.invalid',TURSO_AUTH_TOKEN:'test-only'};
  const fetch=async(url,options)=>{
    if(fail)throw Error('offline');
    const {stmt}=JSON.parse(options.body).requests[0];
    requests.push({sql:stmt.sql,bytes:Buffer.byteLength(options.body)});
    const prepared=db.prepare(stmt.sql),args=stmt.args.map(a=>a.value);
    let result;
    if(prepared.columns().length){
      prepared.setReturnArrays(true);
      result={rows:prepared.all(...args).map(row=>row.map(v=>v===null?{type:'null'}:{type:typeof v==='number'?'integer':'text',value:String(v)}))};
    } else result={affected_row_count:Number(prepared.run(...args).changes)};
    return {ok:true,json:async()=>({results:[{type:'ok',response:{result}}]})};
  };
  return {db,requests,open:()=>storage({env,fetch}),offline:v=>{fail=v;},read:()=>JSON.parse(db.prepare('SELECT payload FROM tempo_family_store').get().payload)};
}

test('unchanged reads neither write nor transfer the full payload again',async()=>{
  const h=harness(),s=await h.open(),first=await s.load();
  first.data.devices={a:{catalog:[{icon:'x'.repeat(500000)}],used:0}};
  await s.save(first.data,first.revision);
  const start=h.requests.length;
  for(let i=0;i<10;i++){const current=await s.load();await s.save(current.data,current.revision);}
  assert.equal(h.requests.length-start,10);
  assert.ok(h.requests.slice(start).every(r=>r.sql.startsWith('SELECT')&&r.bytes<1000));
  assert.equal(h.db.prepare('SELECT revision FROM tempo_family_store').get().revision,1);
});

test('small updates preserve icons, nulls, arrays, deleted keys and unrelated families',async()=>{
  const h=harness(),s=await h.open(),initial=await s.load();
  initial.data.devices={a:{catalog:[{icon:'x'.repeat(20000)}],activity:{app:{package:'app.game'}},used:0}};
  initial.data.children={a:{config:{release:{until:10},appLabels:{'app.game':'Jogo'}},history:[]},b:{name:'Outro'}};
  await s.save(initial.data,initial.revision);
  const current=await s.load();
  current.data.devices.a.used=300;
  current.data.devices.a.activity.app=null;
  delete current.data.children.a.config.release;
  current.data.children.a.config.appLabels['app.game']='Novo nome';
  current.data.children.a.history.push({day:'2026-10-08',used:300});
  await s.save(current.data,current.revision);
  assert.deepEqual(h.read(),current.data);
  assert.ok(h.requests.at(-1).sql.startsWith('WITH RECURSIVE'));
  assert.ok(h.requests.at(-1).bytes<2000);
});

test('another instance sees committed commands and rejects stale writes atomically',async()=>{
  const h=harness(),a=await h.open(),seed=await a.load();
  seed.data={padding:'x'.repeat(30000),config:{blocked:false},used:0};
  await a.save(seed.data,seed.revision);
  const b=await h.open(),stale=await b.load(),fresh=await a.load();
  fresh.data.config.blocked=true;
  await a.save(fresh.data,fresh.revision);
  stale.data.used=100;
  await assert.rejects(()=>b.save(stale.data,stale.revision),/Conflito/);
  assert.deepEqual(h.read(),fresh.data);
  const refreshed=await b.load();
  assert.equal(refreshed.data.config.blocked,true);
  refreshed.data.used=200;
  await b.save(refreshed.data,refreshed.revision);
  assert.equal(h.read().used,200);
  assert.equal(h.read().config.blocked,true);
});

test('restart reloads all data and outages do not serve cached state or lose writes',async()=>{
  const h=harness(),a=await h.open(),seed=await a.load();
  seed.data={padding:'x'.repeat(5000),used:10};
  await a.save(seed.data,seed.revision);
  const b=await h.open();assert.deepEqual((await b.load()).data,seed.data);
  h.offline(true);await assert.rejects(()=>b.load(),/offline/);
  h.offline(false);const change=await b.load();change.data.used=20;
  h.offline(true);await assert.rejects(()=>b.save(change.data,change.revision),/offline/);
  assert.equal(h.read().used,10);
  h.offline(false);assert.equal((await b.load()).data.used,10);
  assert.deepEqual((await a.load()).data,seed.data);
});

test('mutations from failed operations cannot contaminate the cached baseline',async()=>{
  const h=harness(),s=await h.open(),first=await s.load();
  first.data.config={blocked:false};await s.save(first.data,first.revision);
  const failed=await s.load();failed.data.config.blocked=true;
  assert.equal((await s.load()).data.config.blocked,false);
});

test('unusual JSON property names and bulk updates use a lossless snapshot fallback',async()=>{
  const h=harness(),s=await h.open(),first=await s.load();
  first.data={padding:'x'.repeat(10000),fields:{}};await s.save(first.data,first.revision);
  let current=await s.load();current.data.fields['a"b']=null;
  await s.save(current.data,current.revision);assert.deepEqual(h.read(),current.data);
  assert.ok(h.requests.at(-1).sql.startsWith('UPDATE'));
  current=await s.load();delete current.data.fields['a"b'];
  for(let i=0;i<150;i++)current.data.fields['k'+i]=i;
  await s.save(current.data,current.revision);assert.deepEqual(h.read(),current.data);
});

test('family sync, midnight history and approvals persist with much less outbound traffic',async()=>{
  const h=harness(),s=await h.open();
  let now=Date.parse('2026-10-08T18:00:00Z');
  const run=async(path,body={},token='')=>{
    const current=await s.load(),result=operation(current.data,'/api/'+path,body,token,now);
    await s.save(current.data,current.revision);return result;
  };
  const config={limit:120,enabled:true,rest:false,start:0,end:1,apps:['app.game'],tasks:[{id:'read',title:'Ler',minutes:15}]};
  const child=await run('register',{config}),parent=await run('pair',{code:child.code});
  const catalog=Array.from({length:250},(_,i)=>({package:'app.p'+i,name:'App '+i,icon:'data:image/webp;base64,'+'A'.repeat(1800)}));
  await run('child/sync',{day:day(now),used:0,catalog},child.token);
  const start=h.requests.length;
  let originalBytes=0;
  for(let i=1;i<=50;i++){
    now+=10000;
    originalBytes+=Buffer.byteLength(JSON.stringify(h.read()));
    await run('child/sync',{day:day(now),used:i*1000,activity:null,catalog},child.token);
    await run('parent/sync',{},parent.token);
  }
  const actual=h.requests.slice(start).reduce((n,r)=>n+r.bytes,0);
  assert.ok(actual<originalBytes*0.05,`Traffic ${actual} vs ${originalBytes}`);
  console.log(`Sync benchmark: ${actual} outbound bytes vs ${originalBytes} snapshot bytes (50 child + 50 parent syncs)`);
  await run('child/claim',{taskId:'read'},child.token);
  assert.equal((await run('parent/approve',{taskId:'read'},parent.token)).state.bonus,15);
  assert.equal((await run('parent/approve',{taskId:'read'},parent.token)).state.bonus,15);
  now+=86400000;
  const next=await run('parent/sync',{},parent.token);
  assert.equal(next.history[0].used,50000);assert.equal(next.history[0].bonus,15);
  assert.equal(next.state.used,0);assert.equal(next.state.bonus,0);
  assert.equal(h.read().devices[Object.keys(h.read().devices)[0]].catalog.length,250);
});

test('production still refuses to run without durable storage',async()=>{
  await assert.rejects(()=>storage({env:{RENDER:'true'}}),/Produção exige/);
});
