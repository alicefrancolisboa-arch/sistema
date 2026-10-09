import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FamilyLive,parentFamily,affectedFamily} from './live.mjs';
import {operation,hash} from './domain.mjs';

function fixture(){const db={};const run=(p,b={},token='')=>operation(db,'/api/'+p,b,token);const c=run('register',{name:'Teste',config:{limit:60,enabled:true,rest:false,start:1260,end:420,apps:[],tasks:[]}});const p=run('pair',{code:c.code});return {db,run,c,p};}
test('only a parent can subscribe to its own family',()=>{
 const {db,c,p}=fixture();const f=parentFamily(db,p.token);
 assert.equal(affectedFamily(db,c.token),f);
 for(const token of ['',c.token,c.localToken,'invalid'])assert.throws(()=>parentFamily(db,token),e=>e.status===401);
});
test('change reaches every waiting parent, without waking another family',async()=>{
 const hub=new FamilyLive(35);const a=hub.wait('a',hub.cursor('a')),b=hub.wait('a',hub.cursor('a')),other=hub.wait('b',hub.cursor('b'));
 hub.changed('a');assert.equal((await a).changed,true);assert.equal((await b).changed,true);assert.equal((await other).changed,false);
 assert.equal(hub.entry('a').waiters.size,0);
});
test('missed changes and restart are detected; disconnected clients are removed',async()=>{
 const hub=new FamilyLive(50),old=hub.cursor('a');hub.changed('a');assert.equal((await hub.wait('a',old)).changed,true);
 assert.equal((await new FamilyLive().wait('a',hub.cursor('a'))).changed,true);
 const controller=new AbortController(),waiting=hub.wait('a',hub.cursor('a'),controller.signal);controller.abort();assert.equal((await waiting).changed,false);assert.equal(hub.entry('a').waiters.size,0);
});
test('child switches to parent and returns without losing original device or rules',()=>{
 const {db,run,c,p}=fixture();const family=parentFamily(db,p.token),original=JSON.stringify(db.children[c.childId].config);
 const adult=run('device/mode',{mode:'parent',childId:c.childId},c.token);assert.equal(parentFamily(db,adult.token),family);
 const back=run('device/mode',{mode:'child',deviceToken:c.token,childId:c.childId},adult.token);
 assert.equal(back.token,c.token);assert.equal(back.role,'child');assert.equal(db.children[c.childId].devices.length,1);
 assert.equal(JSON.stringify(back.config),original);assert.equal(back.state.otherUsed,0);
});
test('parent becomes a new child device in the selected profile; return reuses it',()=>{
 const {db,run,c,p}=fixture();const child=run('device/mode',{mode:'child',childId:c.childId},p.token);
 assert.equal(db.children[c.childId].devices.length,2);assert.equal(db.tokens[hash(child.localToken)].role,'local');
 const adult=run('device/mode',{mode:'parent'},child.token);
 const back=run('device/mode',{mode:'child',deviceToken:child.token},adult.token);assert.equal(back.token,child.token);assert.equal(db.children[c.childId].devices.length,2);
});
test('switching mode cannot cross family boundaries or promote unpaired devices',()=>{
 const {db,run,c,p}=fixture();const other=run('register',{name:'Outra',config:db.children[c.childId].config});run('pair',{code:other.code});
 assert.throws(()=>run('device/mode',{mode:'child',childId:other.childId},p.token),e=>e.status===403);
 const unpaired=run('register',{name:'Sem vínculo',config:db.children[c.childId].config});assert.throws(()=>run('device/mode',{mode:'parent'},unpaired.token),/Vincule/);
});
