import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
const salt=randomBytes(24),pin='543210',file='outputs/pin-flow-test.json';
fs.writeFileSync(file,JSON.stringify({revision:0,data:{}}));
const child=spawn(process.execPath,['server/server.mjs'],{env:{...process.env,PORT:'8790',DATA_FILE:file,FAMILY_PIN_VERIFIER:JSON.stringify({salt:salt.toString('base64'),hash:pbkdf2Sync(pin,salt,60000,32,'sha256').toString('base64')})},stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('server exited')));});
 let cookie='';async function call(path,body={},authorized=true){const r=await fetch('http://localhost:8790/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{cookie}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
 assert.equal((await call('web/login',{pin:'000000'})).status,403);
 assert.equal((await call('web/snapshot',{},false)).status,401);
 const login=await call('web/login',{pin});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];assert.ok(login.cookie.includes('HttpOnly'));assert.equal(login.body.token,undefined);
 assert.equal((await call('web/snapshot')).body.empty,true);assert.deepEqual((await call('parent/list',{pin})).body.children,[]);
 const config={limit:90,enabled:true,rest:true,start:1260,end:420,apps:['app.game'],tasks:[]};
 const reg=await call('register',{name:'Perfil teste',config},false);assert.equal(reg.status,200);
 const pair=await call('pair',{pin,code:reg.body.code,name:'Ana'});assert.equal(pair.status,200);
 assert.equal((await call('web/snapshot')).body.name,'Ana');
 const second=await call('web/login',{pin},false);cookie=second.cookie.split(';')[0];assert.equal((await call('parent/list',{pin})).body.children.length,1);
 for(let n=0;n<20;n++)assert.equal((await call('parent/list')).status,200);assert.equal((await call('parent/app-policy',{pin,apps:['app.game'],action:'block'})).status,200);
 console.log('HTTP: PIN errado rejeitado; sessão protegida; entrada sem aparelhos; vínculo posterior; família preservada em novo login.');
}finally{child.kill();}
