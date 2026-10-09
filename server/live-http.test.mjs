import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {randomBytes,pbkdf2Sync} from 'node:crypto';

test('HTTP: live changes reach two adults and the web panel; mode switch requires the family PIN',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tempo-live-'));const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const salt=randomBytes(16),pin='1357';const verifier=JSON.stringify({salt:salt.toString('base64'),hash:pbkdf2Sync(pin,salt,60000,32,'sha256').toString('base64')});
 const child=spawn(process.execPath,['server/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,IP:'127.0.0.1',HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'test',RENDER:'',TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:'',DATA_FILE:join(dir,'test.json'),FAMILY_PIN_VERIFIER:verifier},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Test server failed');})]);
  const post=async(path,data={},token='',cookie='')=>{const r=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const cfg={limit:60,enabled:true,rest:false,start:1260,end:420,apps:[],tasks:[]};const device=(await post('register',{name:'Teste',config:cfg})).data;
  const adult=(await post('pair',{code:device.code})).data;const invite=(await post('parent/invite',{},adult.token)).data;
  const adult2=(await post('pair',{code:invite.code})).data;const web=await post('web/login',{pin});assert.equal(web.status,200);
  assert.equal((await post('parent/watch',{},device.token)).status,401);
  assert.equal((await post('device/mode',{mode:'parent',pin:'0000'},device.token)).status,403);
  const snapshot=await post('web/snapshot',{},'',web.cookie);assert.equal(snapshot.data.role,'parent');
  const cursor=(await post('parent/watch',{},adult.token)).data.cursor;
  const started=Date.now(),waits=[post('parent/watch',{cursor},adult.token),post('parent/watch',{cursor},adult2.token),post('parent/watch',{cursor},'',web.cookie)];
  // A write from the protected local settings must notify all adults too.
  assert.equal((await post('parent/block',{blocked:true},device.localToken)).status,200);
  for(const pending of waits){const r=await pending;assert.equal(r.status,200);assert.equal(r.data.changed,true);assert.notEqual(r.data.cursor,cursor);}
  assert.ok(Date.now()-started<3000,'updates should not wait for the next periodic sync');
  assert.equal((await post('parent/sync',{},adult2.token)).data.config.blocked,true);
  assert.equal((await post('web/snapshot',{},'',web.cookie)).data.config.blocked,true);
  const promoted=await post('device/mode',{mode:'parent',pin},device.token);assert.equal(promoted.status,200);
  assert.equal((await post('parent/list',{},promoted.data.token)).status,200);
  const back=await post('device/mode',{mode:'child',pin,deviceToken:device.token},promoted.data.token);assert.equal(back.data.token,device.token);assert.equal(back.data.state.devices.length,1);
 }finally{child.kill();await once(child,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
